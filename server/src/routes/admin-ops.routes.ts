import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { getStoreSettings } from "../services/store.service";
import { normalizePostalPrefixes } from "../services/shipping-zone.service";
import { getInvoiceWithOrder } from "../services/invoice.service";
import { ensureCreditNoteForCancelledOrder, ensureCreditNoteForReturn } from "../services/credit-note.service";
import { refundRazorpayPayment } from "../services/payment.service";
import { sendOrderStatusNotification, sendReturnStatusNotification } from "../services/notification.service";
import { createOrderStatusInAppNotification, createReturnStatusInAppNotification, createUserNotification } from "../services/notification-center.service";
import { approveOrderCancellationRequest } from "../services/order-cancellation.service";
import { reverseRefundedOrderRewards } from "../services/rewards.service";
import { adjustInventory } from "../services/inventory.service";
import { deliveryPromiseHealth } from "../services/delivery-promise.service";

const router = Router();
router.use(requireAuth, requireAdmin);

const settingsSchema = z.object({
  storeName: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().max(160).nullable().optional(),
  supportEmail: z.string().trim().email().nullable().optional(),
  supportPhone: z.string().trim().max(30).nullable().optional(),
  gstin: z.string().trim().max(30).nullable().optional(),
  pan: z.string().trim().max(20).nullable().optional(),
  addressLine1: z.string().trim().max(180).nullable().optional(),
  addressLine2: z.string().trim().max(180).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().max(100).optional(),
  invoicePrefix: z.string().trim().min(2).max(20).optional(),
  creditNotePrefix: z.string().trim().min(2).max(20).optional(),
  freeShippingThreshold: z.number().nonnegative().nullable().optional(),
  flatShippingFee: z.number().nonnegative().optional(),
  codFee: z.number().nonnegative().optional(),
  codEnabled: z.boolean().optional(),
  codMinOrderAmount: z.number().nonnegative().nullable().optional(),
  codMaxOrderAmount: z.number().nonnegative().nullable().optional(),
  maxOpenCodOrdersPerCustomer: z.number().int().min(1).max(100).nullable().optional(),
  dispatchWithinDays: z.number().int().min(0).max(30).optional(),
  deliveryMinDays: z.number().int().min(1).max(45).optional(),
  deliveryMaxDays: z.number().int().min(1).max(60).optional(),
  lowStockUrgencyThreshold: z.number().int().min(1).max(100).optional(),
  requireServiceablePostalCode: z.boolean().optional(),
  returnsEnabled: z.boolean().optional(),
  returnWindowDays: z.number().int().min(0).max(90).optional(),
  returnPolicy: z.string().trim().max(10000).nullable().optional(),
  shippingPolicy: z.string().trim().max(10000).nullable().optional(),
  privacyPolicy: z.string().trim().max(20000).nullable().optional(),
  privacyPolicyVersion: z.string().trim().min(1).max(40).optional(),
  termsPolicy: z.string().trim().max(20000).nullable().optional(),
  brandTagline: z.string().trim().max(240).nullable().optional(),
  logoUrl: z.string().trim().max(1000).nullable().optional().refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid logo URL"),
  logoMarkUrl: z.string().trim().max(1000).nullable().optional().refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid logo mark URL"),
  logoAlt: z.string().trim().max(160).nullable().optional(),
  announcementText: z.string().trim().max(180).nullable().optional(),
  announcementSecondary: z.string().trim().max(180).nullable().optional(),
  maintenanceEnabled: z.boolean().optional(),
  maintenanceMessage: z.string().trim().max(1000).nullable().optional(),
  maintenanceStartsAt: z.coerce.date().nullable().optional(),
  maintenanceEndsAt: z.coerce.date().nullable().optional(),
  siteUrl: z.string().trim().url().nullable().optional(),
  seoTitle: z.string().trim().max(120).nullable().optional(),
  seoDescription: z.string().trim().max(320).nullable().optional(),
  aboutTitle: z.string().trim().max(180).nullable().optional(),
  aboutBody: z.string().trim().max(12000).nullable().optional(),
  contactIntro: z.string().trim().max(2000).nullable().optional(),
  instagramUrl: z.string().trim().url().nullable().optional(),
  facebookUrl: z.string().trim().url().nullable().optional(),
  youtubeUrl: z.string().trim().url().nullable().optional(),
  whatsappNumber: z.string().trim().max(30).nullable().optional(),
});

