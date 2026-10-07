import { randomBytes } from "node:crypto";
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
import { adjustInventory, availableToSell } from "../services/inventory.service";
import { deliveryPromiseHealth } from "../services/delivery-promise.service";
import { addressReadinessHealth } from "../services/address-readiness.service";
import { fulfilmentIntegrityHealth } from "../services/order-integrity.service";
import { fulfilmentDispatchReadinessHealth } from "../services/dispatch-readiness.service";
import { fulfilmentShipmentTrackingHealth } from "../services/shipment-tracking-health.service";
import { fulfilmentRtoRecoveryHealth } from "../services/rto-recovery.service";
import { adminReturnResolutionSnapshot, returnResolutionHealth } from "../services/return-resolution.service";
import { nextEscalationLevel, phase84SupportHealth, phase84SupportSlaDueAt, phase84SupportSummary } from "../services/support-operations.service";
import { PHASE85_RECOVERY_POLICY, phase85Customer360Profile, phase85RecoveryEligibility } from "../services/support-recovery.service";
import { PHASE86_RETENTION_POLICY, phase86GrowthSummary, phase86LifecycleProfile, phase86Suppression } from "../services/retention-growth.service";
import { PHASE87_ATTRIBUTION_POLICY, phase87BuildAttribution, phase87CampaignMetrics, phase87ExperimentGroup } from "../services/retention-attribution.service";
import { PHASE88_DEMAND_POLICY, phase88DemandRow, phase88DemandSummary } from "../services/demand-intelligence.service";
import { PHASE89_PROCUREMENT_POLICY, phase89PurchaseTotals, phase89RankSupplierOffers, phase89ReceiptVariance, phase89WeightedAverageCost } from "../services/procurement-intelligence.service";
import { PHASE90_WAREHOUSE_POLICY, phase90BlockBatch, phase90CycleCountVariance, phase90PostCycleCount, phase90ReleaseQuarantine, phase90WarehouseOverview, phase90WriteOffBatch } from "../services/warehouse-inventory.service";
import { PHASE91_QUALITY_POLICY, phase91CreateInboundQaHold, phase91InspectionDecision, phase91QualityOverview, phase91RejectBatch, phase91ReleaseBatch, phase91SupplierScorecard } from "../services/quality-assurance.service";

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
    const [inTransit, promiseHealth, addressHealth, integrityHealth, dispatchHealth, trackingHealth, rtoRecoveryHealth] = await Promise.all([
      prisma.order.count({ where: { status: "SHIPPED" } }),
      deliveryPromiseHealth(),
      addressReadinessHealth(),
      fulfilmentIntegrityHealth(),
      fulfilmentDispatchReadinessHealth(),
      fulfilmentShipmentTrackingHealth(),
      fulfilmentRtoRecoveryHealth(),
    ]);
    const exceptionEvents = await prisma.shipmentEvent.findMany({
      where: { type: { in: ["EXCEPTION", "RTO_INITIATED"] }, eventAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } },
      include: { shipment: { include: { order: { select: { id: true, orderNumber: true, status: true, customerName: true } } } } },
      orderBy: { eventAt: "desc" },
      take: 30,
    });
    const activeExceptions = exceptionEvents.filter((event) => event.shipment.order.status === "SHIPPED").map((event) => ({ id: event.id, orderId: event.shipment.order.id, orderNumber: event.shipment.order.orderNumber, customerName: event.shipment.order.customerName, type: event.type, title: event.title, note: event.note, location: event.location, eventAt: event.eventAt }));
    const enrichedWithIntegrity = enriched.map((row) => ({ ...row, integrity: integrityHealth.byOrderId[row.id] || null, dispatchReadiness: dispatchHealth.byOrderId[row.id] || null }));
    res.json({ success: true, data: {
      counts: { awaiting: enriched.filter((row) => row.status === "CONFIRMED").length, processing: enriched.filter((row) => row.status === "PROCESSING").length, overdue: enriched.filter((row) => row.overdue).length, dueSoon: enriched.filter((row) => row.dueSoon).length, inTransit, exceptions: activeExceptions.length, integrityBlocked: integrityHealth.blocked, integrityReview: integrityHealth.review, dispatchBlocked: dispatchHealth.blocked, dispatchReview: dispatchHealth.review, trackingBlocked: trackingHealth.blocked, trackingReview: trackingHealth.review, trackingStale: trackingHealth.stale, trackingOverdue: trackingHealth.overdue, rtoInTransit: rtoRecoveryHealth.inTransit, rtoReadyToClose: rtoRecoveryHealth.readyToClose, rtoRefundRequired: rtoRecoveryHealth.refundRequired, rtoBlocked: rtoRecoveryHealth.blocked },
      orders: enrichedWithIntegrity, exceptions: activeExceptions, deliveryPromiseHealth: promiseHealth, addressReadinessHealth: addressHealth, orderIntegrityHealth: { ...integrityHealth, byOrderId: undefined }, dispatchReadinessHealth: { ...dispatchHealth, byOrderId: undefined }, shipmentTrackingHealth: trackingHealth, rtoRecoveryHealth: { ...rtoRecoveryHealth, byOrderId: undefined },
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
  "/returns/phase83-summary",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await adminReturnResolutionSnapshot() });
  }),
);

router.get(
  "/returns",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const rows = await prisma.returnRequest.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        order: { include: { payment: true, shipment: true } },
        items: { include: { orderItem: true } },
        evidence: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ priority: "desc" }, { requestedAt: "desc" }],
      take: 300,
    });
    res.json({ success: true, data: rows.map((item: any) => ({ ...item, resolutionHealth: returnResolutionHealth(item) })) });
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
        items: { include: { orderItem: { include: { variant: { select: { productId: true } } } } } },
        evidence: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!item) return res.status(404).json({ success: false, message: "Return request not found" });
    const productVariants = await prisma.productVariant.findMany({
      where: { isActive: true },
      select: { id: true, name: true, sku: true, size: true, unit: true, stockQuantity: true, safetyStock: true, product: { select: { id: true, name: true } } },
      orderBy: { sellingPrice: "asc" },
    });
    res.json({ success: true, data: { ...item, resolutionHealth: returnResolutionHealth(item), replacementCatalog: productVariants.map((v: any) => ({ ...v, available: availableToSell(v) })) } });
  }),
);

const returnStatuses = ["REQUESTED", "APPROVED", "REJECTED", "PICKUP_PENDING", "IN_TRANSIT", "RECEIVED", "RESOLUTION_PENDING", "REFUNDED", "REPLACEMENT_PENDING", "REPLACEMENT_SHIPPED", "REPLACED", "CANCELLED"] as const;
const allowedReturnTransitions: Record<string, string[]> = {
  REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PICKUP_PENDING", "IN_TRANSIT", "RECEIVED", "CANCELLED"],
  PICKUP_PENDING: ["IN_TRANSIT", "RECEIVED"],
  IN_TRANSIT: ["RECEIVED"],
  RECEIVED: [],
  RESOLUTION_PENDING: ["REFUNDED"],
  REPLACEMENT_PENDING: [],
  REPLACEMENT_SHIPPED: [],
  REFUNDED: [], REPLACED: [], REFUNDING: [], REJECTED: [], CANCELLED: [],
};

const returnUpdateSchema = z.object({
  status: z.enum(returnStatuses),
  adminNote: z.string().trim().max(1600).optional().or(z.literal("")),
  customerVisibleNote: z.string().trim().max(1600).optional().or(z.literal("")),
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
          data: { adminNote: parsed.data.adminNote || null, reverseCarrier: parsed.data.reverseCarrier || null, reverseTrackingNumber: parsed.data.reverseTrackingNumber || null, reverseTrackingUrl: parsed.data.reverseTrackingUrl || null },
          include: { items: { include: { orderItem: true } }, evidence: true, statusHistory: { orderBy: { createdAt: "asc" } }, order: true, user: true },
        });
        if (parsed.data.customerVisibleNote) await tx.returnStatusHistory.create({ data: { returnRequestId: current.id, status: current.status, note: parsed.data.customerVisibleNote, source: "ADMIN", customerVisible: true } });
        return item;
      });
      return res.json({ success: true, data: { ...updated, resolutionHealth: returnResolutionHealth(updated) } });
    }
    if (!(allowedReturnTransitions[current.status] || []).includes(parsed.data.status)) return res.status(400).json({ success: false, message: `Return cannot move from ${current.status} to ${parsed.data.status}` });

    if (parsed.data.status === "REFUNDED") {
      if (current.status !== "RESOLUTION_PENDING" || current.approvedResolution !== "REFUND" || !current.inspectionCompletedAt || current.refundedAt) {
        return res.status(409).json({ success: false, message: "Complete Phase 83 inspection and refund approval before refunding this return" });
      }
      const approvedAmount = Number(current.approvedRefundAmount ?? current.refundAmount);
      if (!(approvedAmount > 0) || approvedAmount - Number(current.refundAmount) > 0.009) return res.status(409).json({ success: false, message: "Approved refund amount is invalid" });

      let providerRefundId: string | null = null;
      const refundMethod = parsed.data.refundMethod ?? (current.order.paymentMethod === "ONLINE" ? "ORIGINAL_PAYMENT" : undefined);
      if (!refundMethod) return res.status(400).json({ success: false, message: "Choose how the customer was refunded" });
      if (current.order.paymentMethod === "ONLINE") {
        if (refundMethod !== "ORIGINAL_PAYMENT") return res.status(400).json({ success: false, message: "Online orders must be refunded to the original payment method" });
        if (!current.order.payment?.providerPaymentId || !["PAID", "PARTIALLY_REFUNDED"].includes(current.order.payment.status)) return res.status(400).json({ success: false, message: "The original online payment is not refundable" });
        const locked = await prisma.returnRequest.updateMany({ where: { id: current.id, status: "RESOLUTION_PENDING", refundedAt: null }, data: { status: "REFUNDING" } });
        if (locked.count !== 1) return res.status(409).json({ success: false, message: "Refund is already being processed" });
        try { const refund = await refundRazorpayPayment(current.order.payment.providerPaymentId, Math.round(approvedAmount * 100)); providerRefundId = refund.id; }
        catch (error) { await prisma.returnRequest.updateMany({ where: { id: current.id, status: "REFUNDING" }, data: { status: "RESOLUTION_PENDING" } }); throw error; }
      } else if (!parsed.data.refundReference && ["BANK_TRANSFER", "UPI", "OTHER"].includes(refundMethod)) {
        return res.status(400).json({ success: false, message: "Add a refund reference before completing this COD return" });
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (current.order.payment) {
          const newRefunded = Number(current.order.payment.refundedAmount || 0) + approvedAmount;
          const paymentTotal = Number(current.order.payment.amount);
          await tx.payment.update({ where: { orderId: current.order.id }, data: { refundedAmount: newRefunded, refundedAt: new Date(), status: newRefunded + 0.009 >= paymentTotal ? "REFUNDED" : "PARTIALLY_REFUNDED", reconciliationStatus: "UNCHECKED", reconciledAt: null, reconciliationNote: null } });
        }
        const item = await tx.returnRequest.update({
          where: { id: current.id },
          data: { status: "REFUNDED", refundMethod, refundReference: parsed.data.refundReference || null, providerRefundId, refundedAt: new Date(), resolutionCompletedAt: new Date(), adminNote: parsed.data.adminNote || null },
          include: { items: { include: { orderItem: true } }, evidence: true, statusHistory: { orderBy: { createdAt: "asc" } }, order: true, user: true },
        });
        await tx.returnStatusHistory.create({ data: { returnRequestId: current.id, status: "REFUNDED", note: parsed.data.customerVisibleNote || `Refund of ₹${approvedAmount.toFixed(2)} completed`, source: "ADMIN", customerVisible: true } });
        return item;
      });
      void sendReturnStatusNotification(updated).catch((error) => console.error("Return refund email failed", error));
      void createReturnStatusInAppNotification(updated).catch((error) => console.error("Return refund in-app notification failed", error));
      void reverseRefundedOrderRewards(updated.id).catch((error) => console.error("Reward refund reversal failed", error));
      try { await ensureCreditNoteForReturn(updated.id); } catch (error) { console.error("Credit note issuance failed", error); }
      return res.json({ success: true, data: { ...updated, resolutionHealth: returnResolutionHealth(updated) } });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const data: any = { status: parsed.data.status, adminNote: parsed.data.adminNote || null, reverseCarrier: parsed.data.reverseCarrier || null, reverseTrackingNumber: parsed.data.reverseTrackingNumber || null, reverseTrackingUrl: parsed.data.reverseTrackingUrl || null };
      if (parsed.data.status === "APPROVED") data.approvedAt = new Date();
      if (parsed.data.status === "RECEIVED") data.receivedAt = new Date();
      if (["REJECTED", "CANCELLED"].includes(parsed.data.status)) data.resolutionCompletedAt = new Date();
      const item = await tx.returnRequest.update({ where: { id: current.id }, data, include: { items: { include: { orderItem: true } }, evidence: true, statusHistory: { orderBy: { createdAt: "asc" } }, order: true, user: true } });
      await tx.returnStatusHistory.create({ data: { returnRequestId: current.id, status: parsed.data.status, note: parsed.data.customerVisibleNote || (parsed.data.status === "RECEIVED" ? "Return received by Riseora. Inspection is now required before refund or replacement." : null), source: "ADMIN", customerVisible: true } });
      return item;
    });
    void sendReturnStatusNotification(updated).catch((error) => console.error("Return status email failed", error));
    void createReturnStatusInAppNotification(updated).catch((error) => console.error("Return status in-app notification failed", error));
    res.json({ success: true, data: { ...updated, resolutionHealth: returnResolutionHealth(updated) } });
  }),
);

const inspectionSchema = z.object({
  approvedResolution: z.enum(["REFUND", "REPLACEMENT"]),
  approvedRefundAmount: z.number().min(0).optional(),
  refundAdjustmentReason: z.string().trim().max(1000).optional().or(z.literal("")),
  customerVisibleNote: z.string().trim().max(1600).optional().or(z.literal("")),
  items: z.array(z.object({
    id: z.string().uuid(),
    receivedQuantity: z.number().int().min(0),
    restockQuantity: z.number().int().min(0),
    quarantineQuantity: z.number().int().min(0),
    writeOffQuantity: z.number().int().min(0),
    inspectionGrade: z.enum(["SEALED", "RESELLABLE", "OPENED", "DAMAGED", "DEFECTIVE", "WRONG_ITEM", "UNSAFE"]),
    inspectionNote: z.string().trim().max(1000).optional().or(z.literal("")),
    replacementVariantId: z.string().uuid().optional().nullable(),
  })).min(1),
});

