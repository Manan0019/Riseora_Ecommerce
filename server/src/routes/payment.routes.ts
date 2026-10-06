import express, { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { optionalAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { currentMaintenance } from "../services/maintenance.service";
import { createOnlineCheckoutReservation, finalizeOnlineCheckout, finalizeOnlineCheckoutByProviderOrder, releaseCheckoutSession, releaseExpiredCheckoutSessions } from "../services/checkout.service";
import { createRazorpayOrder, onlinePaymentsEnabled, verifyRazorpayPaymentSignature, verifyRazorpayWebhookSignature } from "../services/payment.service";

const router = Router();

const checkoutSchema = z.object({
  customerName: z.string().trim().min(2).max(120), customerEmail: z.string().trim().email().optional().or(z.literal("")), customerPhone: z.string().trim().min(8).max(20),
  couponCode: z.string().trim().max(40).optional().or(z.literal("")), checkoutRequestKey: z.string().uuid().optional(), expectedReviewDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  shippingAddress: z.object({ line1: z.string().trim().min(3), line2: z.string().trim().optional().or(z.literal("")), landmark: z.string().trim().optional().or(z.literal("")), city: z.string().trim().min(2), state: z.string().trim().min(2), postalCode: z.string().trim().regex(/^\d{6}$/), country: z.string().trim().default("India") }),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1) })).min(1),
});

function publicSession(session: any) {
  return {
    sessionId: session.id,
    status: session.status,
    provider: "RAZORPAY",
    providerOrderId: session.providerOrderId,
    amountPaise: session.amountPaise,
    currency: session.currency,
    keyId: env.RAZORPAY_KEY_ID,
    expiresAt: session.expiresAt,
    paymentAttemptCount: session.paymentAttemptCount,
    lastPaymentStatus: session.lastPaymentStatus,
    lastPaymentError: session.lastPaymentError,
    orderNumber: session.order?.orderNumber || null,
    order: session.order ? { orderNumber: session.order.orderNumber, status: session.order.status, paymentMethod: session.order.paymentMethod, totalAmount: session.order.totalAmount, deliveryEstimate: session.order.deliveryEstimate } : null,
  };
}

router.get("/config", (_req, res) => res.json({ success: true, data: { onlinePaymentsEnabled, provider: onlinePaymentsEnabled ? "RAZORPAY" : null } }));

