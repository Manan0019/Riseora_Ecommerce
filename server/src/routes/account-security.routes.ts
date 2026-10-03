import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { createAuthSession, recordSecurityEvent, revokeAllAuthSessions, revokeAuthSession } from "../services/auth-security.service";

const router = Router();
router.use(requireAuth);

router.get("/overview", asyncHandler(async (req, res) => {
  const now = new Date();
  const [user, sessions, events] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { email: true, createdAt: true, lastLoginAt: true, lastPasswordChangedAt: true, lockedUntil: true },
    }),
    prisma.authSession.findMany({
      where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, deviceLabel: true, createdAt: true, lastSeenAt: true, expiresAt: true },
      orderBy: { lastSeenAt: "desc" },
      take: 30,
    }),
    prisma.authSecurityEvent.findMany({
      where: { userId: req.user!.id },
      select: { id: true, type: true, deviceLabel: true, createdAt: true, metadata: true, sessionId: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);
  if (!user) return res.status(404).json({ success: false, message: "Account not found" });
  res.json({
    success: true,
    data: {
      account: user,
      currentSessionId: req.authSessionId || null,
      sessions: sessions.map((session) => ({ ...session, current: session.id === req.authSessionId })),
      events,
      legacySession: !req.authSessionId,
    },
  });
}));

router.delete("/sessions/:id", asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (id === req.authSessionId) return res.status(400).json({ success: false, message: "Use Sign out to end the session you are currently using." });
  const target = await prisma.authSession.findFirst({ where: { id, userId: req.user!.id, revokedAt: null }, select: { id: true } });
  if (!target) return res.status(404).json({ success: false, message: "Active session not found." });
  await revokeAuthSession(id, req.user!.id, "USER_REVOKED");
  await recordSecurityEvent({ req, type: "SESSION_REVOKED", userId: req.user!.id, sessionId: id, identity: req.user!.email });
  res.json({ success: true, message: "That session has been signed out." });
}));

router.post("/revoke-others", asyncHandler(async (req, res) => {
  const parsed = z.object({ currentPassword: z.string().min(1).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter your current password." });
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) return res.status(400).json({ success: false, message: "Current password is incorrect." });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { tokenVersion: { increment: 1 } },
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  await revokeAllAuthSessions(user.id, "REVOKE_OTHER_SESSIONS");
  const { session, token } = await createAuthSession(updated, req);
  await recordSecurityEvent({ req, type: "SESSIONS_REVOKED", userId: user.id, sessionId: session.id, identity: user.email });
  res.json({ success: true, data: { token }, message: "All other sessions were signed out. This browser remains signed in." });
}));

router.post("/export", asyncHandler(async (req, res) => {
  const parsed = z.object({ currentPassword: z.string().min(1).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter your current password to export account data." });
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, referralCode: true, createdAt: true, updatedAt: true, passwordHash: true },
  });
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) return res.status(400).json({ success: false, message: "Current password is incorrect." });

  const [addresses, orders, reviews, wishlist, rewardAccount, rewardTransactions, notifications, supportTickets, refills, securityEvents] = await Promise.all([
    prisma.address.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.order.findMany({
      where: { userId: user.id },
      select: {
        orderNumber: true, customerName: true, customerEmail: true, customerPhone: true, shippingAddress: true,
        status: true, paymentMethod: true, couponCode: true, subtotal: true, shippingFee: true, discountAmount: true, totalAmount: true, createdAt: true, updatedAt: true,
        items: { select: { productName: true, variantName: true, sku: true, quantity: true, unitPrice: true, lineTotal: true, discountAmount: true, isComplimentary: true } },
        statusHistory: { select: { status: true, note: true, source: true, createdAt: true }, orderBy: { createdAt: "asc" } },
        payment: { select: { method: true, status: true, amount: true, paidAt: true, refundedAmount: true, refundedAt: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.review.findMany({ where: { userId: user.id }, select: { rating: true, title: true, comment: true, images: true, isApproved: true, verifiedPurchase: true, createdAt: true, updatedAt: true, product: { select: { name: true, slug: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.wishlistItem.findMany({ where: { userId: user.id }, select: { createdAt: true, product: { select: { name: true, slug: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.rewardAccount.findUnique({ where: { userId: user.id }, select: { balance: true, lifetimeEarned: true, lifetimeRedeemed: true, createdAt: true, updatedAt: true } }),
    prisma.rewardTransaction.findMany({ where: { userId: user.id }, select: { type: true, points: true, balanceAfter: true, description: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.notification.findMany({ where: { userId: user.id }, select: { title: true, message: true, type: true, ctaLabel: true, ctaUrl: true, isRead: true, readAt: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.contactMessage.findMany({ where: { userId: user.id }, select: { ticketNumber: true, subject: true, category: true, priority: true, orderNumber: true, status: true, createdAt: true, updatedAt: true, messages: { where: { isInternal: false }, select: { sender: true, message: true, createdAt: true }, orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } }),
    prisma.refillReminder.findMany({ where: { userId: user.id }, select: { intervalDays: true, quantity: true, status: true, nextReminderAt: true, lastReminderAt: true, lastOrderedAt: true, createdAt: true, variant: { select: { name: true, sku: true, product: { select: { name: true, slug: true } } } } }, orderBy: { createdAt: "asc" } }),
    prisma.authSecurityEvent.findMany({ where: { userId: user.id }, select: { type: true, deviceLabel: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
  ]);

  await recordSecurityEvent({ req, type: "DATA_EXPORT", userId: user.id, sessionId: req.authSessionId || null, identity: user.email });
  const { passwordHash: _passwordHash, ...profile } = user;
  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      profile,
      addresses,
      orders,
      reviews,
      wishlist,
      rewards: { account: rewardAccount, transactions: rewardTransactions },
      notifications,
      supportTickets,
      refillReminders: refills,
      securityHistory: securityEvents,
    },
  });
}));

export default router;