router.post("/returns/:id/inspection", asyncHandler(async (req, res) => {
  const parsed = inspectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid inspection", errors: parsed.error.flatten() });
  const current = await prisma.returnRequest.findUnique({ where: { id: String(req.params.id) }, include: { items: { include: { orderItem: true } }, order: true } });
  if (!current) return res.status(404).json({ success: false, message: "Return request not found" });
  if (current.status !== "RECEIVED" || current.inspectionCompletedAt) return res.status(409).json({ success: false, message: "This return is not waiting for inspection" });
  if (new Set(parsed.data.items.map((x) => x.id)).size !== current.items.length || parsed.data.items.length !== current.items.length) return res.status(400).json({ success: false, message: "Inspect every return line exactly once" });

  const byId = new Map(current.items.map((item: any) => [item.id, item]));
  let eligibleRefund = 0;
  for (const row of parsed.data.items) {
    const item: any = byId.get(row.id);
    if (!item) return res.status(400).json({ success: false, message: "Inspection contains an invalid return line" });
    if (row.receivedQuantity > item.quantity) return res.status(400).json({ success: false, message: `Received quantity exceeds requested quantity for ${item.orderItem.productName}` });
    if (row.restockQuantity + row.quarantineQuantity + row.writeOffQuantity !== row.receivedQuantity) return res.status(400).json({ success: false, message: `Disposition quantities must equal received quantity for ${item.orderItem.productName}` });
    if (row.restockQuantity > 0 && !["SEALED", "RESELLABLE"].includes(row.inspectionGrade)) return res.status(400).json({ success: false, message: `${item.orderItem.productName} can be restocked only when graded SEALED or RESELLABLE` });
    if (parsed.data.approvedResolution === "REPLACEMENT" && row.receivedQuantity > 0 && !row.replacementVariantId) return res.status(400).json({ success: false, message: `Choose a replacement variant for ${item.orderItem.productName}` });
    eligibleRefund += Number(item.unitRefundAmount) * row.receivedQuantity;
  }
  eligibleRefund = Math.round((eligibleRefund + Number.EPSILON) * 100) / 100;
  const approvedRefund = parsed.data.approvedResolution === "REFUND" ? Number(parsed.data.approvedRefundAmount ?? eligibleRefund) : 0;
  if (approvedRefund < 0 || approvedRefund - eligibleRefund > 0.009) return res.status(400).json({ success: false, message: "Approved refund cannot exceed the value of physically received units" });
  if (parsed.data.approvedResolution === "REFUND" && approvedRefund + 0.009 < eligibleRefund && !parsed.data.refundAdjustmentReason) return res.status(400).json({ success: false, message: "Explain any reduction from the eligible refund amount" });

  const updated = await prisma.$transaction(async (tx) => {
    let totalRestocked = 0;
    for (const row of parsed.data.items) {
      const item: any = byId.get(row.id);
      if (row.replacementVariantId) {
        const replacement = await tx.productVariant.findUnique({ where: { id: row.replacementVariantId }, include: { product: true } });
        const original = item.orderItem.variantId ? await tx.productVariant.findUnique({ where: { id: item.orderItem.variantId }, select: { productId: true } }) : null;
        if (!replacement?.isActive || !original || replacement.productId !== original.productId) throw new Error("INVALID_REPLACEMENT_VARIANT");
      }
      await tx.returnRequestItem.update({ where: { id: row.id }, data: { receivedQuantity: row.receivedQuantity, restockQuantity: row.restockQuantity, quarantineQuantity: row.quarantineQuantity, writeOffQuantity: row.writeOffQuantity, inspectionGrade: row.inspectionGrade as any, inspectionNote: row.inspectionNote || null, replacementVariantId: parsed.data.approvedResolution === "REPLACEMENT" ? row.replacementVariantId || null : null } });
      if (row.restockQuantity > 0 && item.orderItem.variantId) {
        await adjustInventory(tx, { variantId: item.orderItem.variantId, delta: row.restockQuantity, type: "RETURN_RESTOCK", source: "RETURN", reason: `Phase 83 inspected return ${current.returnNumber}: sellable units restored`, referenceType: "RETURN_INSPECTION", referenceId: current.id, actorUserId: req.user!.id });
        totalRestocked += row.restockQuantity;
      }
    }
    const status = parsed.data.approvedResolution === "REFUND" ? "RESOLUTION_PENDING" : "REPLACEMENT_PENDING";
    const item = await tx.returnRequest.update({
      where: { id: current.id },
      data: { status: status as any, approvedResolution: parsed.data.approvedResolution as any, approvedRefundAmount: parsed.data.approvedResolution === "REFUND" ? approvedRefund : null, refundAdjustmentReason: parsed.data.refundAdjustmentReason || null, inspectionCompletedAt: new Date(), restockedAt: totalRestocked > 0 ? new Date() : current.restockedAt },
      include: { items: { include: { orderItem: true } }, evidence: true, statusHistory: { orderBy: { createdAt: "asc" } }, order: true, user: true },
    });
    await tx.returnStatusHistory.create({ data: { returnRequestId: current.id, status: status as any, note: parsed.data.customerVisibleNote || (parsed.data.approvedResolution === "REFUND" ? `Inspection completed. Refund approved for ₹${approvedRefund.toFixed(2)}.` : "Inspection completed. Replacement approved and awaiting dispatch."), source: "ADMIN", customerVisible: true } });
    return item;
  });
  void sendReturnStatusNotification(updated).catch((error) => console.error("Return inspection email failed", error));
  void createReturnStatusInAppNotification(updated).catch((error) => console.error("Return inspection in-app notification failed", error));
  res.json({ success: true, data: { ...updated, resolutionHealth: returnResolutionHealth(updated) } });
}));

const replacementDispatchSchema = z.object({
  carrier: z.string().trim().min(2).max(100), trackingNumber: z.string().trim().min(3).max(150), trackingUrl: z.string().trim().url().optional().or(z.literal("")), customerVisibleNote: z.string().trim().max(1600).optional().or(z.literal("")),
});

router.post("/returns/:id/replacement-dispatch", asyncHandler(async (req, res) => {
  const parsed = replacementDispatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid replacement dispatch", errors: parsed.error.flatten() });
  const current = await prisma.returnRequest.findUnique({ where: { id: String(req.params.id) }, include: { items: { include: { orderItem: true } }, order: true } });
  if (!current) return res.status(404).json({ success: false, message: "Return request not found" });
  if (current.status !== "REPLACEMENT_PENDING" || current.approvedResolution !== "REPLACEMENT" || !current.inspectionCompletedAt) return res.status(409).json({ success: false, message: "Replacement is not approved and ready to dispatch" });
  const duplicate = await prisma.returnRequest.findFirst({ where: { replacementTrackingNumber: parsed.data.trackingNumber, id: { not: current.id } }, select: { id: true } });
  if (duplicate) return res.status(409).json({ success: false, message: "This replacement tracking number is already used by another return" });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      for (const row of current.items) {
        if (row.receivedQuantity <= 0) continue;
        if (!row.replacementVariantId) throw new Error("REPLACEMENT_VARIANT_MISSING");
        const variant = await tx.productVariant.findUnique({ where: { id: row.replacementVariantId }, select: { id: true, sku: true, stockQuantity: true, safetyStock: true, isActive: true } });
        if (!variant?.isActive || availableToSell(variant) < row.receivedQuantity) throw new Error(`REPLACEMENT_OUT_OF_STOCK:${variant?.sku || row.replacementVariantId}`);
        await adjustInventory(tx, { variantId: row.replacementVariantId, delta: -row.receivedQuantity, type: "RETURN_REPLACEMENT", source: "RETURN", reason: `Replacement dispatched for ${current.returnNumber}`, referenceType: "RETURN_REPLACEMENT", referenceId: current.id, actorUserId: req.user!.id, enforceSafetyStock: true });
      }
      const item = await tx.returnRequest.update({ where: { id: current.id }, data: { status: "REPLACEMENT_SHIPPED", replacementCarrier: parsed.data.carrier, replacementTrackingNumber: parsed.data.trackingNumber, replacementTrackingUrl: parsed.data.trackingUrl || null, replacementShippedAt: new Date() }, include: { items: { include: { orderItem: true } }, statusHistory: { orderBy: { createdAt: "asc" } }, order: true, user: true } });
      await tx.returnStatusHistory.create({ data: { returnRequestId: current.id, status: "REPLACEMENT_SHIPPED", note: parsed.data.customerVisibleNote || `Replacement dispatched via ${parsed.data.carrier}. Tracking: ${parsed.data.trackingNumber}`, source: "ADMIN", customerVisible: true } });
      return item;
    });
    void sendReturnStatusNotification(updated).catch((error) => console.error("Replacement dispatch email failed", error));
    void createReturnStatusInAppNotification(updated).catch((error) => console.error("Replacement dispatch notification failed", error));
    res.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "REPLACEMENT_DISPATCH_FAILED";
    if (message.startsWith("REPLACEMENT_OUT_OF_STOCK")) return res.status(409).json({ success: false, message: "Replacement stock is no longer available. Choose another active variant or resolve as a refund." });
    throw error;
  }
}));

router.post("/returns/:id/replacement-delivered", asyncHandler(async (req, res) => {
  const current = await prisma.returnRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!current) return res.status(404).json({ success: false, message: "Return request not found" });
  if (current.status !== "REPLACEMENT_SHIPPED") return res.status(409).json({ success: false, message: "Replacement has not been dispatched" });
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.returnRequest.update({ where: { id: current.id }, data: { status: "REPLACED", replacementDeliveredAt: new Date(), resolutionCompletedAt: new Date() }, include: { items: { include: { orderItem: true } }, statusHistory: { orderBy: { createdAt: "asc" } }, order: true, user: true } });
    await tx.returnStatusHistory.create({ data: { returnRequestId: current.id, status: "REPLACED", note: "Replacement delivered. Return case completed.", source: "ADMIN", customerVisible: true } });
    return item;
  });
  void sendReturnStatusNotification(updated).catch((error) => console.error("Replacement delivered email failed", error));
  void createReturnStatusInAppNotification(updated).catch((error) => console.error("Replacement delivered notification failed", error));
  res.json({ success: true, data: updated });
}));


router.get("/support-cases/phase84-summary", asyncHandler(async (_req, res) => {
  const rows = await prisma.contactMessage.findMany({ orderBy: { lastActivityAt: "desc" } });
  res.json({ success: true, data: phase84SupportSummary(rows) });
}));

router.get("/support-cases/phase85-recovery-summary", asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - PHASE85_RECOVERY_POLICY.lookbackDays * 86400000);
  const rows = await prisma.supportRecoveryGrant.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });
  const couponTotal = Math.round(rows.filter((row: any) => row.kind === "COUPON").reduce((sum: number, row: any) => sum + Number(row.couponAmount || 0), 0) * 100) / 100;
  const pointsTotal = rows.filter((row: any) => row.kind === "REWARD_POINTS").reduce((sum: number, row: any) => sum + Number(row.points || 0), 0);
  res.json({ success: true, data: { lookbackDays: PHASE85_RECOVERY_POLICY.lookbackDays, grants: rows.length, couponTotal, pointsTotal, customers: new Set(rows.map((row: any) => row.userId)).size } });
}));

router.get("/support-cases", asyncHandler(async (_req, res) => {
  const rows = await prisma.contactMessage.findMany({
    include: {
      returnRequest: { select: { id: true, returnNumber: true, status: true } },
      recoveryGrant: true,
      messages: { orderBy: { createdAt: "asc" }, take: 2 },
    },
    orderBy: [{ priority: "desc" }, { lastActivityAt: "desc" }],
  });
  res.json({ success: true, data: rows.map((item: any) => ({ ...item, supportHealth: phase84SupportHealth(item) })) });
}));