router.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const settings = await getStoreSettings();
    res.json({ success: true, data: settings });
  }),
);

router.patch(
  "/settings",
  asyncHandler(async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return res.status(400).json({ success: false, message: "Invalid store settings", errors: parsed.success ? undefined : parsed.error.flatten() });
    }
    const currentSettings = await getStoreSettings();
    const nextCodMin = parsed.data.codMinOrderAmount !== undefined ? parsed.data.codMinOrderAmount : currentSettings.codMinOrderAmount == null ? null : Number(currentSettings.codMinOrderAmount);
    const nextCodMax = parsed.data.codMaxOrderAmount !== undefined ? parsed.data.codMaxOrderAmount : currentSettings.codMaxOrderAmount == null ? null : Number(currentSettings.codMaxOrderAmount);
    if (nextCodMin != null && nextCodMax != null && nextCodMin > nextCodMax) {
      return res.status(400).json({ success: false, message: "COD minimum amount cannot be higher than the COD maximum amount" });
    }
    const nextMaintenanceStart = parsed.data.maintenanceStartsAt !== undefined ? parsed.data.maintenanceStartsAt : currentSettings.maintenanceStartsAt;
    const nextMaintenanceEnd = parsed.data.maintenanceEndsAt !== undefined ? parsed.data.maintenanceEndsAt : currentSettings.maintenanceEndsAt;
    if (nextMaintenanceStart && nextMaintenanceEnd && nextMaintenanceStart >= nextMaintenanceEnd) {
      return res.status(400).json({ success: false, message: "Maintenance end time must be after the start time" });
    }
    const settings = await prisma.storeSetting.update({ where: { id: "primary" }, data: parsed.data });
    res.json({ success: true, data: settings });
  }),
);

const shippingZoneSchema = z.object({
  name: z.string().trim().min(2).max(100),
  postalPrefixes: z.array(z.string().trim().regex(/^\d{2,6}$/)).min(1).max(200),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  shippingFee: z.number().nonnegative().nullable().optional(),
  freeShippingThreshold: z.number().nonnegative().nullable().optional(),
  codAllowed: z.boolean().default(true),
  codFee: z.number().nonnegative().nullable().optional(),
  codMaxOrderAmount: z.number().nonnegative().nullable().optional(),
  dispatchWithinDays: z.number().int().min(0).max(30).nullable().optional(),
  deliveryMinDays: z.number().int().min(1).max(45).nullable().optional(),
  deliveryMaxDays: z.number().int().min(1).max(60).nullable().optional(),
  maxWeightGrams: z.number().int().positive().max(100000).nullable().optional(),
  preferredShippingPartnerId: z.string().uuid().nullable().optional(),
  priority: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
const shippingZonePatchSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  postalPrefixes: z.array(z.string().trim().regex(/^\d{2,6}$/)).min(1).max(200).optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  shippingFee: z.number().nonnegative().nullable().optional(),
  freeShippingThreshold: z.number().nonnegative().nullable().optional(),
  codAllowed: z.boolean().optional(),
  codFee: z.number().nonnegative().nullable().optional(),
  codMaxOrderAmount: z.number().nonnegative().nullable().optional(),
  dispatchWithinDays: z.number().int().min(0).max(30).nullable().optional(),
  deliveryMinDays: z.number().int().min(1).max(45).nullable().optional(),
  deliveryMaxDays: z.number().int().min(1).max(60).nullable().optional(),
  maxWeightGrams: z.number().int().positive().max(100000).nullable().optional(),
  preferredShippingPartnerId: z.string().uuid().nullable().optional(),
  priority: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

router.get(
  "/shipping-zones",
  asyncHandler(async (_req, res) => {
    const zones = await prisma.shippingZone.findMany({ include: { preferredShippingPartner: true }, orderBy: [{ priority: "desc" }, { name: "asc" }] });
    res.json({ success: true, data: zones });
  }),
);

router.post(
  "/shipping-zones",
  asyncHandler(async (req, res) => {
    const parsed = shippingZoneSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid delivery zone", errors: parsed.error.flatten() });
    const prefixes = normalizePostalPrefixes(parsed.data.postalPrefixes);
    if (!prefixes.length) return res.status(400).json({ success: false, message: "Add at least one valid PIN prefix" });
    const minDays = parsed.data.deliveryMinDays ?? null;
    const maxDays = parsed.data.deliveryMaxDays ?? null;
    if (minDays != null && maxDays != null && minDays > maxDays) return res.status(400).json({ success: false, message: "Delivery minimum days cannot exceed maximum days" });
    if (parsed.data.preferredShippingPartnerId) {
      const partner = await prisma.shippingPartner.findFirst({ where: { id: parsed.data.preferredShippingPartnerId, isActive: true } });
      if (!partner) return res.status(400).json({ success: false, message: "Choose an active preferred courier" });
    }
    const zone = await prisma.shippingZone.create({ data: { ...parsed.data, postalPrefixes: prefixes, city: parsed.data.city || null, state: parsed.data.state || null }, include: { preferredShippingPartner: true } });
    res.status(201).json({ success: true, data: zone });
  }),
);

router.patch(
  "/shipping-zones/:id",
  asyncHandler(async (req, res) => {
    const parsed = shippingZonePatchSchema.safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, message: "Invalid delivery-zone update", errors: parsed.success ? undefined : parsed.error.flatten() });
    const data: any = { ...parsed.data };
    if (parsed.data.postalPrefixes) {
      data.postalPrefixes = normalizePostalPrefixes(parsed.data.postalPrefixes);
      if (!data.postalPrefixes.length) return res.status(400).json({ success: false, message: "Add at least one valid PIN prefix" });
    }
    if (parsed.data.city !== undefined) data.city = parsed.data.city || null;
    if (parsed.data.state !== undefined) data.state = parsed.data.state || null;
    const existing = await prisma.shippingZone.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) return res.status(404).json({ success: false, message: "Delivery zone not found" });
    const minDays = parsed.data.deliveryMinDays !== undefined ? parsed.data.deliveryMinDays : existing.deliveryMinDays;
    const maxDays = parsed.data.deliveryMaxDays !== undefined ? parsed.data.deliveryMaxDays : existing.deliveryMaxDays;
    if (minDays != null && maxDays != null && minDays > maxDays) return res.status(400).json({ success: false, message: "Delivery minimum days cannot exceed maximum days" });
    if (parsed.data.preferredShippingPartnerId) {
      const partner = await prisma.shippingPartner.findFirst({ where: { id: parsed.data.preferredShippingPartnerId, isActive: true } });
      if (!partner) return res.status(400).json({ success: false, message: "Choose an active preferred courier" });
    }
    const zone = await prisma.shippingZone.update({ where: { id: String(req.params.id) }, data, include: { preferredShippingPartner: true } });
    res.json({ success: true, data: zone });
  }),
);