router.post("/razorpay/session", optionalAuth, asyncHandler(async (req, res) => {
  if (!onlinePaymentsEnabled) return res.status(503).json({ success: false, message: "Online payments are not configured yet" });
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid checkout details", errors: parsed.error.flatten() });
  const maintenance = await currentMaintenance();
  if (maintenance.active) {
    const existing = parsed.data.checkoutRequestKey
      ? await prisma.checkoutSession.findUnique({ where: { checkoutRequestKey: parsed.data.checkoutRequestKey }, select: { status: true } })
      : null;
    if (!existing || existing.status !== "PENDING") {
      return res.status(503).json({ success: false, code: "STORE_MAINTENANCE", message: maintenance.message || "Riseora is briefly unavailable while we complete scheduled maintenance. Please try again shortly." });
    }
  }
  await releaseExpiredCheckoutSessions();
  let session;
  try {
    session = await createOnlineCheckoutReservation(parsed.data, req.user?.id ?? null);
    if (session.status === "PAID") {
      const completed = await prisma.checkoutSession.findUnique({ where: { id: session.id }, include: { order: true } });
      return res.json({ success: true, data: publicSession(completed) });
    }
    let providerOrderId = session.providerOrderId;
    const hadProviderOrder = Boolean(providerOrderId);
    if (!providerOrderId) {
      const providerOrder = await createRazorpayOrder({ amountPaise: session.amountPaise, receipt: session.id, notes: { checkoutSessionId: session.id } });
      const attached = await prisma.checkoutSession.updateMany({ where: { id: session.id, status: "PENDING", providerOrderId: null }, data: { providerOrderId: providerOrder.id } });
      if (attached.count === 1) providerOrderId = providerOrder.id;
      else providerOrderId = (await prisma.checkoutSession.findUnique({ where: { id: session.id }, select: { providerOrderId: true } }))?.providerOrderId || null;
      if (!providerOrderId) throw new Error("PAYMENT_PROVIDER_ORDER_FAILED");
    }
    session = await prisma.checkoutSession.update({
      where: { id: session.id },
      data: { paymentAttemptCount: { increment: 1 }, lastPaymentStatus: hadProviderOrder ? "RETRY_READY" : "CREATED", lastPaymentError: null, lastPaymentActivityAt: new Date() },
      include: { order: true },
    });
    res.status(session.paymentAttemptCount > 1 ? 200 : 201).json({ success: true, data: { ...publicSession(session), customer: { name: session.customerName, email: session.customerEmail, phone: session.customerPhone } } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CHECKOUT_FAILED";
    if (session && !session.providerOrderId && message === "PAYMENT_PROVIDER_ORDER_FAILED") {
      await releaseCheckoutSession(session.id).catch(() => {});
      await prisma.checkoutSession.updateMany({ where: { id: session.id, status: "CANCELLED" }, data: { checkoutRequestKey: null } }).catch(() => {});
    }
    if (message === "PRODUCT_UNAVAILABLE") return res.status(400).json({ success: false, message: "One or more products are unavailable" });
    if (message.startsWith("PURCHASE_LIMIT:")) { const [, productName, limit] = message.split(":"); return res.status(400).json({ success: false, message: `${productName} is limited to ${limit} per order.` }); }
    if (message.startsWith("PIN_UNSERVICEABLE:")) return res.status(400).json({ success: false, message: message.slice("PIN_UNSERVICEABLE:".length) });
    if (message === "COUPON_NOT_FOUND") return res.status(400).json({ success: false, message: "Coupon code not found" });
    if (message.startsWith("COUPON_INVALID:")) return res.status(400).json({ success: false, message: message.slice("COUPON_INVALID:".length) });
    if (message === "COUPON_LIMIT_REACHED") return res.status(400).json({ success: false, message: "This coupon has reached its usage limit" });
    if (message.startsWith("OUT_OF_STOCK:")) return res.status(400).json({ success: false, message: `Not enough stock for ${message.split(":")[1]}` });
    if (message === "CHECKOUT_REVIEW_CHANGED") return res.status(409).json({ success: false, code: "CHECKOUT_REVIEW_CHANGED", message: "Checkout details changed after your final review. Review the latest total, delivery and payment details before confirming again." });
    if (message === "CHECKOUT_REQUEST_CLOSED") return res.status(409).json({ success: false, message: "This payment attempt is closed. Start payment again." });
    if (message.startsWith("ORDER_ALREADY_CREATED:")) return res.status(409).json({ success: false, message: `This checkout was already placed as ${message.slice("ORDER_ALREADY_CREATED:".length)}. Open My Orders or Track Order instead of paying again.` });
    if (message === "PAYMENT_PROVIDER_ORDER_FAILED") return res.status(502).json({ success: false, message: "Payment provider is temporarily unavailable. Please try again or use COD." });
    throw error;
  }
}));

router.get("/razorpay/session/:sessionId/status", asyncHandler(async (req, res) => {
  const parsed = z.string().uuid().safeParse(String(req.params.sessionId));
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid checkout session" });
  const session = await prisma.checkoutSession.findUnique({ where: { id: parsed.data }, include: { order: true } });
  if (!session) return res.status(404).json({ success: false, message: "Checkout session not found" });
  if (session.status === "PENDING" && session.expiresAt < new Date()) {
    await releaseCheckoutSession(session.id);
    const expired = await prisma.checkoutSession.findUnique({ where: { id: session.id }, include: { order: true } });
    return res.json({ success: true, data: publicSession(expired) });
  }
  res.json({ success: true, data: publicSession(session) });
}));

router.post("/razorpay/session/:sessionId/event", asyncHandler(async (req, res) => {
  const id = z.string().uuid().safeParse(String(req.params.sessionId));
  const body = z.object({ event: z.enum(["OPENED", "DISMISSED", "FAILED", "RETRY"]), message: z.string().trim().max(500).optional().or(z.literal("")) }).safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ success: false, message: "Invalid payment event" });
  await prisma.checkoutSession.updateMany({ where: { id: id.data, status: "PENDING" }, data: { lastPaymentStatus: body.data.event, lastPaymentError: body.data.message || null, lastPaymentActivityAt: new Date() } });
  res.json({ success: true });
}));