router.get("/support-cases/:id", asyncHandler(async (req, res) => {
  const item = await prisma.contactMessage.findUnique({
    where: { id: String(req.params.id) },
    include: {
      returnRequest: { select: { id: true, returnNumber: true, status: true, approvedResolution: true } },
      recoveryGrant: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!item) return res.status(404).json({ success: false, message: "Support case not found" });
  let assignedAdmin = null;
  if (item.assignedAdminUserId) {
    assignedAdmin = await prisma.user.findUnique({ where: { id: item.assignedAdminUserId }, select: { id: true, firstName: true, lastName: true, email: true } });
  }
  res.json({ success: true, data: { ...item, assignedAdmin, supportHealth: phase84SupportHealth(item) } });
}));

router.get("/support-cases/:id/phase85-customer360", asyncHandler(async (req, res) => {
  const current = await prisma.contactMessage.findUnique({
    where: { id: String(req.params.id) },
    include: { recoveryGrant: true },
  });
  if (!current) return res.status(404).json({ success: false, message: "Support case not found" });
  if (!current.userId) return res.json({ success: true, data: { linkedCustomer: false, eligibility: phase85RecoveryEligibility(current, []), profile: null } });

  const since = new Date(Date.now() - PHASE85_RECOVERY_POLICY.lookbackDays * 86400000);
  const [user, orders, returns, tickets, rewardAccount, recentGrants] = await Promise.all([
    prisma.user.findUnique({ where: { id: current.userId }, select: { id: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true } }),
    prisma.order.findMany({ where: { userId: current.userId }, select: { status: true, totalAmount: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.returnRequest.findMany({ where: { userId: current.userId }, select: { status: true, requestedAt: true }, orderBy: { requestedAt: "desc" } }),
    prisma.contactMessage.findMany({ where: { userId: current.userId }, select: { status: true, satisfactionScore: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.rewardAccount.findUnique({ where: { userId: current.userId }, select: { balance: true } }),
    prisma.supportRecoveryGrant.findMany({ where: { userId: current.userId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } }),
  ]);
  const profile = phase85Customer360Profile({ orders, returns, tickets, rewardBalance: rewardAccount?.balance || 0, recoveryGrants: recentGrants });
  res.json({ success: true, data: { linkedCustomer: true, customer: user, profile, recentGrants, eligibility: phase85RecoveryEligibility(current, recentGrants) } });
}));

const supportRecoverySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("COUPON"), amount: z.number().min(50).max(PHASE85_RECOVERY_POLICY.maxCouponPerGrant), reason: z.string().trim().min(10).max(1000) }),
  z.object({ kind: z.literal("REWARD_POINTS"), points: z.number().int().min(50).max(PHASE85_RECOVERY_POLICY.maxPointsPerGrant), reason: z.string().trim().min(10).max(1000) }),
]);

router.post("/support-cases/:id/phase85-recovery", asyncHandler(async (req, res) => {
  const parsed = supportRecoverySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid service-recovery benefit", errors: parsed.error.flatten() });
  const current = await prisma.contactMessage.findUnique({ where: { id: String(req.params.id) }, include: { recoveryGrant: true } });
  if (!current) return res.status(404).json({ success: false, message: "Support case not found" });
  if (!current.userId) return res.status(409).json({ success: false, message: "SERVICE_RECOVERY_BLOCKED: case is not linked to a signed-in customer" });
  if (current.assignedAdminUserId !== req.user!.id) return res.status(409).json({ success: false, message: "SERVICE_RECOVERY_BLOCKED: assign this case to yourself before issuing a benefit" });

  const since = new Date(Date.now() - PHASE85_RECOVERY_POLICY.lookbackDays * 86400000);
  const recentGrants = await prisma.supportRecoveryGrant.findMany({ where: { userId: current.userId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });
  const eligibility = phase85RecoveryEligibility(current, recentGrants);
  if (!eligibility.eligible) return res.status(409).json({ success: false, message: `SERVICE_RECOVERY_BLOCKED: ${eligibility.blockers.join(" ")}`, data: eligibility });

  if (parsed.data.kind === "COUPON") {
    if (parsed.data.amount > eligibility.couponRemaining) return res.status(409).json({ success: false, message: `SERVICE_RECOVERY_LIMIT: only ₹${eligibility.couponRemaining.toFixed(2)} coupon value remains in the 30-day allowance` });
  } else if (parsed.data.points > eligibility.pointsRemaining) {
    return res.status(409).json({ success: false, message: `SERVICE_RECOVERY_LIMIT: only ${eligibility.pointsRemaining} reward points remain in the 30-day allowance` });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + PHASE85_RECOVERY_POLICY.couponValidityDays * 86400000);
  const result = await prisma.$transaction(async (tx) => {
    if (parsed.data.kind === "COUPON") {
      const code = `CARE-${randomBytes(4).toString("hex").toUpperCase()}`;
      const coupon = await tx.coupon.create({
        data: {
          code,
          description: `Phase 85 service recovery for ${current.ticketNumber}`,
          discountType: "FIXED",
          discountValue: parsed.data.amount,
          scope: "ORDER",
          application: "ORDER_TOTAL",
          maxDiscountAmount: parsed.data.amount,
          usageLimit: 1,
          perCustomerUsageLimit: 1,
          rewardOwnerUserId: current.userId!,
          startsAt: now,
          endsAt: expiresAt,
          isActive: true,
        },
      });
      const grant = await tx.supportRecoveryGrant.create({ data: { ticketId: current.id, userId: current.userId!, grantedByUserId: req.user!.id, kind: "COUPON", couponAmount: parsed.data.amount, couponId: coupon.id, couponCodeSnapshot: coupon.code, reason: parsed.data.reason, expiresAt } });
      await tx.supportMessage.create({ data: { ticketId: current.id, sender: "SYSTEM", isInternal: false, message: `Riseora care benefit issued: ₹${Number(parsed.data.amount).toFixed(2)} coupon ${coupon.code}, valid for ${PHASE85_RECOVERY_POLICY.couponValidityDays} days.` } });
      await tx.contactMessage.update({ where: { id: current.id }, data: { lastActivityAt: now } });
      return grant;
    }

    const account = await tx.rewardAccount.upsert({
      where: { userId: current.userId! },
      create: { userId: current.userId!, balance: parsed.data.points, lifetimeEarned: parsed.data.points },
      update: { balance: { increment: parsed.data.points }, lifetimeEarned: { increment: parsed.data.points } },
    });
    const reward = await tx.rewardTransaction.create({
      data: { userId: current.userId!, type: "ADMIN_ADJUST", points: parsed.data.points, balanceAfter: account.balance, description: `Phase 85 service recovery · ${current.ticketNumber}`, sourceKey: `support-recovery/${current.id}`, metadata: { ticketNumber: current.ticketNumber, reason: parsed.data.reason } },
    });
    const grant = await tx.supportRecoveryGrant.create({ data: { ticketId: current.id, userId: current.userId!, grantedByUserId: req.user!.id, kind: "REWARD_POINTS", points: parsed.data.points, rewardTransactionId: reward.id, reason: parsed.data.reason } });
    await tx.supportMessage.create({ data: { ticketId: current.id, sender: "SYSTEM", isInternal: false, message: `Riseora care benefit issued: ${parsed.data.points} reward points were added to your account.` } });
    await tx.contactMessage.update({ where: { id: current.id }, data: { lastActivityAt: now } });
    return grant;
  });

  await createUserNotification({
    userId: current.userId,
    title: `Riseora care benefit · ${current.ticketNumber}`,
    message: parsed.data.kind === "COUPON" ? `A ₹${Number(parsed.data.amount).toFixed(2)} care coupon has been added to your support case.` : `${parsed.data.points} reward points have been added to your account.`,
    type: "SUPPORT",
    ctaLabel: "View support case",
    ctaUrl: "/returns",
    metadata: { supportTicketId: current.id, ticketNumber: current.ticketNumber, recoveryKind: parsed.data.kind },
    dedupeKey: `support-recovery/${current.id}`,
  });
  res.json({ success: true, data: result });
}));

router.post("/support-cases/:id/assign-to-me", asyncHandler(async (req, res) => {
  const current = await prisma.contactMessage.findUnique({ where: { id: String(req.params.id) } });
  if (!current) return res.status(404).json({ success: false, message: "Support case not found" });
  if (["CLOSED", "SPAM"].includes(current.status)) return res.status(409).json({ success: false, message: "Closed/spam cases cannot be assigned" });
  const now = new Date();
  const updated = await prisma.contactMessage.update({
    where: { id: current.id },
    data: {
      assignedAdminUserId: req.user!.id,
      status: current.status === "NEW" ? "IN_PROGRESS" : current.status,
      firstResponseAt: current.firstResponseAt,
      lastActivityAt: now,
    },
  });
  res.json({ success: true, data: { ...updated, supportHealth: phase84SupportHealth(updated) } });
}));

const adminSupportReplySchema = z.object({
  message: z.string().trim().min(2).max(5000),
  internal: z.boolean().default(false),
  waitForCustomer: z.boolean().default(true),
});
router.post("/support-cases/:id/reply", asyncHandler(async (req, res) => {
  const parsed = adminSupportReplySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid support reply", errors: parsed.error.flatten() });
  const current = await prisma.contactMessage.findUnique({ where: { id: String(req.params.id) } });
  if (!current) return res.status(404).json({ success: false, message: "Support case not found" });
  if (current.status === "SPAM") return res.status(409).json({ success: false, message: "Spam cases cannot receive replies" });
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.supportMessage.create({
      data: {
        ticketId: current.id,
        sender: "ADMIN",
        authorUserId: req.user!.id,
        message: parsed.data.message,
        isInternal: parsed.data.internal,
      },
    });
    return tx.contactMessage.update({
      where: { id: current.id },
      data: parsed.data.internal ? {
        assignedAdminUserId: current.assignedAdminUserId || req.user!.id,
        lastActivityAt: now,
      } : {
        assignedAdminUserId: current.assignedAdminUserId || req.user!.id,
        status: parsed.data.waitForCustomer ? "WAITING_CUSTOMER" : "IN_PROGRESS",
        firstResponseAt: current.firstResponseAt || now,
        lastAdminReplyAt: now,
        lastActivityAt: now,
      },
    });
  });
  if (!parsed.data.internal && current.userId) {
    await createUserNotification({
      userId: current.userId,
      title: `Support update · ${current.ticketNumber}`,
      message: parsed.data.message,
      type: "SUPPORT",
      ctaLabel: "View support case",
      ctaUrl: "/returns",
      metadata: { supportTicketId: current.id, ticketNumber: current.ticketNumber },
      dedupeKey: `support-reply/${current.id}/${now.toISOString()}`,
    });
  }
  res.json({ success: true, data: { ...updated, supportHealth: phase84SupportHealth(updated) } });
}));

const supportPrioritySchema = z.object({ priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]) });
router.patch("/support-cases/:id/priority", asyncHandler(async (req, res) => {
  const parsed = supportPrioritySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid support priority" });
  const current = await prisma.contactMessage.findUnique({ where: { id: String(req.params.id) } });
  if (!current) return res.status(404).json({ success: false, message: "Support case not found" });
  const now = new Date();
  const updated = await prisma.contactMessage.update({
    where: { id: current.id },
    data: { priority: parsed.data.priority, slaDueAt: phase84SupportSlaDueAt(now, parsed.data.priority), lastActivityAt: now },
  });
  res.json({ success: true, data: { ...updated, supportHealth: phase84SupportHealth(updated) } });
}));

router.post("/support-cases/:id/escalate", asyncHandler(async (req, res) => {
  const current = await prisma.contactMessage.findUnique({ where: { id: String(req.params.id) } });
  if (!current) return res.status(404).json({ success: false, message: "Support case not found" });
  if (["RESOLVED", "CLOSED", "SPAM"].includes(current.status)) return res.status(409).json({ success: false, message: "Only active support cases can be escalated" });
  const next = nextEscalationLevel(current.escalationLevel);
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.contactMessage.update({ where: { id: current.id }, data: { escalationLevel: next as any, escalatedAt: now, assignedAdminUserId: current.assignedAdminUserId || req.user!.id, status: "IN_PROGRESS", lastActivityAt: now } });
    await tx.supportMessage.create({ data: { ticketId: current.id, sender: "SYSTEM", message: `Case escalated to ${next}.`, isInternal: true } });
    return item;
  });
  res.json({ success: true, data: { ...updated, supportHealth: phase84SupportHealth(updated) } });
}));

const supportResolveSchema = z.object({
  resolutionCode: z.enum(["INFORMATION_PROVIDED", "ORDER_CORRECTED", "PAYMENT_RESOLVED", "DELIVERY_RESOLVED", "RETURN_RESOLVED", "REPLACEMENT_RESOLVED", "ACCOUNT_RESOLVED", "GOODWILL_RESOLUTION", "NO_ACTION_REQUIRED", "DUPLICATE", "OTHER"]),
  resolutionSummary: z.string().trim().min(8).max(3000),
  customerVisibleMessage: z.string().trim().min(4).max(4000),
});
router.post("/support-cases/:id/resolve", asyncHandler(async (req, res) => {
  const parsed = supportResolveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Resolution evidence is incomplete", errors: parsed.error.flatten() });
  const current = await prisma.contactMessage.findUnique({ where: { id: String(req.params.id) } });
  if (!current) return res.status(404).json({ success: false, message: "Support case not found" });
  if (["CLOSED", "SPAM"].includes(current.status)) return res.status(409).json({ success: false, message: "This case can no longer be resolved" });
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.supportMessage.create({ data: { ticketId: current.id, sender: "ADMIN", authorUserId: req.user!.id, message: parsed.data.customerVisibleMessage, isInternal: false } });
    return tx.contactMessage.update({
      where: { id: current.id },
      data: {
        status: "RESOLVED",
        resolutionCode: parsed.data.resolutionCode as any,
        resolutionSummary: parsed.data.resolutionSummary,
        resolvedByUserId: req.user!.id,
        assignedAdminUserId: current.assignedAdminUserId || req.user!.id,
        firstResponseAt: current.firstResponseAt || now,
        lastAdminReplyAt: now,
        lastActivityAt: now,
        resolvedAt: now,
      },
    });
  });
  if (current.userId) {
    await createUserNotification({
      userId: current.userId,
      title: `Support case resolved · ${current.ticketNumber}`,
      message: parsed.data.customerVisibleMessage,
      type: "SUPPORT",
      ctaLabel: "Review resolution",
      ctaUrl: "/returns",
      metadata: { supportTicketId: current.id, ticketNumber: current.ticketNumber, resolutionCode: parsed.data.resolutionCode },
      dedupeKey: `support-resolved/${current.id}/${now.toISOString()}`,
    });
  }
  res.json({ success: true, data: { ...updated, supportHealth: phase84SupportHealth(updated) } });
}));

router.post("/support-cases/:id/reopen", asyncHandler(async (req, res) => {
  const current = await prisma.contactMessage.findUnique({ where: { id: String(req.params.id) } });
  if (!current) return res.status(404).json({ success: false, message: "Support case not found" });
  if (!["RESOLVED", "CLOSED"].includes(current.status)) return res.status(409).json({ success: false, message: "Only resolved cases can be reopened" });
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.contactMessage.update({ where: { id: current.id }, data: { status: "IN_PROGRESS", reopenedAt: now, resolvedAt: null, resolutionCode: null, resolutionSummary: null, satisfactionScore: null, satisfactionComment: null, satisfactionSubmittedAt: null, slaDueAt: phase84SupportSlaDueAt(now, current.priority), lastActivityAt: now } });
    await tx.supportMessage.create({ data: { ticketId: current.id, sender: "SYSTEM", message: "Case reopened by Riseora operations.", isInternal: false } });
    return item;
  });
  res.json({ success: true, data: { ...updated, supportHealth: phase84SupportHealth(updated) } });
}));


const phase87ExperimentFields = {
  experimentMode: z.enum(["NONE","HOLDOUT","AB_TEST"]).default("NONE"),
  holdoutPercent: z.number().int().min(0).max(PHASE87_ATTRIBUTION_POLICY.maxHoldoutPercent).default(10),
  variantBLabel: z.string().trim().min(1).max(60).optional().or(z.literal("")),
  attributionWindowDays: z.number().int().min(PHASE87_ATTRIBUTION_POLICY.minAttributionWindowDays).max(PHASE87_ATTRIBUTION_POLICY.maxAttributionWindowDays).default(30),
};
const retentionCampaignSchema = z.discriminatedUnion("benefitKind", [
  z.object({ name: z.string().trim().min(3).max(120), segment: z.enum(["NEW","ACTIVE","LOYAL","VIP","AT_RISK","LAPSED"]), benefitKind: z.literal("COUPON"), couponAmount: z.number().min(50).max(PHASE86_RETENTION_POLICY.maxCouponAmount), variantBCouponAmount: z.number().min(50).max(PHASE86_RETENTION_POLICY.maxCouponAmount).optional(), validDays: z.number().int().min(1).max(PHASE86_RETENTION_POLICY.maxValidDays).default(30), audiencePolicy: z.enum(["ACCOUNT_PERSONALIZATION","MARKETING_OPT_IN_ONLY"]).default("ACCOUNT_PERSONALIZATION"), ...phase87ExperimentFields }),
  z.object({ name: z.string().trim().min(3).max(120), segment: z.enum(["NEW","ACTIVE","LOYAL","VIP","AT_RISK","LAPSED"]), benefitKind: z.literal("REWARD_POINTS"), rewardPoints: z.number().int().min(50).max(PHASE86_RETENTION_POLICY.maxRewardPoints), variantBRewardPoints: z.number().int().min(50).max(PHASE86_RETENTION_POLICY.maxRewardPoints).optional(), pointValueRupees: z.number().min(0.01).max(10).default(1), validDays: z.number().int().min(1).max(PHASE86_RETENTION_POLICY.maxValidDays).default(30), audiencePolicy: z.enum(["ACCOUNT_PERSONALIZATION","MARKETING_OPT_IN_ONLY"]).default("ACCOUNT_PERSONALIZATION"), ...phase87ExperimentFields }),
]);