router.delete(
  "/shipping-zones/:id",
  asyncHandler(async (req, res) => {
    await prisma.shippingZone.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true });
  }),
);

router.get(
  "/shipping-partners",
  asyncHandler(async (_req, res) => {
    const partners = await prisma.shippingPartner.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    res.json({ success: true, data: partners });
  }),
);

const partnerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase().replace(/\s+/g, "_")),
  trackingUrlTemplate: z.string().trim().max(500).optional().or(z.literal("")),
  supportsCod: z.boolean().default(true),
  maxWeightGrams: z.number().int().positive().max(100000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

router.post(
  "/shipping-partners",
  asyncHandler(async (req, res) => {
    const parsed = partnerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid courier partner", errors: parsed.error.flatten() });
    const partner = await prisma.shippingPartner.create({
      data: {
        name: parsed.data.name,
        code: parsed.data.code,
        trackingUrlTemplate: parsed.data.trackingUrlTemplate || null,
        supportsCod: parsed.data.supportsCod,
        maxWeightGrams: parsed.data.maxWeightGrams ?? null,
        sortOrder: parsed.data.sortOrder,
      },
    });
    res.status(201).json({ success: true, data: partner });
  }),
);

router.patch(
  "/shipping-partners/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      name: z.string().trim().min(2).max(100).optional(),
      trackingUrlTemplate: z.string().trim().max(500).nullable().optional(),
      isActive: z.boolean().optional(),
      supportsCod: z.boolean().optional(),
      maxWeightGrams: z.number().int().positive().max(100000).nullable().optional(),
      sortOrder: z.number().int().min(0).max(999).optional(),
    }).safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, message: "Invalid courier update" });
    const partner = await prisma.shippingPartner.update({ where: { id: String(req.params.id) }, data: parsed.data });
    res.json({ success: true, data: partner });
  }),
);