router.post("/razorpay/verify", asyncHandler(async (req, res) => {
  const parsed = z.object({ sessionId: z.string().uuid(), razorpay_order_id: z.string().min(4), razorpay_payment_id: z.string().min(4), razorpay_signature: z.string().min(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid payment verification request" });
  const valid = verifyRazorpayPaymentSignature({ providerOrderId: parsed.data.razorpay_order_id, providerPaymentId: parsed.data.razorpay_payment_id, signature: parsed.data.razorpay_signature });
  if (!valid) return res.status(400).json({ success: false, message: "Payment signature verification failed" });
  try {
    const order = await finalizeOnlineCheckout({ sessionId: parsed.data.sessionId, providerOrderId: parsed.data.razorpay_order_id, providerPaymentId: parsed.data.razorpay_payment_id });
    res.json({ success: true, data: order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PAYMENT_FINALIZATION_FAILED";
    if (["CHECKOUT_NOT_FOUND", "CHECKOUT_NOT_PENDING", "PAYMENT_ORDER_MISMATCH"].includes(message)) return res.status(409).json({ success: false, message: "Payment was received but checkout could not be finalized automatically. Use Check payment status before trying again." });
    throw error;
  }
}));

router.post("/razorpay/cancel", asyncHandler(async (req, res) => {
  const parsed = z.object({ sessionId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid checkout session" });
  await releaseCheckoutSession(parsed.data.sessionId);
  const session = await prisma.checkoutSession.findUnique({ where: { id: parsed.data.sessionId }, include: { order: true } });
  res.json({ success: true, data: publicSession(session) });
}));

export async function razorpayWebhook(req: express.Request, res: express.Response) {
  const rawBody = req.body as Buffer;
  const signature = req.header("x-razorpay-signature");
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) return res.status(400).json({ success: false, message: "Invalid webhook signature" });
  const eventId = req.header("x-razorpay-event-id") || null;
  const payload = JSON.parse(rawBody.toString("utf8")) as any;
  const eventType = String(payload.event || "unknown");
  if (eventId) {
    const exists = await prisma.paymentWebhookEvent.findUnique({ where: { eventId } });
    if (exists) return res.json({ success: true, duplicate: true });
  }
  const paymentEntity = payload?.payload?.payment?.entity;
  const orderEntity = payload?.payload?.order?.entity;
  const providerOrderId = String(paymentEntity?.order_id || orderEntity?.id || "");
  const providerPaymentId = String(paymentEntity?.id || "");
  try {
    if (["payment.captured", "order.paid"].includes(eventType) && providerOrderId && providerPaymentId) {
      await finalizeOnlineCheckoutByProviderOrder({ providerOrderId, providerPaymentId });
    } else if (eventType === "payment.failed" && providerOrderId) {
      await prisma.checkoutSession.updateMany({
        where: { providerOrderId, status: "PENDING" },
        data: { lastPaymentStatus: "FAILED", lastPaymentError: String(paymentEntity?.error_description || paymentEntity?.error_reason || "Payment attempt failed"), lastPaymentActivityAt: new Date() },
      });
    }
    if (eventId) await prisma.paymentWebhookEvent.create({ data: { provider: "RAZORPAY", eventId, eventType, providerOrderId: providerOrderId || null, providerPaymentId: providerPaymentId || null } });
    res.json({ success: true });
  } catch (error) {
    console.error("Razorpay webhook processing failed", error);
    res.status(500).json({ success: false, message: "Webhook processing failed" });
  }
}

export default router;
