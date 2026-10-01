import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { getStoreSettings } from "../services/store.service";
import { getInvoiceWithOrder } from "../services/invoice.service";
import { refundRazorpayPayment } from "../services/payment.service";
import { sendReturnStatusNotification } from "../services/notification.service";

const router = Router();
router.use(requireAuth, requireAdmin);

const settingsSchema = z.object({
  storeName: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().max(160).nullable().optional(),
  supportEmail: z.string().trim().email().nullable().optional(),
  supportPhone: z.string().trim().max(30).nullable().optional(),
  gstin: z.string().trim().max(30).nullable().optional(),
  addressLine1: z.string().trim().max(180).nullable().optional(),
  addressLine2: z.string().trim().max(180).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().max(100).optional(),
  invoicePrefix: z.string().trim().min(2).max(20).optional(),
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
  returnsEnabled: z.boolean().optional(),
  returnWindowDays: z.number().int().min(0).max(90).optional(),
  returnPolicy: z.string().trim().max(10000).nullable().optional(),
  shippingPolicy: z.string().trim().max(10000).nullable().optional(),
  privacyPolicy: z.string().trim().max(20000).nullable().optional(),
  termsPolicy: z.string().trim().max(20000).nullable().optional(),
  brandTagline: z.string().trim().max(240).nullable().optional(),
  logoUrl: z.string().trim().max(1000).nullable().optional().refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid logo URL"),
  logoMarkUrl: z.string().trim().max(1000).nullable().optional().refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid logo mark URL"),
  logoAlt: z.string().trim().max(160).nullable().optional(),
  announcementText: z.string().trim().max(180).nullable().optional(),
  announcementSecondary: z.string().trim().max(180).nullable().optional(),
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
    const settings = await prisma.storeSetting.update({ where: { id: "primary" }, data: parsed.data });
    res.json({ success: true, data: settings });
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
      sortOrder: z.number().int().min(0).max(999).optional(),
    }).safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, message: "Invalid courier update" });
    const partner = await prisma.shippingPartner.update({ where: { id: req.params.id }, data: parsed.data });
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
  "/invoices/:orderId",
  asyncHandler(async (req, res) => {
    try {
      const data = await getInvoiceWithOrder(req.params.orderId);
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
  "/returns",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const returns = await prisma.returnRequest.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        order: { include: { payment: true, shipment: true } },
        items: { include: { orderItem: true } },
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
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        order: { include: { payment: true, shipment: true } },
        items: { include: { orderItem: true } },
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
      where: { id: req.params.id },
      include: { items: true, order: { include: { payment: true } }, user: true },
    });
    if (!current) return res.status(404).json({ success: false, message: "Return request not found" });
    if (current.status === parsed.data.status) {
      const updated = await prisma.returnRequest.update({
        where: { id: current.id },
        data: {
          adminNote: parsed.data.adminNote || null,
          reverseCarrier: parsed.data.reverseCarrier || null,
          reverseTrackingNumber: parsed.data.reverseTrackingNumber || null,
          reverseTrackingUrl: parsed.data.reverseTrackingUrl || null,
        },
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
            },
          });
        }
        return tx.returnRequest.update({
          where: { id: current.id },
          data: {
            status: "REFUNDED",
            refundMethod,
            refundReference: parsed.data.refundReference || null,
            providerRefundId,
            refundedAt: new Date(),
            adminNote: parsed.data.adminNote || null,
          },
          include: { items: { include: { orderItem: true } }, order: true, user: true },
        });
      });
      void sendReturnStatusNotification(updated).catch((error) => console.error("Return refund email failed", error));
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
            if (orderItem?.variantId) await tx.productVariant.updateMany({ where: { id: orderItem.variantId }, data: { stockQuantity: { increment: item.quantity } } });
          }
          data.restockedAt = new Date();
        }
      }
      return tx.returnRequest.update({
        where: { id: current.id },
        data,
        include: { items: { include: { orderItem: true } }, order: true, user: true },
      });
    });
    void sendReturnStatusNotification(updated).catch((error) => console.error("Return status email failed", error));
    res.json({ success: true, data: updated });
  }),
);

export default router;