router.get(
  "/dispatch",
  asyncHandler(async (req, res) => {
    const requested = typeof req.query.status === "string" ? req.query.status : "PROCESSING";
    const status = ["CONFIRMED", "PROCESSING"].includes(requested) ? requested as "CONFIRMED" | "PROCESSING" : "PROCESSING";
    const orders = await prisma.order.findMany({
      where: { status },
      include: { items: { include: { variant: { select: { weightGrams: true } } } }, payment: true },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    const data = orders.map((order) => {
      const address = order.shippingAddress as any;
      const totalWeightGrams = order.items.reduce((sum, item) => sum + Number(item.variant?.weightGrams || 0) * item.quantity, 0);
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerEmail: order.customerEmail,
        addressLine1: address?.line1 || "",
        addressLine2: address?.line2 || "",
        landmark: address?.landmark || "",
        city: address?.city || "",
        state: address?.state || "",
        postalCode: address?.postalCode || "",
        country: address?.country || "India",
        shippingZoneName: order.shippingZoneName || "",
        paymentMethod: order.paymentMethod,
        codAmount: order.paymentMethod === "COD" ? Number(order.totalAmount) : 0,
        totalAmount: Number(order.totalAmount),
        totalWeightGrams,
        skuSummary: order.items.map((item) => `${item.sku}x${item.quantity}`).join(" | "),
      };
    });
    res.json({ success: true, data });
  }),
);

router.get(
  "/fulfilment/overview",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const openStatuses = ["CONFIRMED", "PROCESSING"] as const;
    const orders = await prisma.order.findMany({
      where: { status: { in: [...openStatuses] } },
      include: { payment: true, cancellationRequest: true, items: { include: { variant: { select: { weightGrams: true } } } } },
      orderBy: [{ dispatchDueAt: "asc" }, { createdAt: "asc" }],
      take: 300,
    });
    const enriched = orders.map((order) => {
      const estimate = order.deliveryEstimate && typeof order.deliveryEstimate === "object" && !Array.isArray(order.deliveryEstimate) ? order.deliveryEstimate as Record<string, unknown> : null;
      const fallbackDays = Math.max(0, Number(estimate?.dispatchWithinDays || 2));
      const dispatchDueAt = order.dispatchDueAt || new Date(order.createdAt.getTime() + fallbackDays * 24 * 60 * 60 * 1000);
      const totalWeightGrams = Number(estimate?.totalWeightGrams || order.items.reduce((sum, item) => sum + Math.max(0, Number(item.variant?.weightGrams || 0)) * item.quantity, 0));
      const overdue = dispatchDueAt.getTime() < now.getTime();
      const dueSoon = !overdue && dispatchDueAt.getTime() <= next24h.getTime();
      return {
        id: order.id, orderNumber: order.orderNumber, status: order.status, customerName: order.customerName, customerPhone: order.customerPhone, paymentMethod: order.paymentMethod, paymentStatus: order.payment?.status || "PENDING", totalAmount: Number(order.totalAmount), shippingZoneName: order.shippingZoneName, createdAt: order.createdAt, dispatchDueAt, totalWeightGrams, preferredShippingPartnerName: typeof estimate?.preferredShippingPartnerName === "string" ? estimate.preferredShippingPartnerName : null, cancellationPending: Boolean(order.cancellationRequest && ["REQUESTED", "APPROVED"].includes(order.cancellationRequest.status)), overdue, dueSoon,
      };
    });
    const [inTransit, promiseHealth] = await Promise.all([
      prisma.order.count({ where: { status: "SHIPPED" } }),
      deliveryPromiseHealth(),
    ]);
    const exceptionEvents = await prisma.shipmentEvent.findMany({
      where: { type: { in: ["EXCEPTION", "RTO_INITIATED"] }, eventAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } },
      include: { shipment: { include: { order: { select: { id: true, orderNumber: true, status: true, customerName: true } } } } },
      orderBy: { eventAt: "desc" },
      take: 30,
    });
    const activeExceptions = exceptionEvents.filter((event) => event.shipment.order.status === "SHIPPED").map((event) => ({ id: event.id, orderId: event.shipment.order.id, orderNumber: event.shipment.order.orderNumber, customerName: event.shipment.order.customerName, type: event.type, title: event.title, note: event.note, location: event.location, eventAt: event.eventAt }));
    res.json({ success: true, data: {
      counts: { awaiting: enriched.filter((row) => row.status === "CONFIRMED").length, processing: enriched.filter((row) => row.status === "PROCESSING").length, overdue: enriched.filter((row) => row.overdue).length, dueSoon: enriched.filter((row) => row.dueSoon).length, inTransit, exceptions: activeExceptions.length },
      orders: enriched, exceptions: activeExceptions, deliveryPromiseHealth: promiseHealth,
    } });
  }),
);

