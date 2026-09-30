import express, { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { optionalAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { createOnlineCheckoutReservation, finalizeOnlineCheckout, finalizeOnlineCheckoutByProviderOrder, releaseCheckoutSession, releaseExpiredCheckoutSessions } from "../services/checkout.service";
import { createRazorpayOrder, onlinePaymentsEnabled, verifyRazorpayPaymentSignature, verifyRazorpayWebhookSignature } from "../services/payment.service";

const router = Router();

const checkoutSchema = z.object({
  customerName: z.string().trim().min(2).max(120), customerEmail: z.string().trim().email().optional().or(z.literal("")), customerPhone: z.string().trim().min(8).max(20),
  couponCode: z.string().trim().max(40).optional().or(z.literal("")),
  shippingAddress: z.object({ line1: z.string().trim().min(3), line2: z.string().trim().optional().or(z.literal("")), landmark: z.string().trim().optional().or(z.literal("")), city: z.string().trim().min(2), state: z.string().trim().min(2), postalCode: z.string().trim().min(4).max(12), country: z.string().trim().default("India") }),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(20) })).min(1),
});

router.get("/config", (_req, res) => res.json({ success: true, data: { onlinePaymentsEnabled, provider: onlinePaymentsEnabled ? "RAZORPAY" : null } }));

router.post("/razorpay/session", optionalAuth, asyncHandler(async (req, res) => {
  if (!onlinePaymentsEnabled) return res.status(503).json({ success: false, message: "Online payments are not configured yet" });
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid checkout details", errors: parsed.error.flatten() });
  await releaseExpiredCheckoutSessions();
  let session;
  try {
    session = await createOnlineCheckoutReservation(parsed.data, req.user?.id ?? null);
    const providerOrder = await createRazorpayOrder({ amountPaise: session.amountPaise, receipt: session.id, notes: { checkoutSessionId: session.id } });
    await prisma.checkoutSession.update({ where: { id: session.id }, data: { providerOrderId: providerOrder.id } });
    res.status(201).json({ success: true, data: { sessionId: session.id, provider: "RAZORPAY", providerOrderId: providerOrder.id, amountPaise: session.amountPaise, currency: session.currency, keyId: env.RAZORPAY_KEY_ID, customer: { name: session.customerName, email: session.customerEmail, phone: session.customerPhone } } });
  } catch (error) {
    if (session) await releaseCheckoutSession(session.id).catch(() => {});
    const message = error instanceof Error ? error.message : "CHECKOUT_FAILED";
    if (message === "PRODUCT_UNAVAILABLE") return res.status(400).json({ success: false, message: "One or more products are unavailable" });
    if (message === "COUPON_NOT_FOUND") return res.status(400).json({ success: false, message: "Coupon code not found" });
    if (message.startsWith("COUPON_INVALID:")) return res.status(400).json({ success: false, message: message.slice("COUPON_INVALID:".length) });
    if (message === "COUPON_LIMIT_REACHED") return res.status(400).json({ success: false, message: "This coupon has reached its usage limit" });
    if (message.startsWith("OUT_OF_STOCK:")) return res.status(400).json({ success: false, message: `Not enough stock for ${message.split(":")[1]}` });
    if (message === "PAYMENT_PROVIDER_ORDER_FAILED") return res.status(502).json({ success: false, message: "Payment provider is temporarily unavailable. Please try again or use COD." });
    throw error;
  }
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
    if (["CHECKOUT_NOT_FOUND", "CHECKOUT_NOT_PENDING", "PAYMENT_ORDER_MISMATCH"].includes(message)) return res.status(409).json({ success: false, message: "Payment was received but checkout could not be finalized automatically. Please contact Riseora support with your payment ID." });
    throw error;
  }
}));

router.post("/razorpay/cancel", asyncHandler(async (req, res) => {
  const parsed = z.object({ sessionId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid checkout session" });
  await releaseCheckoutSession(parsed.data.sessionId);
  res.json({ success: true });
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
      const session = await prisma.checkoutSession.findUnique({ where: { providerOrderId } });
      if (session) await releaseCheckoutSession(session.id);
    }
    if (eventId) await prisma.paymentWebhookEvent.create({ data: { provider: "RAZORPAY", eventId, eventType, providerOrderId: providerOrderId || null, providerPaymentId: providerPaymentId || null } });
    res.json({ success: true });
  } catch (error) {
    console.error("Razorpay webhook processing failed", error);
    res.status(500).json({ success: false, message: "Webhook processing failed" });
  }
}

export default router;
