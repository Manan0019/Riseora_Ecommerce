import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { createCodOrder, getCodEligibility } from "../services/checkout.service";
import { createUserNotification } from "../services/notification-center.service";
import { blockCommerceDuringMaintenance } from "../middleware/maintenance";

const router = Router();

const createOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  customerPhone: z.string().trim().min(8).max(20),
  couponCode: z.string().trim().max(40).optional().or(z.literal("")),
  checkoutRequestKey: z.string().uuid().optional(),
  shippingAddress: z.object({
    line1: z.string().trim().min(3),
    line2: z.string().trim().optional().or(z.literal("")),
    landmark: z.string().trim().optional().or(z.literal("")),
    city: z.string().trim().min(2),
    state: z.string().trim().min(2),
    postalCode: z.string().trim().regex(/^\d{6}$/),
    country: z.string().trim().default("India"),
  }),
  paymentMethod: z.literal("COD").default("COD"),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1) })).min(1),
});

const codEligibilitySchema = z.object({
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  customerPhone: z.string().trim().max(20).optional().or(z.literal("")),
  postalCode: z.string().trim().regex(/^\d{6}$/).optional().or(z.literal("")),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1) })).min(1),
});

router.post(
  "/cod-eligibility",
  blockCommerceDuringMaintenance,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = codEligibilitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid COD eligibility request" });
    try {
      const result = await getCodEligibility({
        customerName: "Eligibility check",
        customerEmail: parsed.data.customerEmail || "",
        customerPhone: parsed.data.customerPhone || "",
        shippingAddress: { line1: "Eligibility", city: "Eligibility", state: "Gujarat", postalCode: parsed.data.postalCode || "", country: "India" },
        items: parsed.data.items,
      }, req.user?.id ?? null);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "COD_ELIGIBILITY_FAILED";
      if (message === "PRODUCT_UNAVAILABLE") return res.status(400).json({ success: false, message: "One or more products are unavailable" });
      throw error;
    }
  }),
);

router.post(
  "/",
  blockCommerceDuringMaintenance,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid order details", errors: parsed.error.flatten() });
    try {
      const order = await createCodOrder(parsed.data, req.user?.id ?? null);
      res.status(201).json({ success: true, data: order });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ORDER_FAILED";
      if (message === "PRODUCT_UNAVAILABLE") return res.status(400).json({ success: false, message: "One or more products are unavailable" });
      if (message.startsWith("PURCHASE_LIMIT:")) {
        const [, productName, limit] = message.split(":");
        return res.status(400).json({ success: false, message: `${productName} is limited to ${limit} per order.` });
      }
      if (message.startsWith("PIN_UNSERVICEABLE:")) return res.status(400).json({ success: false, message: message.slice("PIN_UNSERVICEABLE:".length) });
      if (message.startsWith("COD_UNAVAILABLE:")) return res.status(400).json({ success: false, message: message.slice("COD_UNAVAILABLE:".length) });
      if (message === "ONLINE_CHECKOUT_PENDING") return res.status(409).json({ success: false, message: "An online payment reservation is still active for this checkout. Retry, check or cancel that payment before switching to COD." });
      if (message === "COUPON_NOT_FOUND") return res.status(400).json({ success: false, message: "Coupon code not found" });
      if (message.startsWith("COUPON_INVALID:")) return res.status(400).json({ success: false, message: message.slice("COUPON_INVALID:".length) });
      if (message === "COUPON_LIMIT_REACHED") return res.status(400).json({ success: false, message: "This coupon has reached its usage limit" });
      if (message.startsWith("OUT_OF_STOCK:")) return res.status(400).json({ success: false, message: `Not enough stock for ${message.split(":")[1]}` });
      throw error;
    }
  }),
);

router.get(
  "/my",
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({ where: { userId: req.user!.id }, include: { items: true, payment: true, cancellationRequest: true, shipment: true, statusHistory: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } });
    res.json({ success: true, data: orders });
  }),
);

router.get(
  "/my/:orderNumber",
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({ where: { orderNumber: String(req.params.orderNumber), userId: req.user!.id }, include: { items: true, payment: true, cancellationRequest: true, shipment: { include: { events: { where: { customerVisible: true }, orderBy: { eventAt: "asc" } } } }, statusHistory: { orderBy: { createdAt: "asc" } } } });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true, data: order });
  }),
);

const cancellationRequestSchema = z.object({
  reason: z.string().trim().min(3).max(120),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

router.post(
  "/my/:orderNumber/cancellation",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = cancellationRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Choose a cancellation reason", errors: parsed.error.flatten() });

    const order = await prisma.order.findFirst({
      where: { orderNumber: String(req.params.orderNumber).toUpperCase(), userId: req.user!.id },
      include: { cancellationRequest: true },
    });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (!["PENDING", "CONFIRMED"].includes(order.status)) {
      return res.status(409).json({ success: false, message: "This order is already being prepared and can no longer be cancelled online. Please contact Riseora support." });
    }
    if (order.cancellationRequest && !["REJECTED", "WITHDRAWN"].includes(order.cancellationRequest.status)) {
      return res.status(409).json({ success: false, message: "A cancellation request already exists for this order" });
    }

    const request = order.cancellationRequest
      ? await prisma.orderCancellationRequest.update({
          where: { id: order.cancellationRequest.id },
          data: { status: "REQUESTED", reason: parsed.data.reason, customerNote: parsed.data.note || null, adminNote: null, requestedAt: new Date(), resolvedAt: null },
        })
      : await prisma.orderCancellationRequest.create({
          data: { orderId: order.id, userId: req.user!.id, reason: parsed.data.reason, customerNote: parsed.data.note || null },
        });

    await createUserNotification({
      userId: req.user!.id,
      title: `Cancellation requested for ${order.orderNumber}`,
      message: "We received your request. Riseora will review it before the order moves further in fulfilment.",
      type: "ORDER",
      ctaLabel: "View order",
      ctaUrl: `/orders/${order.orderNumber}`,
      metadata: { orderId: order.id, cancellationRequestId: request.id },
      dedupeKey: `cancellation-request/${request.id}/${request.requestedAt.toISOString()}`,
    });

    res.status(201).json({ success: true, data: request });
  }),
);

router.post(
  "/my/:orderNumber/cancellation/withdraw",
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: { orderNumber: String(req.params.orderNumber).toUpperCase(), userId: req.user!.id },
      include: { cancellationRequest: true },
    });
    if (!order?.cancellationRequest) return res.status(404).json({ success: false, message: "Cancellation request not found" });
    const changed = await prisma.orderCancellationRequest.updateMany({
      where: { id: order.cancellationRequest.id, userId: req.user!.id, status: "REQUESTED" },
      data: { status: "WITHDRAWN", resolvedAt: new Date() },
    });
    if (changed.count !== 1) return res.status(409).json({ success: false, message: "This cancellation request can no longer be withdrawn" });
    res.json({ success: true });
  }),
);

router.get(
  "/track",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ orderNumber: z.string().trim().min(6), phone: z.string().trim().min(8).max(20) }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid order number and phone number" });
    const order = await prisma.order.findFirst({ where: { orderNumber: parsed.data.orderNumber.toUpperCase(), customerPhone: parsed.data.phone }, include: { items: true, payment: true, cancellationRequest: true, shipment: { include: { events: { where: { customerVisible: true }, orderBy: { eventAt: "asc" } } } }, statusHistory: { orderBy: { createdAt: "asc" } } } });
    if (!order) return res.status(404).json({ success: false, message: "We could not find an order matching those details" });
    res.json({ success: true, data: order });
  }),
);

export default router;
