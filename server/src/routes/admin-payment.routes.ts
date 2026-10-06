import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/async-handler";
import { releaseCheckoutSession } from "../services/checkout.service";
import { paymentReadinessHealth } from "../services/payment-readiness.service";

const router = Router();

router.get("/payments/operations", asyncHandler(async (_req, res) => {
  const now = new Date();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [pending, expiredPending, paid24h, webhook24h, failedWebhook24h, sessions] = await Promise.all([
    prisma.checkoutSession.count({ where: { status: "PENDING", expiresAt: { gte: now } } }),
    prisma.checkoutSession.count({ where: { status: "PENDING", expiresAt: { lt: now } } }),
    prisma.payment.count({ where: { method: "ONLINE", status: "PAID", paidAt: { gte: since24h } } }),
    prisma.paymentWebhookEvent.count({ where: { createdAt: { gte: since24h } } }),
    prisma.paymentWebhookEvent.count({ where: { createdAt: { gte: since24h }, eventType: "payment.failed" } }),
    prisma.checkoutSession.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" }, take: 60,
      select: { id: true, customerName: true, customerEmail: true, customerPhone: true, totalAmount: true, providerOrderId: true, paymentAttemptCount: true, lastPaymentStatus: true, lastPaymentError: true, lastPaymentActivityAt: true, expiresAt: true, createdAt: true },
    }),
  ]);
  res.json({ success: true, data: { summary: { pending, expiredPending, paid24h, webhook24h, failedWebhook24h }, paymentReadiness: paymentReadinessHealth(), sessions } });
}));

router.post("/payments/checkout-sessions/:id/release", asyncHandler(async (req, res) => {
  const parsed = z.string().uuid().safeParse(String(req.params.id));
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid checkout session" });
  const session = await prisma.checkoutSession.findUnique({ where: { id: parsed.data } });
  if (!session) return res.status(404).json({ success: false, message: "Checkout session not found" });
  if (session.status !== "PENDING") return res.status(409).json({ success: false, message: "Only pending checkout sessions can be released" });
  if (session.expiresAt >= new Date()) return res.status(409).json({ success: false, message: "This payment reservation is still active. Wait until it expires so a delayed provider confirmation cannot be interrupted." });
  await releaseCheckoutSession(session.id);
  const after = await prisma.checkoutSession.findUnique({ where: { id: session.id }, include: { order: true } });
  res.json({ success: true, message: after?.status === "PAID" ? `Payment was already captured; ${after.order?.orderNumber || "the order"} was finalized instead of releasing stock.` : "Expired reserved stock and coupon usage released safely" });
}));

export default router;