router.get(
  "/invoices/:orderId",
  asyncHandler(async (req, res) => {
    try {
      const data = await getInvoiceWithOrder(String(req.params.orderId));
      res.json({ success: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "INVOICE_FAILED";
      if (message === "ORDER_NOT_FOUND") return res.status(404).json({ success: false, message: "Order not found" });
      if (message === "INVOICE_NOT_AVAILABLE") return res.status(409).json({ success: false, message: "Invoice is not available for this order yet" });
      if (message === "INVOICE_TAX_SETUP_INCOMPLETE") return res.status(409).json({ success: false, message: "Configure GSTIN and seller state in Store Settings before issuing an invoice with GST rates" });
      throw error;
    }
  }),
);

router.get(
  "/cancellations",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const requests = await prisma.orderCancellationRequest.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        order: { include: { payment: true, shipment: true, items: true } },
      },
      orderBy: { requestedAt: "desc" },
      take: 300,
    });
    res.json({ success: true, data: requests });
  }),
);

router.patch(
  "/cancellations/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      action: z.enum(["APPROVE", "REJECT"]),
      adminNote: z.string().trim().max(1000).optional().or(z.literal("")),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid cancellation decision" });

    const request = await prisma.orderCancellationRequest.findUnique({
      where: { id: String(req.params.id) },
      include: { order: true, user: true },
    });
    if (!request) return res.status(404).json({ success: false, message: "Cancellation request not found" });
    if (request.status !== "REQUESTED") return res.status(409).json({ success: false, message: "This cancellation request has already been resolved" });

    if (parsed.data.action === "REJECT") {
      const updated = await prisma.orderCancellationRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", adminNote: parsed.data.adminNote || null, resolvedAt: new Date() },
      });
      await createUserNotification({
        userId: request.userId,
        title: `Cancellation request update for ${request.order.orderNumber}`,
        message: parsed.data.adminNote || "Your cancellation request could not be approved because the order has progressed further in fulfilment.",
        type: "ORDER",
        ctaLabel: "View order",
        ctaUrl: `/orders/${request.order.orderNumber}`,
        metadata: { orderId: request.orderId, cancellationRequestId: request.id, status: "REJECTED" },
        dedupeKey: `cancellation-decision/${request.id}/${request.requestedAt.toISOString()}/REJECTED`,
      });
      return res.json({ success: true, data: updated });
    }

    try {
      const order = await approveOrderCancellationRequest(request.id, parsed.data.adminNote || null);
      if (order?.payment?.status === "REFUNDED") { try { await ensureCreditNoteForCancelledOrder(order.id); } catch (error) { console.error("Cancellation credit note issuance failed", error); } }
      if (order) {
        void sendOrderStatusNotification(order).catch((error) => console.error("Cancellation email failed", error));
        void createOrderStatusInAppNotification(order).catch((error) => console.error("Cancellation in-app notification failed", error));
      }
      return res.json({ success: true, data: order });
    } catch (error) {
      const message = error instanceof Error ? error.message : "CANCELLATION_FAILED";
      if (["CANCELLATION_NOT_FOUND", "ORDER_NOT_FOUND"].includes(message)) return res.status(404).json({ success: false, message: "Cancellation request or order was not found" });
      if (message === "CANCELLATION_NOT_PENDING") return res.status(409).json({ success: false, message: "This cancellation request is no longer pending" });
      if (message === "ORDER_TOO_FAR_ALONG") return res.status(409).json({ success: false, message: "This order has already moved too far in fulfilment to cancel" });
      if (message === "PAYMENT_NOT_REFUNDABLE") return res.status(409).json({ success: false, message: "The online payment is not currently refundable" });
      if (message === "PAYMENT_REFUND_FAILED") return res.status(502).json({ success: false, message: "Razorpay could not complete the refund. The cancellation remains pending and no stock was restored." });
      throw error;
    }
  }),
);

router.get(
  "/returns",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const returns = await prisma.returnRequest.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        order: { include: { payment: true, shipment: true } },
        items: { include: { orderItem: true } },
        evidence: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { requestedAt: "desc" },
      take: 300,
    });
    res.json({ success: true, data: returns });
  }),
);