async function phase86CustomerRows() {
  const since = new Date(Date.now() - PHASE86_RETENTION_POLICY.campaignFatigueDays * 86400000);
  const recoverySince = new Date(Date.now() - PHASE86_RETENTION_POLICY.recentRecoverySuppressionDays * 86400000);
  return prisma.user.findMany({
    where: { role: "CUSTOMER", isActive: true },
    select: {
      id: true, firstName: true, lastName: true, email: true,
      marketingPreference: { select: { emailMarketing: true, smsMarketing: true, whatsappMarketing: true } },
      orders: { select: { status: true, totalAmount: true, createdAt: true, shipment: { select: { deliveredAt: true } } } },
      returnRequests: { select: { status: true } },
      supportTickets: { select: { status: true, satisfactionScore: true } },
      refillReminders: { select: { status: true, nextReminderAt: true } },
      supportRecoveryGrants: { where: { createdAt: { gte: recoverySince } }, select: { id: true } },
      retentionEnrollments: { where: { status: "ISSUED", createdAt: { gte: since } }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

function phase86EvaluateCustomer(row: any, campaign: { segment: string; audiencePolicy: string }) {
  const profile = phase86LifecycleProfile({ orders: row.orders, returns: row.returnRequests, tickets: row.supportTickets, reminders: row.refillReminders });
  const suppression = phase86Suppression({ profile, campaignSegment: campaign.segment, audiencePolicy: campaign.audiencePolicy, marketingPreference: row.marketingPreference, recentRecoveryCount: row.supportRecoveryGrants?.length || 0, recentCampaignCount: row.retentionEnrollments?.length || 0 });
  return { row, profile, suppression };
}

router.get("/phase86-retention/summary", asyncHandler(async (_req, res) => {
  const rows = await phase86CustomerRows();
  const profiles = rows.map((row: any) => phase86LifecycleProfile({ orders: row.orders, returns: row.returnRequests, tickets: row.supportTickets, reminders: row.refillReminders }));
  const [campaigns, issued30d, suppressed30d] = await Promise.all([
    prisma.retentionCampaign.count(),
    prisma.retentionEnrollment.count({ where: { status: "ISSUED", createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
    prisma.retentionEnrollment.count({ where: { status: "SUPPRESSED", createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
  ]);
  res.json({ success: true, data: { ...phase86GrowthSummary(profiles), campaigns, issued30d, suppressed30d } });
}));

router.get("/phase86-retention/campaigns", asyncHandler(async (_req, res) => {
  const rows = await prisma.retentionCampaign.findMany({ include: { _count: { select: { enrollments: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ success: true, data: rows });
}));

router.post("/phase86-retention/preview", asyncHandler(async (req, res) => {
  const parsed = retentionCampaignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid retention campaign", errors: parsed.error.flatten() });
  const rows = await phase86CustomerRows();
  const evaluated = rows.map((row: any) => phase86EvaluateCustomer(row, parsed.data)).filter((item: any) => item.profile.segment === parsed.data.segment);
  const eligible = evaluated.filter((item: any) => item.suppression.eligible);
  const suppressed = evaluated.filter((item: any) => !item.suppression.eligible);
  const reasonCounts: Record<string, number> = {};
  for (const item of suppressed) for (const reason of item.suppression.reasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  res.json({ success: true, data: { eligible: eligible.length, suppressed: suppressed.length, overAudienceLimit: eligible.length > PHASE86_RETENTION_POLICY.maxCampaignAudience, reasonCounts, sample: eligible.slice(0, 12).map(({row,profile}: any) => ({ id: row.id, name: `${row.firstName} ${row.lastName || ""}`.trim(), email: row.email, ...profile })) } });
}));

router.post("/phase86-retention/campaigns", asyncHandler(async (req, res) => {
  const parsed = retentionCampaignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid retention campaign", errors: parsed.error.flatten() });
  const rows = await phase86CustomerRows();
  const evaluated = rows.map((row: any) => phase86EvaluateCustomer(row, parsed.data)).filter((item: any) => item.profile.segment === parsed.data.segment);
  const eligible = evaluated.filter((item: any) => item.suppression.eligible).length;
  const suppressed = evaluated.length - eligible;
  if (eligible > PHASE86_RETENTION_POLICY.maxCampaignAudience) return res.status(409).json({ success: false, message: `RETENTION_AUDIENCE_BLOCKED: ${eligible} eligible customers exceeds the ${PHASE86_RETENTION_POLICY.maxCampaignAudience}-customer activation cap.` });
  const data: any = { name: parsed.data.name, segment: parsed.data.segment, benefitKind: parsed.data.benefitKind, audiencePolicy: parsed.data.audiencePolicy, validDays: parsed.data.validDays, createdByUserId: req.user!.id, previewEligible: eligible, previewSuppressed: suppressed, experimentMode: parsed.data.experimentMode, holdoutPercent: parsed.data.experimentMode === "NONE" ? 0 : parsed.data.holdoutPercent, variantBLabel: parsed.data.variantBLabel || null, attributionWindowDays: parsed.data.attributionWindowDays };
  if (parsed.data.benefitKind === "COUPON") { data.couponAmount = parsed.data.couponAmount; data.variantBCouponAmount = parsed.data.experimentMode === "AB_TEST" ? (parsed.data.variantBCouponAmount || parsed.data.couponAmount) : null; }
  else { data.rewardPoints = parsed.data.rewardPoints; data.variantBRewardPoints = parsed.data.experimentMode === "AB_TEST" ? (parsed.data.variantBRewardPoints || parsed.data.rewardPoints) : null; data.pointValueRupees = parsed.data.pointValueRupees; }
  const campaign = await prisma.retentionCampaign.create({ data });
  res.status(201).json({ success: true, data: campaign });
}));

router.post("/phase86-retention/campaigns/:id/activate", asyncHandler(async (req, res) => {
  const campaign = await prisma.retentionCampaign.findUnique({ where: { id: String(req.params.id) } });
  if (!campaign) return res.status(404).json({ success: false, message: "Retention campaign not found" });
  if (campaign.status !== "DRAFT") return res.status(409).json({ success: false, message: "Only a draft campaign can be activated" });
  const rows = await phase86CustomerRows();
  const evaluated = rows.map((row: any) => phase86EvaluateCustomer(row, campaign as any)).filter((item: any) => item.profile.segment === campaign.segment);
  const eligible = evaluated.filter((item: any) => item.suppression.eligible);
  if (eligible.length > PHASE86_RETENTION_POLICY.maxCampaignAudience) return res.status(409).json({ success: false, message: `RETENTION_AUDIENCE_BLOCKED: ${eligible.length} eligible customers exceeds the ${PHASE86_RETENTION_POLICY.maxCampaignAudience}-customer activation cap.` });
  const expiresAt = new Date(Date.now() + campaign.validDays * 86400000);
  let issued = 0, suppressed = 0;
  await prisma.$transaction(async (tx) => {
    for (const item of evaluated as any[]) {
      if (!item.suppression.eligible) {
        suppressed += 1;
        await tx.retentionEnrollment.create({ data: { campaignId: campaign.id, userId: item.row.id, segmentSnapshot: item.profile.segment as any, riskScoreSnapshot: item.profile.riskScore, lifetimeSpendSnapshot: item.profile.lifetimeSpend, status: "SUPPRESSED", suppressionReason: item.suppression.reasons.join(" | ") } });
        continue;
      }
      const experimentGroup = phase87ExperimentGroup(campaign.id, item.row.id, campaign.experimentMode, campaign.holdoutPercent);
      const exposedAt = new Date();
      if (experimentGroup === "CONTROL") {
        await tx.retentionEnrollment.create({ data: { campaignId: campaign.id, userId: item.row.id, segmentSnapshot: item.profile.segment as any, riskScoreSnapshot: item.profile.riskScore, lifetimeSpendSnapshot: item.profile.lifetimeSpend, status: "CONTROL", experimentGroup: "CONTROL", variantLabel: "Control", exposedAt, benefitFaceValue: 0 } });
        continue;
      }
      const variantB = experimentGroup === "VARIANT_B";
      const couponValue = Number(variantB ? (campaign.variantBCouponAmount || campaign.couponAmount || 0) : (campaign.couponAmount || 0));
      const pointsValue = Number(variantB ? (campaign.variantBRewardPoints || campaign.rewardPoints || 0) : (campaign.rewardPoints || 0));
      const variantLabel = experimentGroup === "VARIANT_B" ? (campaign.variantBLabel || "Variant B") : campaign.experimentMode === "NONE" ? "Standard" : "Variant A";
      let couponId: string | null = null, couponCodeSnapshot: string | null = null, rewardTransactionId: string | null = null;
      if (campaign.benefitKind === "COUPON") {
        const code = `GROW-${randomBytes(4).toString("hex").toUpperCase()}`;
        const coupon = await tx.coupon.create({ data: { code, description: `Phase 87 ${variantLabel} lifecycle benefit · ${campaign.name}`, discountType: "FIXED", discountValue: couponValue, scope: "ORDER", application: "ORDER_TOTAL", usageLimit: 1, perCustomerUsageLimit: 1, rewardOwnerUserId: item.row.id, startsAt: new Date(), endsAt: expiresAt, isActive: true } });
        couponId = coupon.id; couponCodeSnapshot = code;
      } else {
        const account = await tx.rewardAccount.upsert({ where: { userId: item.row.id }, create: { userId: item.row.id, balance: pointsValue, lifetimeEarned: pointsValue }, update: { balance: { increment: pointsValue }, lifetimeEarned: { increment: pointsValue } } });
        const reward = await tx.rewardTransaction.create({ data: { userId: item.row.id, type: "ADMIN_ADJUST", points: pointsValue, balanceAfter: account.balance, description: `Phase 87 ${variantLabel} lifecycle campaign · ${campaign.name}`, sourceKey: `retention/${campaign.id}/${item.row.id}`, metadata: { campaignId: campaign.id, segment: campaign.segment, experimentGroup, variantLabel } } });
        rewardTransactionId = reward.id;
      }
      const benefitFaceValue = campaign.benefitKind === "COUPON" ? couponValue : pointsValue;
      const enrollment = await tx.retentionEnrollment.create({ data: { campaignId: campaign.id, userId: item.row.id, segmentSnapshot: item.profile.segment as any, riskScoreSnapshot: item.profile.riskScore, lifetimeSpendSnapshot: item.profile.lifetimeSpend, status: "ISSUED", experimentGroup: experimentGroup as any, variantLabel, exposedAt, benefitFaceValue, couponId, couponCodeSnapshot, rewardTransactionId, expiresAt: campaign.benefitKind === "COUPON" ? expiresAt : null, notifiedAt: new Date() } });
      await tx.notification.create({ data: { userId: item.row.id, title: `A Riseora benefit for your ${String(item.profile.segment).replaceAll("_"," ").toLowerCase()} journey`, message: campaign.benefitKind === "COUPON" ? `₹${couponValue.toFixed(0)} personal coupon ${couponCodeSnapshot} is ready for you.` : `${pointsValue} reward points have been added to your account.`, type: "CAMPAIGN", ctaLabel: "View my benefits", ctaUrl: "/returns", metadata: { campaignId: campaign.id, retentionEnrollmentId: enrollment.id, segment: campaign.segment, experimentGroup, variantLabel }, dedupeKey: `retention/${campaign.id}/${item.row.id}` } });
      issued += 1;
    }
    await tx.retentionCampaign.update({ where: { id: campaign.id }, data: { status: "COMPLETED", activatedAt: new Date(), completedAt: new Date(), previewEligible: issued, previewSuppressed: suppressed } });
  }, { timeout: 30000 });
  res.json({ success: true, data: { campaignId: campaign.id, issued, suppressed } });
}));


async function phase87AttributionDataset() {
  const enrollments:any[] = await prisma.retentionEnrollment.findMany({
    where: { status: { in: ["ISSUED", "CONTROL"] } },
    include: { campaign: true, coupon: { include: { redemptions: { include: { order: { select: { id:true, status:true, totalAmount:true, discountAmount:true, createdAt:true, orderNumber:true, userId:true } } } } } } },
    orderBy: { createdAt: "asc" },
  });
  if (!enrollments.length) return { enrollments, orders:[], attributed:[] };
  const earliest = enrollments.map((e:any)=>new Date(e.exposedAt || e.createdAt).getTime()).reduce((a:number,b:number)=>Math.min(a,b), Date.now());
  const orders:any[] = await prisma.order.findMany({ where: { status:"DELIVERED", userId:{ not:null }, createdAt:{ gte:new Date(earliest) } }, select:{ id:true,userId:true,status:true,totalAmount:true,discountAmount:true,createdAt:true,orderNumber:true }, orderBy:{ createdAt:"asc" } });
  return { enrollments, orders, attributed: phase87BuildAttribution(enrollments as any, orders as any) };
}

router.get("/phase87-growth/summary", asyncHandler(async (_req, res) => {
  const { enrollments, attributed } = await phase87AttributionDataset();
  const campaigns:any[] = await prisma.retentionCampaign.findMany({ where:{ status:"COMPLETED" }, orderBy:{ createdAt:"desc" }, take:100 });
  const rows = campaigns.map((c:any)=>phase87CampaignMetrics(c, enrollments as any, attributed as any));
  const attributedRevenue = rows.reduce((s:number,r:any)=>s+r.attributedRevenue,0);
  const incentiveCost = rows.reduce((s:number,r:any)=>s+r.incentiveCost,0);
  const conversions = rows.reduce((s:number,r:any)=>s+r.conversions,0);
  const best = [...rows].filter((r:any)=>r.roiPercent != null).sort((a:any,b:any)=>b.roiPercent-a.roiPercent)[0] || null;
  res.json({ success:true, data:{ campaigns:rows, totals:{ campaignCount:rows.length, conversions, attributedRevenue, incentiveCost, roiPercent:incentiveCost>0?((attributedRevenue-incentiveCost)/incentiveCost)*100:null, bestCampaign:best?{id:best.campaignId,name:best.name,roiPercent:best.roiPercent}:null } } });
}));

router.get("/phase87-growth/campaigns/:id", asyncHandler(async (req, res) => {
  const campaign:any = await prisma.retentionCampaign.findUnique({ where:{ id:String(req.params.id) } });
  if (!campaign) return res.status(404).json({ success:false, message:"Retention campaign not found" });
  const { enrollments, attributed } = await phase87AttributionDataset();
  const metrics = phase87CampaignMetrics(campaign, enrollments as any, attributed as any);
  const conversions = attributed.filter((a:any)=>a.enrollment.campaignId===campaign.id).slice(-100).reverse().map((a:any)=>({ orderNumber:a.order.orderNumber, revenue:a.order.totalAmount, kind:a.kind, group:a.enrollment.experimentGroup, variantLabel:a.enrollment.variantLabel }));
  res.json({ success:true, data:{ ...metrics, attributionWindowDays:campaign.attributionWindowDays, conversions } });
}));


const phase88DemandPlanSchema = z.object({
  name: z.string().trim().min(3).max(120),
  horizonDays: z.number().int().min(PHASE88_DEMAND_POLICY.minHorizonDays).max(PHASE88_DEMAND_POLICY.maxHorizonDays).default(30),
  leadTimeDays: z.number().int().min(PHASE88_DEMAND_POLICY.minLeadTimeDays).max(PHASE88_DEMAND_POLICY.maxLeadTimeDays).default(14),
  bufferDays: z.number().int().min(0).max(PHASE88_DEMAND_POLICY.maxBufferDays).default(7),
});

async function phase88LiveDemand(options:{horizonDays:number;leadTimeDays:number;bufferDays:number}) {
  const now=new Date(), since30=new Date(now.getTime()-30*86400000), since7=new Date(now.getTime()-7*86400000), horizonEnd=new Date(now.getTime()+options.horizonDays*86400000);
  const campaignSince=new Date(now.getTime()-PHASE88_DEMAND_POLICY.recentCampaignWindowDays*86400000);
  const [variants,recentCampaignCount]=await Promise.all([
    prisma.productVariant.findMany({
      where:{isActive:true,product:{isActive:true}},
      select:{
        id:true,sku:true,name:true,stockQuantity:true,safetyStock:true,lowStockThreshold:true,sellingPrice:true,costPrice:true,
        product:{select:{name:true}},
        orderItems:{where:{order:{status:{in:["CONFIRMED","PROCESSING","SHIPPED","DELIVERED"]},createdAt:{gte:since30}}},select:{quantity:true,order:{select:{createdAt:true}}}},
        refillReminders:{where:{status:"ACTIVE",nextReminderAt:{lte:horizonEnd}},select:{quantity:true,nextReminderAt:true}},
        stockAlerts:{where:{status:"PENDING"},select:{id:true}},
      },
      orderBy:[{product:{name:"asc"}},{name:"asc"}],
      take:500,
    }),
    prisma.retentionCampaign.count({where:{status:"COMPLETED",completedAt:{gte:campaignSince}}}),
  ]);
  const rows=variants.map((variant:any)=>{
    const sold30d=variant.orderItems.reduce((sum:number,item:any)=>sum+Number(item.quantity||0),0);
    const sold7d=variant.orderItems.filter((item:any)=>new Date(item.order.createdAt)>=since7).reduce((sum:number,item:any)=>sum+Number(item.quantity||0),0);
    const dueRefillQty=variant.refillReminders.reduce((sum:number,item:any)=>sum+Number(item.quantity||0),0);
    return phase88DemandRow({variantId:variant.id,sku:variant.sku,productName:variant.product.name,variantName:variant.name,stockQuantity:variant.stockQuantity,safetyStock:variant.safetyStock,lowStockThreshold:variant.lowStockThreshold,sellingPrice:variant.sellingPrice,costPrice:variant.costPrice,sold7d,sold30d,dueRefillQty,pendingStockAlerts:variant.stockAlerts.length},{...options,recentCampaignCount});
  });
  const riskRank:any={OUT_OF_STOCK:0,CRITICAL:1,LOW:2,OVERSTOCK:3,DORMANT:4,HEALTHY:5};
  rows.sort((a:any,b:any)=>(riskRank[a.risk]-riskRank[b.risk])||(b.potentialLostRevenue-a.potentialLostRevenue)||(b.recommendedReorderQty-a.recommendedReorderQty));
  return {options:{...options,recentCampaignCount},summary:phase88DemandSummary(rows),rows};
}

router.get("/phase88-demand/summary", asyncHandler(async (req,res)=>{
  const parsed=z.object({horizonDays:z.coerce.number().int().min(7).max(90).default(30),leadTimeDays:z.coerce.number().int().min(1).max(60).default(14),bufferDays:z.coerce.number().int().min(0).max(30).default(7)}).safeParse(req.query);
  if(!parsed.success)return res.status(400).json({success:false,message:"Invalid demand planning window"});
  const data=await phase88LiveDemand(parsed.data);
  res.json({success:true,data});
}));

router.get("/phase88-demand/plans", asyncHandler(async (_req,res)=>{
  const rows=await prisma.demandPlan.findMany({orderBy:{createdAt:"desc"},take:50,include:{_count:{select:{items:true}}}});
  res.json({success:true,data:rows});
}));

router.get("/phase88-demand/plans/:id", asyncHandler(async (req,res)=>{
  const plan=await prisma.demandPlan.findUnique({where:{id:String(req.params.id)},include:{items:{include:{variant:{select:{sku:true,name:true,product:{select:{name:true}}}}},orderBy:[{risk:"asc"},{recommendedReorderQty:"desc"}]}}});
  if(!plan)return res.status(404).json({success:false,message:"Demand plan not found"});
  res.json({success:true,data:plan});
}));

router.post("/phase88-demand/plans", asyncHandler(async (req,res)=>{
  const parsed=phase88DemandPlanSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Invalid replenishment plan",errors:parsed.error.flatten()});
  const live=await phase88LiveDemand(parsed.data);
  const summary=live.summary;
  const plan=await prisma.$transaction(async(tx)=>{
    const created=await tx.demandPlan.create({data:{name:parsed.data.name,status:"DRAFT",horizonDays:parsed.data.horizonDays,leadTimeDays:parsed.data.leadTimeDays,bufferDays:parsed.data.bufferDays,recentCampaignCount:live.options.recentCampaignCount,itemCount:summary.variants,projectedUnits:summary.projectedUnits,recommendedUnits:summary.recommendedUnits,stockoutRiskCount:summary.stockoutRisk,criticalRiskCount:summary.criticalRisk,overstockCount:summary.overstock,dormantCount:summary.dormant,inventoryValue:summary.inventoryValue,recommendedPurchaseValue:summary.recommendedPurchaseValue,potentialLostRevenue:summary.potentialLostRevenue,overstockCapital:summary.overstockCapital,generatedByUserId:req.user!.id}});
    if(live.rows.length)await tx.demandPlanItem.createMany({data:live.rows.map((row:any)=>({planId:created.id,variantId:row.variantId,risk:row.risk,action:row.action,currentStock:row.currentStock,safetyStock:row.safetyStock,lowStockThreshold:row.lowStockThreshold,availableToSell:row.availableToSell,sold7d:row.sold7d,sold30d:row.sold30d,dueRefillQty:row.dueRefillQty,pendingStockAlerts:row.pendingStockAlerts,dailyVelocity:row.dailyVelocity,campaignBufferPercent:row.campaignBufferPercent,projectedDemand:row.projectedDemand,targetStock:row.targetStock,recommendedReorderQty:row.recommendedReorderQty,recommendedPurchaseValue:row.recommendedPurchaseValue,coverDays:row.coverDays,inventoryValue:row.inventoryValue,potentialLostRevenue:row.potentialLostRevenue,overstockCapital:row.overstockCapital,reason:row.reason}))});
    return created;
  });
  res.status(201).json({success:true,data:plan});
}));

router.post("/phase88-demand/plans/:id/approve", asyncHandler(async (req,res)=>{
  const current=await prisma.demandPlan.findUnique({where:{id:String(req.params.id)}});
  if(!current)return res.status(404).json({success:false,message:"Demand plan not found"});
  if(current.status!=="DRAFT")return res.status(409).json({success:false,message:"Only a draft demand plan can be approved"});
  const plan=await prisma.demandPlan.update({where:{id:current.id},data:{status:"APPROVED",approvedAt:new Date(),approvedByUserId:req.user!.id}});
  res.json({success:true,data:plan,message:"Plan approved as a planning record. Inventory quantities were not changed."});
}));

router.post("/phase88-demand/plans/:id/archive", asyncHandler(async (req,res)=>{
  const current=await prisma.demandPlan.findUnique({where:{id:String(req.params.id)}});
  if(!current)return res.status(404).json({success:false,message:"Demand plan not found"});
  const plan=await prisma.demandPlan.update({where:{id:current.id},data:{status:"ARCHIVED"}});
  res.json({success:true,data:plan});
}));


// Phase 89 · Supplier Procurement, Purchase Orders & Goods Receipt Control
const phase89SupplierSchema=z.object({
  name:z.string().trim().min(2).max(160),contactName:z.string().trim().max(120).nullable().optional(),email:z.string().trim().email().nullable().optional(),phone:z.string().trim().max(30).nullable().optional(),gstin:z.string().trim().max(30).nullable().optional(),addressLine1:z.string().trim().max(180).nullable().optional(),addressLine2:z.string().trim().max(180).nullable().optional(),city:z.string().trim().max(100).nullable().optional(),state:z.string().trim().max(100).nullable().optional(),postalCode:z.string().trim().max(20).nullable().optional(),country:z.string().trim().max(100).default("India"),status:z.enum(["ACTIVE","INACTIVE","HOLD"]).default("ACTIVE"),defaultLeadTimeDays:z.number().int().min(1).max(120).default(14),minimumOrderValue:z.number().min(0).default(0),paymentTermsDays:z.number().int().min(0).max(180).default(0),isPreferred:z.boolean().default(false),notes:z.string().trim().max(2000).nullable().optional()
});
const phase89OfferSchema=z.object({supplierId:z.string().uuid(),variantId:z.string().uuid(),supplierSku:z.string().trim().max(120).nullable().optional(),unitCost:z.number().positive(),minimumOrderQty:z.number().int().min(1).max(100000).default(1),packSize:z.number().int().min(1).max(100000).default(1),leadTimeDays:z.number().int().min(1).max(120).default(14),isPreferred:z.boolean().default(false),isActive:z.boolean().default(true)});
const phase89ReceiptSchema=z.object({receiptKey:z.string().uuid(),supplierInvoiceNumber:z.string().trim().max(120).nullable().optional(),supplierInvoiceDate:z.coerce.date().nullable().optional(),notes:z.string().trim().max(2000).nullable().optional(),items:z.array(z.object({purchaseOrderItemId:z.string().uuid(),acceptedQty:z.number().int().min(0).max(100000),rejectedQty:z.number().int().min(0).max(100000).default(0),actualUnitCost:z.number().positive().optional(),batchNumber:z.string().trim().max(120).nullable().optional(),expiryDate:z.coerce.date().nullable().optional(),qualityNote:z.string().trim().max(1000).nullable().optional()})).min(1).max(250)});
const phase89PoNumber=()=>`PO-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${randomBytes(3).toString("hex").toUpperCase()}`;
const phase89GrnNumber=()=>`GRN-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${randomBytes(3).toString("hex").toUpperCase()}`;

async function phase89PlanRecommendations(planId:string){
  const plan:any=await prisma.demandPlan.findUnique({where:{id:planId},include:{items:{where:{recommendedReorderQty:{gt:0}},include:{variant:{select:{id:true,sku:true,name:true,gstRate:true,costPrice:true,product:{select:{name:true}},supplierOffers:{where:{isActive:true},include:{supplier:true}}}}},orderBy:{recommendedReorderQty:"desc"}}}});
  if(!plan)return null;
  const rows=plan.items.map((item:any)=>{
    const offers=phase89RankSupplierOffers(item.variant.supplierOffers.map((offer:any)=>({id:offer.id,supplierId:offer.supplierId,supplierName:offer.supplier.name,unitCost:offer.unitCost,minimumOrderQty:offer.minimumOrderQty,packSize:offer.packSize,leadTimeDays:offer.leadTimeDays,isPreferred:offer.isPreferred,supplierPreferred:offer.supplier.isPreferred,supplierStatus:offer.supplier.status,supplierSku:offer.supplierSku,supplierMinimumOrderValue:Number(offer.supplier.minimumOrderValue||0)})),item.recommendedReorderQty);
    return {demandPlanItemId:item.id,variantId:item.variantId,sku:item.variant.sku,productName:item.variant.product.name,variantName:item.variant.name,recommendedReorderQty:item.recommendedReorderQty,gstRate:Number(item.variant.gstRate||0),currentCost:item.variant.costPrice==null?null:Number(item.variant.costPrice),offers,recommended:offers[0]||null};
  });
  const covered=rows.filter((r:any)=>r.recommended).length,uncovered=rows.length-covered;
  const purchaseValue=rows.reduce((sum:number,r:any)=>sum+Number(r.recommended?.purchaseValue||0),0);
  const supplierGroups=new Map<string,{supplierId:string;supplierName:string;purchaseValue:number;minimumOrderValue:number}>();
  for(const row of rows){if(!row.recommended)continue;const id=row.recommended.supplierId;const current=supplierGroups.get(id)||{supplierId:id,supplierName:row.recommended.supplierName,purchaseValue:0,minimumOrderValue:Number(row.recommended.supplierMinimumOrderValue||0)};current.purchaseValue=Math.round((current.purchaseValue+Number(row.recommended.purchaseValue||0))*100)/100;supplierGroups.set(id,current);}
  const groups=[...supplierGroups.values()].map(g=>({...g,minimumOrderReady:g.purchaseValue>=g.minimumOrderValue}));
  const minimumOrderBlocked=groups.filter(g=>!g.minimumOrderReady).length;
  return {plan:{id:plan.id,name:plan.name,status:plan.status,recommendedUnits:plan.recommendedUnits,approvedAt:plan.approvedAt},rows,groups,coverage:{items:rows.length,covered,uncovered,minimumOrderBlocked,purchaseValue:Math.round(purchaseValue*100)/100}};
}

router.get("/phase89-procurement/summary",asyncHandler(async(_req,res)=>{
  const now=new Date();
  const [suppliers,variants,plans,purchaseOrders,receipts]=await Promise.all([
    prisma.supplier.findMany({orderBy:[{isPreferred:"desc"},{name:"asc"}],include:{variantOffers:{where:{isActive:true},select:{id:true,variantId:true,unitCost:true,minimumOrderQty:true,packSize:true,leadTimeDays:true,isPreferred:true,supplierSku:true}}},take:PHASE89_PROCUREMENT_POLICY.maxSuppliers}),
    prisma.productVariant.findMany({where:{isActive:true,product:{isActive:true}},select:{id:true,sku:true,name:true,costPrice:true,stockQuantity:true,product:{select:{name:true}}},orderBy:[{product:{name:"asc"}},{name:"asc"}],take:500}),
    prisma.demandPlan.findMany({where:{status:"APPROVED"},select:{id:true,name:true,recommendedUnits:true,recommendedPurchaseValue:true,approvedAt:true,_count:{select:{purchaseOrders:true}}},orderBy:{approvedAt:"desc"},take:30}),
    prisma.purchaseOrder.findMany({include:{supplier:true,items:{include:{variant:{select:{sku:true,name:true,product:{select:{name:true}}}}}},receipts:{select:{id:true,grnNumber:true,receivedAt:true,totalAcceptedQty:true,totalRejectedQty:true,varianceItemCount:true}}},orderBy:{createdAt:"desc"},take:60}),
    prisma.goodsReceipt.findMany({include:{purchaseOrder:{select:{poNumber:true,supplier:{select:{name:true}}}}},orderBy:{receivedAt:"desc"},take:30})
  ]);
  const openStatuses=new Set(["APPROVED","SENT","PARTIALLY_RECEIVED"]);
  const open=purchaseOrders.filter((p:any)=>openStatuses.has(p.status));
  const overdue=open.filter((p:any)=>p.expectedAt&&new Date(p.expectedAt).getTime()+PHASE89_PROCUREMENT_POLICY.overdueGraceDays*86400000<now.getTime());
  const openValue=open.reduce((sum:number,p:any)=>sum+Number(p.totalAmount||0),0);
  const pendingUnits=open.reduce((sum:number,p:any)=>sum+p.items.reduce((a:number,i:any)=>a+Math.max(0,Number(i.orderedQty)-Number(i.receivedQty)),0),0);
  const varianceReceipts=receipts.filter((r:any)=>Number(r.varianceItemCount)>0).length;
  res.json({success:true,data:{suppliers,variants,plans,purchaseOrders,receipts,kpis:{suppliers:suppliers.filter((x:any)=>x.status==="ACTIVE").length,preferredSuppliers:suppliers.filter((x:any)=>x.status==="ACTIVE"&&x.isPreferred).length,openPurchaseOrders:open.length,openPoValue:Math.round(openValue*100)/100,pendingUnits,overduePurchaseOrders:overdue.length,varianceReceipts}}});
}));

router.post("/phase89-procurement/suppliers",asyncHandler(async(req,res)=>{
  const parsed=phase89SupplierSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Invalid supplier",errors:parsed.error.flatten()});
  const duplicate=await prisma.supplier.findUnique({where:{name:parsed.data.name}});if(duplicate)return res.status(409).json({success:false,message:"A supplier with this name already exists"});
  const row=await prisma.supplier.create({data:parsed.data as any});res.status(201).json({success:true,data:row});
}));
router.patch("/phase89-procurement/suppliers/:id",asyncHandler(async(req,res)=>{
  const parsed=phase89SupplierSchema.partial().safeParse(req.body);if(!parsed.success||!Object.keys(parsed.data).length)return res.status(400).json({success:false,message:"Invalid supplier update"});
  const row=await prisma.supplier.update({where:{id:String(req.params.id)},data:parsed.data as any});res.json({success:true,data:row});
}));
router.post("/phase89-procurement/offers",asyncHandler(async(req,res)=>{
  const parsed=phase89OfferSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Invalid supplier variant offer",errors:parsed.error.flatten()});
  const [supplier,variant]=await Promise.all([prisma.supplier.findUnique({where:{id:parsed.data.supplierId}}),prisma.productVariant.findUnique({where:{id:parsed.data.variantId}})]);
  if(!supplier||supplier.status!=="ACTIVE")return res.status(409).json({success:false,message:"Supplier must be active"});if(!variant||!variant.isActive)return res.status(409).json({success:false,message:"Product variant must be active"});
  const row=await prisma.supplierVariant.upsert({where:{supplierId_variantId:{supplierId:parsed.data.supplierId,variantId:parsed.data.variantId}},create:{...parsed.data,lastQuotedAt:new Date()} as any,update:{supplierSku:parsed.data.supplierSku??null,unitCost:parsed.data.unitCost,minimumOrderQty:parsed.data.minimumOrderQty,packSize:parsed.data.packSize,leadTimeDays:parsed.data.leadTimeDays,isPreferred:parsed.data.isPreferred,isActive:parsed.data.isActive,lastQuotedAt:new Date()}});res.json({success:true,data:row});
}));
router.get("/phase89-procurement/plans/:id/recommendations",asyncHandler(async(req,res)=>{const data=await phase89PlanRecommendations(String(req.params.id));if(!data)return res.status(404).json({success:false,message:"Demand plan not found"});res.json({success:true,data});}));

router.post("/phase89-procurement/plans/:id/generate-purchase-orders",asyncHandler(async(req,res)=>{
  const rec:any=await phase89PlanRecommendations(String(req.params.id));if(!rec)return res.status(404).json({success:false,message:"Demand plan not found"});if(rec.plan.status!=="APPROVED")return res.status(409).json({success:false,message:"PROCUREMENT_PLAN_BLOCKED: only an approved Phase 88 plan can create purchase orders"});if(rec.coverage.uncovered>0)return res.status(409).json({success:false,message:`PROCUREMENT_SUPPLIER_COVERAGE_BLOCKED: ${rec.coverage.uncovered} reorder item(s) do not have an active supplier offer`});if(rec.coverage.minimumOrderBlocked>0)return res.status(409).json({success:false,message:`PROCUREMENT_MINIMUM_ORDER_BLOCKED: ${rec.coverage.minimumOrderBlocked} supplier group(s) are below the configured minimum order value`});
  const existing=await prisma.purchaseOrder.count({where:{demandPlanId:rec.plan.id,status:{not:"CANCELLED"}}});if(existing)return res.status(409).json({success:false,message:"PROCUREMENT_PLAN_ALREADY_CONVERTED: active purchase orders already exist for this demand plan"});
  const groups=new Map<string,any[]>();for(const row of rec.rows){const sid=row.recommended.supplierId;if(!groups.has(sid))groups.set(sid,[]);groups.get(sid)!.push(row);}if(groups.size>PHASE89_PROCUREMENT_POLICY.maxPlanPurchaseOrders)return res.status(409).json({success:false,message:"PROCUREMENT_PLAN_BLOCKED: too many supplier purchase orders would be created"});
  const created=await prisma.$transaction(async(tx)=>{const result=[] as any[];for(const [supplierId,rows] of groups){const supplier:any=await tx.supplier.findUnique({where:{id:supplierId}});if(!supplier||supplier.status!=="ACTIVE")throw new Error("PROCUREMENT_SUPPLIER_INACTIVE");if(rows.length>PHASE89_PROCUREMENT_POLICY.maxItemsPerPurchaseOrder)throw new Error("PROCUREMENT_PO_ITEM_LIMIT");const totals=phase89PurchaseTotals(rows.map((r:any)=>({qty:r.recommended.orderQty,unitCost:r.recommended.unitCost,gstRate:r.gstRate})));const maxLead=Math.max(...rows.map((r:any)=>r.recommended.leadTimeDays),supplier.defaultLeadTimeDays);const expectedAt=new Date(Date.now()+maxLead*86400000);const po:any=await tx.purchaseOrder.create({data:{poNumber:phase89PoNumber(),supplierId,demandPlanId:rec.plan.id,status:"DRAFT",expectedAt,paymentTermsDays:supplier.paymentTermsDays,subtotal:totals.subtotal,taxAmount:totals.taxAmount,totalAmount:totals.totalAmount,createdByUserId:req.user!.id,notes:`Generated from approved demand plan ${rec.plan.name}`}});for(const row of rows){const qty=row.recommended.orderQty,unitCost=row.recommended.unitCost,subtotal=Math.round(qty*unitCost*100)/100,tax=Math.round(subtotal*row.gstRate)/100;await tx.purchaseOrderItem.create({data:{purchaseOrderId:po.id,variantId:row.variantId,supplierVariantId:row.recommended.id,demandPlanItemId:row.demandPlanItemId,orderedQty:qty,unitCost,gstRate:row.gstRate,lineSubtotal:subtotal,taxAmount:tax,lineTotal:Math.round((subtotal+tax)*100)/100,supplierSkuSnapshot:row.recommended.supplierSku,leadTimeDaysSnapshot:row.recommended.leadTimeDays}});}result.push(po);}return result;},{timeout:30000});
  res.status(201).json({success:true,data:created,message:`Created ${created.length} supplier purchase-order draft(s). Inventory was not changed.`});
}));

router.post("/phase89-procurement/purchase-orders/:id/approve",asyncHandler(async(req,res)=>{const current=await prisma.purchaseOrder.findUnique({where:{id:String(req.params.id)}});if(!current)return res.status(404).json({success:false,message:"Purchase order not found"});if(current.status!=="DRAFT")return res.status(409).json({success:false,message:"Only draft purchase orders can be approved"});const row=await prisma.purchaseOrder.update({where:{id:current.id},data:{status:"APPROVED",approvedAt:new Date(),approvedByUserId:req.user!.id}});res.json({success:true,data:row});}));
router.post("/phase89-procurement/purchase-orders/:id/send",asyncHandler(async(req,res)=>{const current=await prisma.purchaseOrder.findUnique({where:{id:String(req.params.id)},include:{supplier:true}});if(!current)return res.status(404).json({success:false,message:"Purchase order not found"});if(current.status!=="APPROVED")return res.status(409).json({success:false,message:"Only approved purchase orders can be marked sent"});if(current.supplier.status!=="ACTIVE")return res.status(409).json({success:false,message:"PROCUREMENT_SUPPLIER_INACTIVE"});const row=await prisma.purchaseOrder.update({where:{id:current.id},data:{status:"SENT",sentAt:new Date(),sentByUserId:req.user!.id}});res.json({success:true,data:row,message:"Purchase order marked sent. No stock was changed."});}));
router.post("/phase89-procurement/purchase-orders/:id/cancel",asyncHandler(async(req,res)=>{const current:any=await prisma.purchaseOrder.findUnique({where:{id:String(req.params.id)},include:{items:true}});if(!current)return res.status(404).json({success:false,message:"Purchase order not found"});if(["RECEIVED","CANCELLED"].includes(current.status)||current.items.some((i:any)=>i.receivedQty>0))return res.status(409).json({success:false,message:"A received or partially received purchase order cannot be cancelled"});const row=await prisma.purchaseOrder.update({where:{id:current.id},data:{status:"CANCELLED",closedAt:new Date()}});res.json({success:true,data:row});}));

router.post("/phase89-procurement/purchase-orders/:id/receive",asyncHandler(async(req,res)=>{
  const parsed=phase89ReceiptSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Invalid goods receipt",errors:parsed.error.flatten()});
  const prior:any=await prisma.goodsReceipt.findUnique({where:{receiptKey:parsed.data.receiptKey}});if(prior)return res.json({success:true,data:prior,message:`${prior.grnNumber} was already posted for this receipt request. No duplicate stock movement was created.`});
  const po:any=await prisma.purchaseOrder.findUnique({where:{id:String(req.params.id)},include:{supplier:true,items:true}});if(!po)return res.status(404).json({success:false,message:"Purchase order not found"});if(!["SENT","PARTIALLY_RECEIVED"].includes(po.status))return res.status(409).json({success:false,message:"GOODS_RECEIPT_BLOCKED: purchase order must be sent before receiving"});
  const byId=new Map(po.items.map((i:any)=>[i.id,i]));const seen=new Set<string>();const prepared=[] as any[];for(const row of parsed.data.items){if(seen.has(row.purchaseOrderItemId))return res.status(400).json({success:false,message:"Duplicate PO item in receipt"});seen.add(row.purchaseOrderItemId);const item:any=byId.get(row.purchaseOrderItemId);if(!item)return res.status(400).json({success:false,message:"Receipt item does not belong to this purchase order"});if(row.acceptedQty+row.rejectedQty<=0)return res.status(400).json({success:false,message:"Each receipt row must accept or reject at least one unit"});const outstanding=Math.max(0,item.orderedQty-item.receivedQty);if(row.acceptedQty+row.rejectedQty>outstanding)return res.status(409).json({success:false,message:`GOODS_RECEIPT_OVERAGE_BLOCKED: physical received quantity exceeds outstanding quantity for PO item ${item.id}`});const actual=row.actualUnitCost??Number(item.unitCost);const variance=phase89ReceiptVariance({expectedUnitCost:item.unitCost,actualUnitCost:actual,rejectedQty:row.rejectedQty});prepared.push({row,item,actual,variance});}
  const result=await prisma.$transaction(async(tx)=>{const totalAccepted=prepared.reduce((a,x)=>a+x.row.acceptedQty,0),totalRejected=prepared.reduce((a,x)=>a+x.row.rejectedQty,0),varianceItemCount=prepared.filter(x=>x.variance.status!=="MATCHED").length;const receipt:any=await tx.goodsReceipt.create({data:{receiptKey:parsed.data.receiptKey,grnNumber:phase89GrnNumber(),purchaseOrderId:po.id,status:"POSTED",supplierInvoiceNumber:parsed.data.supplierInvoiceNumber??null,supplierInvoiceDate:parsed.data.supplierInvoiceDate??null,totalAcceptedQty:totalAccepted,totalRejectedQty:totalRejected,varianceItemCount,notes:parsed.data.notes??null,createdByUserId:req.user!.id,postedByUserId:req.user!.id,postedAt:new Date()}});for(const item of prepared){const receiptItem:any=await tx.goodsReceiptItem.create({data:{goodsReceiptId:receipt.id,purchaseOrderItemId:item.item.id,variantId:item.item.variantId,acceptedQty:item.row.acceptedQty,rejectedQty:item.row.rejectedQty,expectedUnitCost:item.item.unitCost,actualUnitCost:item.actual,varianceStatus:item.variance.status as any,batchNumber:item.row.batchNumber??null,expiryDate:item.row.expiryDate??null,qualityNote:item.row.qualityNote??null}});if(item.row.rejectedQty>0)await (tx as any).supplierQualityIncident.upsert({where:{sourceKey:`receipt-rejection/${receiptItem.id}`},create:{sourceKey:`receipt-rejection/${receiptItem.id}`,supplierId:po.supplierId,type:"RECEIPT_REJECTION",severity:item.row.rejectedQty>=Math.max(5,item.row.acceptedQty)?"MAJOR":"MINOR",status:"OPEN",title:`Receipt rejection · ${receipt.grnNumber}`,notes:item.row.qualityNote||`${item.row.rejectedQty} unit(s) rejected at goods receipt`},update:{notes:item.row.qualityNote||`${item.row.rejectedQty} unit(s) rejected at goods receipt`}});if(["COST_VARIANCE","COST_AND_QUALITY_VARIANCE"].includes(item.variance.status))await (tx as any).supplierQualityIncident.upsert({where:{sourceKey:`receipt-cost/${receiptItem.id}`},create:{sourceKey:`receipt-cost/${receiptItem.id}`,supplierId:po.supplierId,type:"COST_VARIANCE",severity:"MINOR",status:"OPEN",title:`Cost variance · ${receipt.grnNumber}`,notes:`Expected ${item.item.unitCost}; received ${item.actual}`},update:{notes:`Expected ${item.item.unitCost}; received ${item.actual}`}});await tx.purchaseOrderItem.update({where:{id:item.item.id},data:{receivedQty:{increment:item.row.acceptedQty},rejectedQty:{increment:item.row.rejectedQty}}});if(item.row.acceptedQty>0){await phase91CreateInboundQaHold(tx,{variantId:item.item.variantId,quantity:item.row.acceptedQty,batchCode:item.row.batchNumber?`${receipt.grnNumber}-${item.row.batchNumber}`:`${receipt.grnNumber}-${String(item.item.id).slice(0,8)}`,expiryDate:item.row.expiryDate??null,unitCost:item.actual,goodsReceiptItemId:receiptItem.id,referenceId:receipt.id,actorUserId:req.user!.id});}}
    const latest:any[]=await tx.purchaseOrderItem.findMany({where:{purchaseOrderId:po.id}});const complete=latest.every((i:any)=>i.receivedQty>=i.orderedQty);const status=complete?"RECEIVED":"PARTIALLY_RECEIVED";await tx.purchaseOrder.update({where:{id:po.id},data:{status:status as any,closedAt:complete?new Date():null}});return {...receipt,purchaseOrderStatus:status};},{timeout:30000});
  res.status(201).json({success:true,data:result,message:`${result.grnNumber} posted. Accepted units are physically received on Phase 91 QA hold and remain non-sellable until quality release.`});
}));


// Phase 90 · Warehouse, Batch, Expiry, Cycle Count & Recall Control V2
const phase90WarehouseSchema=z.object({code:z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/),name:z.string().trim().min(2).max(120),status:z.enum(["ACTIVE","HOLD","INACTIVE"]).default("ACTIVE"),isDefault:z.boolean().default(false),addressLine1:z.string().trim().max(180).optional().or(z.literal("")),city:z.string().trim().max(100).optional().or(z.literal("")),state:z.string().trim().max(100).optional().or(z.literal("")),postalCode:z.string().trim().max(20).optional().or(z.literal("")),notes:z.string().trim().max(1000).optional().or(z.literal(""))});
const phase90BinSchema=z.object({warehouseId:z.string().uuid(),code:z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/),name:z.string().trim().min(1).max(120),kind:z.enum(["PICK","BULK","QUARANTINE","RETURNS"]).default("PICK")});
const phase90BatchActionSchema=z.object({note:z.string().trim().min(3).max(1000)});
const phase90WriteOffSchema=z.object({quantity:z.number().int().positive(),reason:z.string().trim().min(3).max(1000)});
const phase90CountSchema=z.object({warehouseId:z.string().uuid(),notes:z.string().trim().max(1000).optional().or(z.literal(""))});
const phase90CountItemsSchema=z.object({items:z.array(z.object({batchId:z.string().uuid(),countedQty:z.number().int().nonnegative(),reason:z.string().trim().max(500).optional().or(z.literal(""))})).min(1).max(PHASE90_WAREHOUSE_POLICY.cycleCountMaxItems)});
const phase90RecallSchema=z.object({batchIds:z.array(z.string().uuid()).min(1).max(PHASE90_WAREHOUSE_POLICY.recallMaxBatches),reason:z.string().trim().min(5).max(2000),customerMessage:z.string().trim().max(2000).optional().or(z.literal(""))});
const phase90Code=(prefix:string)=>`${prefix}-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${randomBytes(3).toString("hex").toUpperCase()}`;

router.get("/phase90-warehouse/overview",asyncHandler(async(_req,res)=>{res.json({success:true,data:await phase90WarehouseOverview(prisma)});}));

router.post("/phase90-warehouse/warehouses",asyncHandler(async(req,res)=>{
  const parsed=phase90WarehouseSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Invalid warehouse",errors:parsed.error.flatten()});
  const row=await prisma.$transaction(async(tx)=>{if(parsed.data.isDefault)await (tx as any).warehouse.updateMany({data:{isDefault:false}});return (tx as any).warehouse.create({data:{...parsed.data,addressLine1:parsed.data.addressLine1||null,city:parsed.data.city||null,state:parsed.data.state||null,postalCode:parsed.data.postalCode||null,notes:parsed.data.notes||null}});});
  res.status(201).json({success:true,data:row});
}));

router.post("/phase90-warehouse/bins",asyncHandler(async(req,res)=>{
  const parsed=phase90BinSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Invalid warehouse bin",errors:parsed.error.flatten()});
  const wh:any=await (prisma as any).warehouse.findUnique({where:{id:parsed.data.warehouseId}});if(!wh||wh.status==="INACTIVE")return res.status(409).json({success:false,message:"Warehouse must exist and be operational"});
  const row=await (prisma as any).warehouseBin.create({data:parsed.data});res.status(201).json({success:true,data:row});
}));

router.get("/phase90-warehouse/batches/:id/trace",asyncHandler(async(req,res)=>{
  const batch:any=await (prisma as any).inventoryBatch.findUnique({where:{id:String(req.params.id)},include:{variant:{include:{product:true}},warehouse:true,bin:true,goodsReceiptItem:{include:{goodsReceipt:{include:{purchaseOrder:{include:{supplier:true}}}}}},movements:{orderBy:{createdAt:"desc"},take:100},orderAllocations:{include:{order:{select:{orderNumber:true,status:true,customerName:true,userId:true}}},orderBy:{shippedAt:"desc"}},recallLinks:{include:{recall:true},orderBy:{createdAt:"desc"}}}});
  if(!batch)return res.status(404).json({success:false,message:"Batch not found"});res.json({success:true,data:batch});
}));

router.post("/phase90-warehouse/batches/:id/quarantine",asyncHandler(async(req,res)=>{
  const parsed=phase90BatchActionSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Quarantine reason is required"});
  try{const result=await prisma.$transaction(tx=>phase90BlockBatch(tx,{batchId:String(req.params.id),mode:"QUARANTINE",referenceType:"BATCH",referenceId:String(req.params.id),actorUserId:req.user!.id,note:parsed.data.note}));res.json({success:true,data:result,message:`${result.blockedQty} sellable unit(s) moved to quarantine.`});}catch(error){const m=error instanceof Error?error.message:"WAREHOUSE_ACTION_FAILED";if(m==="BATCH_NOT_FOUND")return res.status(404).json({success:false,message:"Batch not found"});throw error;}
}));

router.post("/phase90-warehouse/batches/:id/release",asyncHandler(async(req,res)=>{
  const parsed=phase90BatchActionSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Release note is required"});
  try{const result=await prisma.$transaction(tx=>phase90ReleaseQuarantine(tx,String(req.params.id),req.user!.id,parsed.data.note));res.json({success:true,data:result,message:"Quarantined stock returned to sellable inventory."});}catch(error){const m=error instanceof Error?error.message:"WAREHOUSE_ACTION_FAILED";if(["BATCH_RELEASE_BLOCKED","BATCH_EXPIRED_RELEASE_BLOCKED","BATCH_QA_RELEASE_REQUIRED"].includes(m))return res.status(409).json({success:false,code:m,message:m==="BATCH_EXPIRED_RELEASE_BLOCKED"?"Expired inventory cannot be released to sellable stock.":m==="BATCH_QA_RELEASE_REQUIRED"?"Quality-held inventory must be released through Phase 91 QA, not the warehouse quarantine action.":"Only a quarantined batch can be released."});throw error;}
}));

router.post("/phase90-warehouse/batches/:id/write-off",asyncHandler(async(req,res)=>{
  const parsed=phase90WriteOffSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Valid write-off quantity and reason are required",errors:parsed.error.flatten()});
  try{const result=await prisma.$transaction(tx=>phase90WriteOffBatch(tx,String(req.params.id),parsed.data.quantity,req.user!.id,parsed.data.reason));res.json({success:true,data:result,message:"Write-off posted with batch and aggregate inventory evidence."});}catch(error){const m=error instanceof Error?error.message:"WAREHOUSE_ACTION_FAILED";if(m==="BATCH_WRITEOFF_BLOCKED")return res.status(409).json({success:false,code:m,message:"Write-off cannot consume reserved stock or exceed the physical batch quantity."});throw error;}
}));

router.post("/phase90-warehouse/expiry-sweep",asyncHandler(async(req,res)=>{
  const rows:any[]=await (prisma as any).inventoryBatch.findMany({where:{status:"AVAILABLE",expiryDate:{lt:new Date()}},orderBy:{expiryDate:"asc"},take:PHASE90_WAREHOUSE_POLICY.expirySweepMaxBatches});
  const result=await prisma.$transaction(async tx=>{let batches=0,units=0;for(const row of rows){const held=await phase90BlockBatch(tx,{batchId:row.id,mode:"EXPIRED",referenceType:"EXPIRY_SWEEP",referenceId:`EXPIRY-${new Date().toISOString().slice(0,10)}`,actorUserId:req.user!.id,note:"Phase 90 expiry sweep removed expired stock from sellable inventory"});if(held.blockedQty){batches++;units+=held.blockedQty;}}return {batches,units};},{timeout:30000});
  res.json({success:true,data:result,message:`Expiry sweep blocked ${result.units} unit(s) across ${result.batches} batch(es).`});
}));

router.post("/phase90-warehouse/cycle-counts",asyncHandler(async(req,res)=>{
  const parsed=phase90CountSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Invalid cycle count",errors:parsed.error.flatten()});
  const wh:any=await (prisma as any).warehouse.findUnique({where:{id:parsed.data.warehouseId}});if(!wh||wh.status!=="ACTIVE")return res.status(409).json({success:false,message:"Cycle count requires an active warehouse"});
  const batches:any[]=await (prisma as any).inventoryBatch.findMany({where:{warehouseId:wh.id,status:{not:"DEPLETED"}},orderBy:{createdAt:"asc"},take:PHASE90_WAREHOUSE_POLICY.cycleCountMaxItems+1});if(batches.length>PHASE90_WAREHOUSE_POLICY.cycleCountMaxItems)return res.status(409).json({success:false,message:"CYCLE_COUNT_SCOPE_TOO_LARGE: narrow the warehouse inventory before counting"});
  const count=await prisma.$transaction(async tx=>{const created:any=await (tx as any).cycleCount.create({data:{countNumber:phase90Code("CC"),warehouseId:wh.id,status:"DRAFT",notes:parsed.data.notes||null,createdByUserId:req.user!.id}});if(batches.length)await (tx as any).cycleCountItem.createMany({data:batches.map(b=>({cycleCountId:created.id,batchId:b.id,variantId:b.variantId,systemQty:b.quantityOnHand}))});return created;});
  res.status(201).json({success:true,data:count,message:`Cycle count snapshot created for ${batches.length} active batch(es).`});
}));

router.get("/phase90-warehouse/cycle-counts/:id",asyncHandler(async(req,res)=>{const row:any=await (prisma as any).cycleCount.findUnique({where:{id:String(req.params.id)},include:{warehouse:true,items:{include:{batch:{include:{variant:{include:{product:true}},bin:true}}},orderBy:{createdAt:"asc"}}}});if(!row)return res.status(404).json({success:false,message:"Cycle count not found"});res.json({success:true,data:row});}));

router.patch("/phase90-warehouse/cycle-counts/:id/items",asyncHandler(async(req,res)=>{
  const parsed=phase90CountItemsSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Invalid count entries",errors:parsed.error.flatten()});
  const count:any=await (prisma as any).cycleCount.findUnique({where:{id:String(req.params.id)},include:{items:{include:{batch:true}}}});if(!count)return res.status(404).json({success:false,message:"Cycle count not found"});if(!["DRAFT","REVIEW_REQUIRED"].includes(count.status))return res.status(409).json({success:false,message:"Only an open cycle count can be edited"});const byId=new Map(count.items.map((x:any)=>[x.batchId,x]));
  let hasVariance=false;for(const row of parsed.data.items){const item:any=byId.get(row.batchId);if(!item)return res.status(400).json({success:false,message:"Batch is not part of this cycle count"});const variance=phase90CycleCountVariance(item.systemQty,row.countedQty,item.batch.quantityReserved,item.batch.quantityBlocked);if(variance.blocked)return res.status(409).json({success:false,code:"CYCLE_COUNT_RESERVED_BLOCKED",message:"Counted physical quantity cannot be lower than reserved + blocked units."});if(variance.variance!==0)hasVariance=true;await (prisma as any).cycleCountItem.update({where:{id:item.id},data:{countedQty:row.countedQty,varianceQty:variance.variance,reason:row.reason||null}});}const status=hasVariance?"REVIEW_REQUIRED":"DRAFT";await (prisma as any).cycleCount.update({where:{id:count.id},data:{status}});res.json({success:true,data:{status},message:hasVariance?"Count saved with variance review required.":"Count saved."});
}));

router.post("/phase90-warehouse/cycle-counts/:id/approve",asyncHandler(async(req,res)=>{
  const count:any=await (prisma as any).cycleCount.findUnique({where:{id:String(req.params.id)},include:{items:true}});if(!count)return res.status(404).json({success:false,message:"Cycle count not found"});if(!["DRAFT","REVIEW_REQUIRED"].includes(count.status))return res.status(409).json({success:false,message:"Cycle count cannot be approved from its current status"});if(count.items.some((x:any)=>x.countedQty==null))return res.status(409).json({success:false,code:"CYCLE_COUNT_INCOMPLETE",message:"Every batch must be counted before approval."});if(count.items.some((x:any)=>x.varianceQty!==0&&!x.reason))return res.status(409).json({success:false,code:"CYCLE_COUNT_REASON_REQUIRED",message:"Every stock variance needs an operator reason before approval."});const row=await (prisma as any).cycleCount.update({where:{id:count.id},data:{status:"APPROVED",approvedAt:new Date(),approvedByUserId:req.user!.id}});res.json({success:true,data:row,message:"Cycle count approved. Inventory is still unchanged until posting."});
}));

router.post("/phase90-warehouse/cycle-counts/:id/post",asyncHandler(async(req,res)=>{
  try{const result=await prisma.$transaction(tx=>phase90PostCycleCount(tx,String(req.params.id),req.user!.id),{timeout:30000});res.json({success:true,data:result,message:"Cycle count posted. Only approved physical variances changed aggregate stock."});}catch(error){const m=error instanceof Error?error.message:"CYCLE_COUNT_FAILED";if(["CYCLE_COUNT_NOT_APPROVED","CYCLE_COUNT_INCOMPLETE","CYCLE_COUNT_STALE_SNAPSHOT","CYCLE_COUNT_RESERVED_BLOCKED"].includes(m))return res.status(409).json({success:false,code:m,message:m==="CYCLE_COUNT_STALE_SNAPSHOT"?"Stock moved after this count snapshot. Create a fresh cycle count instead of posting stale quantities.":"Cycle count is not safe to post yet."});throw error;}
}));

router.post("/phase90-warehouse/recalls",asyncHandler(async(req,res)=>{
  const parsed=phase90RecallSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Invalid recall",errors:parsed.error.flatten()});const unique=[...new Set(parsed.data.batchIds)];const batches:any[]=await (prisma as any).inventoryBatch.findMany({where:{id:{in:unique}}});if(batches.length!==unique.length)return res.status(400).json({success:false,message:"One or more recall batches do not exist"});
  const recall=await prisma.$transaction(async tx=>{const created:any=await (tx as any).inventoryRecall.create({data:{recallNumber:phase90Code("RECALL"),status:"DRAFT",reason:parsed.data.reason,customerMessage:parsed.data.customerMessage||null,createdByUserId:req.user!.id}});await (tx as any).inventoryRecallBatch.createMany({data:batches.map(b=>({recallId:created.id,batchId:b.id,quantityAtRecall:b.quantityOnHand}))});return created;});res.status(201).json({success:true,data:recall,message:"Recall draft created. Stock remains sellable until the recall is explicitly activated."});
}));

router.post("/phase90-warehouse/recalls/:id/activate",asyncHandler(async(req,res)=>{
  const recall:any=await (prisma as any).inventoryRecall.findUnique({where:{id:String(req.params.id)},include:{batches:true}});if(!recall)return res.status(404).json({success:false,message:"Recall not found"});if(recall.status!=="DRAFT")return res.status(409).json({success:false,message:"Only a draft recall can be activated"});
  const result=await prisma.$transaction(async tx=>{let blockedUnits=0;for(const link of recall.batches){const held=await phase90BlockBatch(tx,{batchId:link.batchId,mode:"RECALL",referenceType:"RECALL",referenceId:recall.id,actorUserId:req.user!.id,note:recall.reason});blockedUnits+=held.blockedQty;const batch:any=await (tx as any).inventoryBatch.findUnique({where:{id:link.batchId},include:{goodsReceiptItem:{include:{goodsReceipt:{include:{purchaseOrder:true}}}}}});const supplierId=batch?.goodsReceiptItem?.goodsReceipt?.purchaseOrder?.supplierId;if(supplierId)await (tx as any).supplierQualityIncident.upsert({where:{sourceKey:`recall/${recall.id}/${link.batchId}`},create:{sourceKey:`recall/${recall.id}/${link.batchId}`,supplierId,batchId:link.batchId,type:"RECALL",severity:"CRITICAL",status:"OPEN",title:`Recall ${recall.recallNumber}`,notes:recall.reason},update:{severity:"CRITICAL",notes:recall.reason}});}const updated=await (tx as any).inventoryRecall.update({where:{id:recall.id},data:{status:"ACTIVE",activatedAt:new Date(),activatedByUserId:req.user!.id}});return {recall:updated,blockedUnits};},{timeout:30000});res.json({success:true,data:result,message:`Recall activated. ${result.blockedUnits} remaining sellable unit(s) were removed from sale.`});
}));

router.get("/phase90-warehouse/recalls/:id/impact",asyncHandler(async(req,res)=>{
  const recall:any=await (prisma as any).inventoryRecall.findUnique({where:{id:String(req.params.id)},include:{batches:true}});if(!recall)return res.status(404).json({success:false,message:"Recall not found"});const batchIds=recall.batches.map((x:any)=>x.batchId);const allocations:any[]=await (prisma as any).orderBatchAllocation.findMany({where:{batchId:{in:batchIds}},include:{batch:{select:{batchCode:true}},order:{select:{id:true,orderNumber:true,status:true,customerName:true,customerEmail:true,userId:true,createdAt:true}}},orderBy:{shippedAt:"desc"}});const orderIds=new Set(allocations.map(x=>x.order.id));const userIds=new Set(allocations.map(x=>x.order.userId).filter(Boolean));res.json({success:true,data:{recall,affectedOrders:orderIds.size,affectedCustomers:userIds.size,allocations}});
}));

router.post("/phase90-warehouse/recalls/:id/publish-notice",asyncHandler(async(req,res)=>{
  const recall:any=await (prisma as any).inventoryRecall.findUnique({where:{id:String(req.params.id)},include:{batches:true}});if(!recall)return res.status(404).json({success:false,message:"Recall not found"});if(recall.status!=="ACTIVE")return res.status(409).json({success:false,message:"Only an active recall can publish customer notices"});if(!recall.customerMessage)return res.status(409).json({success:false,message:"Add a customer-facing recall message before publishing notices"});const batchIds=recall.batches.map((x:any)=>x.batchId);const allocations:any[]=await (prisma as any).orderBatchAllocation.findMany({where:{batchId:{in:batchIds}},include:{order:{select:{userId:true}}}});const users=[...new Set(allocations.map(x=>x.order.userId).filter(Boolean))] as string[];for(const userId of users){await createUserNotification({userId,title:`Product recall · ${recall.recallNumber}`,message:recall.customerMessage,type:"GENERAL",ctaLabel:"View your orders",ctaUrl:"/orders",metadata:{recallId:recall.id,recallNumber:recall.recallNumber},dedupeKey:`inventory-recall/${recall.id}/${userId}`});}const updated=await (prisma as any).inventoryRecall.update({where:{id:recall.id},data:{noticePublishedAt:new Date()}});res.json({success:true,data:{recall:updated,notifiedCustomers:users.length},message:`Recall notice published to ${users.length} affected account(s).`});
}));

router.post("/phase90-warehouse/recalls/:id/complete",asyncHandler(async(req,res)=>{const recall:any=await (prisma as any).inventoryRecall.findUnique({where:{id:String(req.params.id)}});if(!recall)return res.status(404).json({success:false,message:"Recall not found"});if(recall.status!=="ACTIVE")return res.status(409).json({success:false,message:"Only an active recall can be completed"});const row=await (prisma as any).inventoryRecall.update({where:{id:recall.id},data:{status:"COMPLETED",completedAt:new Date(),completedByUserId:req.user!.id}});res.json({success:true,data:row,message:"Recall case completed. Recalled batches remain blocked until separately dispositioned/write-off; completion never silently returns them to sale."});}));




// Phase 91 · Quality Assurance, Supplier Compliance & Batch Release V2
const phase91SpecSchema=z.object({variantId:z.string().uuid(),sampleQty:z.number().int().min(1).max(50).default(1),coaRequired:z.boolean().default(false),labReportRequired:z.boolean().default(false),minShelfLifeDays:z.number().int().min(0).max(1095).default(90),checks:z.array(z.object({code:z.string().trim().min(1).max(40),name:z.string().trim().min(2).max(120),specification:z.string().trim().max(300).optional().or(z.literal("")),critical:z.boolean().default(false)})).min(1).max(PHASE91_QUALITY_POLICY.maxTestsPerInspection),notes:z.string().trim().max(1000).optional().or(z.literal(""))});
const phase91InspectionSchema=z.object({batchId:z.string().uuid(),coaNumber:z.string().trim().max(120).optional().or(z.literal("")),coaUrl:z.string().trim().max(1000).optional().or(z.literal("")),labReportUrl:z.string().trim().max(1000).optional().or(z.literal("")),manufactureDate:z.coerce.date().optional(),expiryDate:z.coerce.date().optional(),notes:z.string().trim().max(1500).optional().or(z.literal(""))});
const phase91TestsSchema=z.object({tests:z.array(z.object({code:z.string().trim().min(1).max(40),measuredValue:z.string().trim().max(160).optional().or(z.literal("")),unit:z.string().trim().max(40).optional().or(z.literal("")),result:z.enum(["PASS","WARN","FAIL","NOT_TESTED"]),note:z.string().trim().max(500).optional().or(z.literal(""))})).min(1).max(PHASE91_QUALITY_POLICY.maxTestsPerInspection)});
const phase91DecisionSchema=z.object({disposition:z.enum(["RELEASE","CONDITIONAL_RELEASE","HOLD","RETURN_TO_SUPPLIER","DESTROY"]),severity:z.enum(["MINOR","MAJOR","CRITICAL"]).default("MINOR"),notes:z.string().trim().max(2000).optional().or(z.literal(""))});
const phase91Code=()=>`QA-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${randomBytes(3).toString("hex").toUpperCase()}`;

router.get("/phase91-quality/overview",asyncHandler(async(_req,res)=>{res.json({success:true,data:await phase91QualityOverview(prisma)});}));
router.get("/phase91-quality/specifications",asyncHandler(async(_req,res)=>{const rows=await (prisma as any).qualitySpecification.findMany({include:{variant:{include:{product:true}}},orderBy:{updatedAt:"desc"}});res.json({success:true,data:rows});}));
router.put("/phase91-quality/specifications/:variantId",asyncHandler(async(req,res)=>{const parsed=phase91SpecSchema.safeParse({...req.body,variantId:String(req.params.variantId)});if(!parsed.success)return res.status(400).json({success:false,message:"Invalid QA specification",errors:parsed.error.flatten()});const {variantId,...data}=parsed.data;const row=await (prisma as any).qualitySpecification.upsert({where:{variantId},create:{...data,variantId,checks:data.checks,createdByUserId:req.user!.id},update:{...data,checks:data.checks,version:{increment:1}}});res.json({success:true,data:row});}));
router.get("/phase91-quality/pending-batches",asyncHandler(async(_req,res)=>{const rows=await (prisma as any).inventoryBatch.findMany({where:{qualityStatus:{in:["PENDING","SAMPLING","UNDER_REVIEW","FAILED"]}},include:{variant:{include:{product:true,qualitySpecification:true}},warehouse:true,bin:true,goodsReceiptItem:{include:{goodsReceipt:{include:{purchaseOrder:{include:{supplier:true}}}}}},qualityInspections:{include:{tests:true},orderBy:{createdAt:"desc"},take:1}},orderBy:{receivedAt:"asc"},take:200});res.json({success:true,data:rows});}));
router.post("/phase91-quality/inspections",asyncHandler(async(req,res)=>{const parsed=phase91InspectionSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Invalid QA inspection",errors:parsed.error.flatten()});const batch:any=await (prisma as any).inventoryBatch.findUnique({where:{id:parsed.data.batchId},include:{variant:{include:{qualitySpecification:true}},goodsReceiptItem:{include:{goodsReceipt:{include:{purchaseOrder:true}}}}}});if(!batch)return res.status(404).json({success:false,message:"Batch not found"});if(["RECALLED","EXPIRED","DEPLETED"].includes(batch.status))return res.status(409).json({success:false,message:"QA_INSPECTION_BATCH_BLOCKED"});const spec=batch.variant.qualitySpecification;const checks=Array.isArray(spec?.checks)?spec.checks:[{code:"VISUAL",name:"Visual / packaging inspection",specification:"No visible damage, leakage or contamination",critical:true}];const created=await prisma.$transaction(async tx=>{const inspection:any=await (tx as any).qualityInspection.create({data:{inspectionNumber:phase91Code(),batchId:batch.id,variantId:batch.variantId,goodsReceiptItemId:batch.goodsReceiptItemId||null,supplierId:batch.goodsReceiptItem?.goodsReceipt?.purchaseOrder?.supplierId||null,status:"SAMPLING",sampleQty:spec?.sampleQty||1,coaNumber:parsed.data.coaNumber||null,coaUrl:parsed.data.coaUrl||null,labReportUrl:parsed.data.labReportUrl||null,manufactureDate:parsed.data.manufactureDate||null,expiryDate:parsed.data.expiryDate||batch.expiryDate||null,notes:parsed.data.notes||null,createdByUserId:req.user!.id,sampledAt:new Date()}});if(checks.length)await (tx as any).qualityInspectionTest.createMany({data:checks.map((c:any)=>({inspectionId:inspection.id,code:String(c.code),name:String(c.name),specification:c.specification||null,critical:!!c.critical,result:"NOT_TESTED"}))});await (tx as any).inventoryBatch.update({where:{id:batch.id},data:{qualityStatus:"SAMPLING",status:"QUARANTINED"}});return inspection;});res.status(201).json({success:true,data:created});}));
router.patch("/phase91-quality/inspections/:id/tests",asyncHandler(async(req,res)=>{const parsed=phase91TestsSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Invalid QA test results",errors:parsed.error.flatten()});const inspection:any=await (prisma as any).qualityInspection.findUnique({where:{id:String(req.params.id)}});if(!inspection)return res.status(404).json({success:false,message:"Inspection not found"});if(["APPROVED","REJECTED","CLOSED"].includes(inspection.status))return res.status(409).json({success:false,message:"Closed inspection cannot be edited"});await prisma.$transaction(async tx=>{for(const x of parsed.data.tests)await (tx as any).qualityInspectionTest.update({where:{inspectionId_code:{inspectionId:inspection.id,code:x.code}},data:{measuredValue:x.measuredValue||null,unit:x.unit||null,result:x.result,note:x.note||null}});await (tx as any).qualityInspection.update({where:{id:inspection.id},data:{status:"UNDER_REVIEW"}});await (tx as any).inventoryBatch.update({where:{id:inspection.batchId},data:{qualityStatus:"UNDER_REVIEW"}});});res.json({success:true});}));
router.post("/phase91-quality/inspections/:id/decision",asyncHandler(async(req,res)=>{const parsed=phase91DecisionSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:"Invalid QA decision",errors:parsed.error.flatten()});const inspection:any=await (prisma as any).qualityInspection.findUnique({where:{id:String(req.params.id)},include:{tests:true,batch:{include:{variant:{include:{qualitySpecification:true}},goodsReceiptItem:{include:{goodsReceipt:{include:{purchaseOrder:true}}}}}}}});if(!inspection)return res.status(404).json({success:false,message:"Inspection not found"});if(["APPROVED","REJECTED","CLOSED"].includes(inspection.status))return res.status(409).json({success:false,message:"QA decision already finalized"});const spec=inspection.batch.variant.qualitySpecification;const evaln=phase91InspectionDecision(inspection.tests,{coaRequired:!!spec?.coaRequired,coaPresent:!!inspection.coaUrl,labRequired:!!spec?.labReportRequired,labPresent:!!inspection.labReportUrl},{expiryDate:inspection.expiryDate||inspection.batch.expiryDate,receivedAt:inspection.batch.receivedAt,minShelfLifeDays:spec?.minShelfLifeDays||PHASE91_QUALITY_POLICY.defaultMinShelfLifeDays});if(["RELEASE","CONDITIONAL_RELEASE"].includes(parsed.data.disposition)&&!evaln.releasable)return res.status(409).json({success:false,message:"QA_RELEASE_BLOCKED",data:evaln});if(parsed.data.disposition==="RELEASE"&&evaln.conditional)return res.status(409).json({success:false,message:"QA_CONDITIONAL_RELEASE_REQUIRED",data:evaln});const result=await prisma.$transaction(async tx=>{if(["RELEASE","CONDITIONAL_RELEASE"].includes(parsed.data.disposition))await phase91ReleaseBatch(tx,{batchId:inspection.batchId,inspectionId:inspection.id,actorUserId:req.user!.id,conditional:parsed.data.disposition==="CONDITIONAL_RELEASE"});else await phase91RejectBatch(tx,{batchId:inspection.batchId,inspectionId:inspection.id,actorUserId:req.user!.id,disposition:parsed.data.disposition as any,note:parsed.data.notes});const status=["RELEASE","CONDITIONAL_RELEASE"].includes(parsed.data.disposition)?"APPROVED":"REJECTED";const row=await (tx as any).qualityInspection.update({where:{id:inspection.id},data:{status,disposition:parsed.data.disposition,severity:parsed.data.severity,reviewedByUserId:req.user!.id,reviewedAt:new Date(),releasedAt:status==="APPROVED"?new Date():null,closedAt:new Date(),notes:parsed.data.notes||inspection.notes}});if(status==="REJECTED"&&inspection.supplierId)await (tx as any).supplierQualityIncident.upsert({where:{sourceKey:`qa-failure/${inspection.id}`},create:{sourceKey:`qa-failure/${inspection.id}`,supplierId:inspection.supplierId,batchId:inspection.batchId,inspectionId:inspection.id,type:"QA_FAILURE",severity:parsed.data.severity,status:"OPEN",title:`QA failure · ${inspection.inspectionNumber}`,notes:parsed.data.notes||"Batch failed quality review"},update:{severity:parsed.data.severity,notes:parsed.data.notes||"Batch failed quality review"}});return row;});res.json({success:true,data:result,evaluation:evaln});}));
router.get("/phase91-quality/suppliers/:id/scorecard",asyncHandler(async(req,res)=>{res.json({success:true,data:await phase91SupplierScorecard(prisma,String(req.params.id))});}));
router.post("/phase91-quality/suppliers/:id/hold",asyncHandler(async(req,res)=>{const supplier:any=await (prisma as any).supplier.findUnique({where:{id:String(req.params.id)}});if(!supplier)return res.status(404).json({success:false,message:"Supplier not found"});const score=await phase91SupplierScorecard(prisma,supplier.id);if(score.recommendation!=="HOLD"&&!req.body?.force)return res.status(409).json({success:false,message:"SUPPLIER_QUALITY_HOLD_REQUIRES_FORCE",data:score});const row=await (prisma as any).supplier.update({where:{id:supplier.id},data:{status:"HOLD"}});res.json({success:true,data:row,scorecard:score});}));
router.post("/phase91-quality/incidents/:id/close",asyncHandler(async(req,res)=>{const row=await (prisma as any).supplierQualityIncident.update({where:{id:String(req.params.id)},data:{status:"CLOSED",closedAt:new Date(),closedByUserId:req.user!.id}});res.json({success:true,data:row});}));

export default router;