router.get(
  "/returns/:id",
  asyncHandler(async (req, res) => {
    const item = await prisma.returnRequest.findUnique({
      where: { id: String(req.params.id) },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        order: { include: { payment: true, shipment: true } },
        items: { include: { orderItem: true } },
        evidence: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!item) return res.status(404).json({ success: false, message: "Return request not found" });
    res.json({ success: true, data: item });
  }),
);

const returnStatuses = ["REQUESTED", "APPROVED", "REJECTED", "PICKUP_PENDING", "IN_TRANSIT", "RECEIVED", "REFUNDED", "CANCELLED"] as const;
const allowedReturnTransitions: Record<string, string[]> = {
  REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PICKUP_PENDING", "IN_TRANSIT", "RECEIVED", "CANCELLED"],
  PICKUP_PENDING: ["IN_TRANSIT", "RECEIVED"],
  IN_TRANSIT: ["RECEIVED"],
  RECEIVED: ["REFUNDED"],
  REFUNDING: [],
  REFUNDED: [],
  REJECTED: [],
  CANCELLED: [],
};

const returnUpdateSchema = z.object({
  status: z.enum(returnStatuses),
  adminNote: z.string().trim().max(1000).optional().or(z.literal("")),
  customerVisibleNote: z.string().trim().max(1000).optional().or(z.literal("")),
  refundMethod: z.enum(["ORIGINAL_PAYMENT", "BANK_TRANSFER", "UPI", "STORE_CREDIT", "OTHER"]).optional(),
  refundReference: z.string().trim().max(200).optional().or(z.literal("")),
  reverseCarrier: z.string().trim().max(100).optional().or(z.literal("")),
  reverseTrackingNumber: z.string().trim().max(150).optional().or(z.literal("")),
  reverseTrackingUrl: z.string().trim().url().optional().or(z.literal("")),
});

router.patch(
  "/returns/:id",
  asyncHandler(async (req, res) => {
    const parsed = returnUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid return update", errors: parsed.error.flatten() });

    const current = await prisma.returnRequest.findUnique({
      where: { id: String(req.params.id) },
      include: { items: true, evidence: true, statusHistory: true, order: { include: { payment: true } }, user: true },
    });
    if (!current) return res.status(404).json({ success: false, message: "Return request not found" });
    if (current.status === parsed.data.status) {
      const updated = await prisma.$transaction(async (tx) => {
        const item = await tx.returnRequest.update({
          where: { id: current.id },
          data: {
            adminNote: parsed.data.adminNote || null,
            reverseCarrier: parsed.data.reverseCarrier || null,
            reverseTrackingNumber: parsed.data.reverseTrackingNumber || null,
            reverseTrackingUrl: parsed.data.reverseTrackingUrl || null,
          },
          include: { items: { include: { orderItem: true } }, evidence: true, statusHistory: { orderBy: { createdAt: "asc" } }, order: true, user: true },
        });
        if (parsed.data.customerVisibleNote) {
          await tx.returnStatusHistory.create({
            data: { returnRequestId: current.id, status: current.status, note: parsed.data.customerVisibleNote, source: "ADMIN", customerVisible: true },
          });
        }
        return item;
      });
      return res.json({ success: true, data: updated });
    }
    if (!(allowedReturnTransitions[current.status] || []).includes(parsed.data.status)) {
      return res.status(400).json({ success: false, message: `Return cannot move from ${current.status} to ${parsed.data.status}` });
    }

    if (parsed.data.status === "REFUNDED") {
      if (current.status !== "RECEIVED" || current.refundedAt) return res.status(409).json({ success: false, message: "Return is not ready for refund" });

      let providerRefundId: string | null = null;
      let refundMethod = parsed.data.refundMethod ?? (current.order.paymentMethod === "ONLINE" ? "ORIGINAL_PAYMENT" : undefined);
      if (!refundMethod) return res.status(400).json({ success: false, message: "Choose how the customer was refunded" });

      if (current.order.paymentMethod === "ONLINE") {
        if (refundMethod !== "ORIGINAL_PAYMENT") return res.status(400).json({ success: false, message: "Online orders must be refunded to the original payment method" });
        if (!current.order.payment?.providerPaymentId || !["PAID", "PARTIALLY_REFUNDED"].includes(current.order.payment.status)) {
          return res.status(400).json({ success: false, message: "The original online payment is not refundable" });
        }
        const locked = await prisma.returnRequest.updateMany({ where: { id: current.id, status: "RECEIVED", refundedAt: null }, data: { status: "REFUNDING" } });
        if (locked.count !== 1) return res.status(409).json({ success: false, message: "Refund is already being processed" });
        try {
          const refund = await refundRazorpayPayment(current.order.payment.providerPaymentId, Math.round(Number(current.refundAmount) * 100));
          providerRefundId = refund.id;
        } catch (error) {
          await prisma.returnRequest.updateMany({ where: { id: current.id, status: "REFUNDING" }, data: { status: "RECEIVED" } });
          throw error;
        }
      } else if (!parsed.data.refundReference && ["BANK_TRANSFER", "UPI", "OTHER"].includes(refundMethod)) {
        return res.status(400).json({ success: false, message: "Add a refund reference before marking this COD return refunded" });
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (current.order.payment) {
          const newRefunded = Number(current.order.payment.refundedAmount || 0) + Number(current.refundAmount);
          const paymentTotal = Number(current.order.payment.amount);
          await tx.payment.update({
            where: { orderId: current.order.id },
            data: {
              refundedAmount: newRefunded,
              refundedAt: new Date(),
              status: newRefunded + 0.009 >= paymentTotal ? "REFUNDED" : "PARTIALLY_REFUNDED",
              reconciliationStatus: "UNCHECKED", reconciledAt: null, reconciliationNote: null,
            },
          });
        }
        const item = await tx.returnRequest.update({
          where: { id: current.id },
          data: {
            status: "REFUNDED",
            refundMethod,
            refundReference: parsed.data.refundReference || null,
            providerRefundId,
            refundedAt: new Date(),
            adminNote: parsed.data.adminNote || null,
          },
          include: { items: { include: { orderItem: true } }, evidence: true, statusHistory: { orderBy: { createdAt: "asc" } }, order: true, user: true },
        });
        await tx.returnStatusHistory.create({
          data: { returnRequestId: current.id, status: "REFUNDED", note: parsed.data.customerVisibleNote || "Refund completed", source: "ADMIN", customerVisible: true },
        });
        return item;
      });
      void sendReturnStatusNotification(updated).catch((error) => console.error("Return refund email failed", error));
      void createReturnStatusInAppNotification(updated).catch((error) => console.error("Return refund in-app notification failed", error));
      void reverseRefundedOrderRewards(updated.id).catch((error) => console.error("Reward refund reversal failed", error));
      try { await ensureCreditNoteForReturn(updated.id); } catch (error) { console.error("Credit note issuance failed", error); }
      return res.json({ success: true, data: updated });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const data: any = {
        status: parsed.data.status,
        adminNote: parsed.data.adminNote || null,
        reverseCarrier: parsed.data.reverseCarrier || null,
        reverseTrackingNumber: parsed.data.reverseTrackingNumber || null,
        reverseTrackingUrl: parsed.data.reverseTrackingUrl || null,
      };
      if (parsed.data.status === "APPROVED") data.approvedAt = new Date();
      if (parsed.data.status === "RECEIVED") {
        data.receivedAt = new Date();
        if (!current.restockedAt) {
          for (const item of current.items) {
            const orderItem = await tx.orderItem.findUnique({ where: { id: item.orderItemId }, select: { variantId: true } });
            if (orderItem?.variantId) await adjustInventory(tx, {
              variantId: orderItem.variantId,
              delta: item.quantity,
              type: "RETURN_RESTOCK",
              source: "RETURN",
              reason: "Returned item received and restocked",
              referenceType: "RETURN",
              referenceId: current.id,
              actorUserId: req.user!.id,
            });
          }
          data.restockedAt = new Date();
        }
      }
      const item = await tx.returnRequest.update({
        where: { id: current.id },
        data,
        include: { items: { include: { orderItem: true } }, evidence: true, statusHistory: { orderBy: { createdAt: "asc" } }, order: true, user: true },
      });
      await tx.returnStatusHistory.create({
        data: { returnRequestId: current.id, status: parsed.data.status, note: parsed.data.customerVisibleNote || null, source: "ADMIN", customerVisible: true },
      });
      return item;
    });
    void sendReturnStatusNotification(updated).catch((error) => console.error("Return status email failed", error));
    void createReturnStatusInAppNotification(updated).catch((error) => console.error("Return status in-app notification failed", error));
    res.json({ success: true, data: updated });
  }),
);

export default router;
