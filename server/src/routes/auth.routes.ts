import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { sendPasswordResetEmail } from "../services/notification.service";
import { createAuthSession, recordSecurityEvent, revokeAllAuthSessions, revokeAuthSession } from "../services/auth-security.service";
import { currentPrivacyPolicyVersion, recordConsentEvent } from "../services/consent.service";

const router = Router();
const passwordResetLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false });

const registerSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8).max(20).optional().or(z.literal("")),
  password: z.string().min(8).max(100),
  referralCode: z.string().trim().max(40).optional().or(z.literal("")),
  emailMarketingOptIn: z.boolean().default(false),
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration details",
        errors: parsed.error.flatten(),
      });
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(parsed.data.phone ? [{ phone: parsed.data.phone }] : []),
        ],
      },
    });

    if (existing) {
      return res.status(409).json({ success: false, message: "Email or phone already registered" });
    }

    const referrer = parsed.data.referralCode ? await prisma.user.findFirst({ where: { referralCode: parsed.data.referralCode.toUpperCase(), role: "CUSTOMER", isActive: true }, select: { id: true } }) : null;
    if (parsed.data.referralCode && !referrer) return res.status(400).json({ success: false, message: "That referral code is not valid." });
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    let referralCode = "";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = `RISE-${randomBytes(5).toString("hex").toUpperCase()}`;
      const exists = await prisma.user.findUnique({ where: { referralCode: candidate }, select: { id: true } });
      if (!exists) { referralCode = candidate; break; }
    }
    if (!referralCode) throw new Error("REFERRAL_CODE_GENERATION_FAILED");
    const user = await prisma.user.create({
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName || null,
        email,
        phone: parsed.data.phone || null,
        passwordHash,
        referralCode,
        referredByUserId: referrer?.id || null,
        lastLoginAt: new Date(),
        lastPasswordChangedAt: new Date(),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        adminRole: true,
        tokenVersion: true,
        referralCode: true,
      },
    });

    const existingNewsletter = await prisma.newsletterSubscriber.findUnique({ where: { email }, select: { isActive: true } });
    const shouldEmailMarketing = parsed.data.emailMarketingOptIn || Boolean(existingNewsletter?.isActive);
    await prisma.marketingPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, emailMarketing: shouldEmailMarketing, lastSource: parsed.data.emailMarketingOptIn ? "registration" : existingNewsletter?.isActive ? "newsletter-sync" : "registration-default" },
      update: { emailMarketing: shouldEmailMarketing },
    });
    if (parsed.data.emailMarketingOptIn) {
      const policyVersion = await currentPrivacyPolicyVersion();
      await prisma.newsletterSubscriber.upsert({
        where: { email },
        create: { email, name: user.firstName, source: "registration", consentSource: "registration", consentVersion: policyVersion, isActive: true },
        update: { name: user.firstName, source: "registration", consentSource: "registration", consentVersion: policyVersion, isActive: true, unsubscribedAt: null, subscribedAt: new Date() },
      });
      await recordConsentEvent({ req, userId: user.id, email, purpose: "NEWSLETTER", decision: "GRANTED", source: "registration", policyVersion });
      await recordConsentEvent({ req, userId: user.id, email, purpose: "EMAIL_MARKETING", decision: "GRANTED", source: "registration", policyVersion });
    }

    const { session, token } = await createAuthSession(user, req);
    await recordSecurityEvent({ req, type: "ACCOUNT_CREATED", userId: user.id, sessionId: session.id, identity: user.email });
    res.status(201).json({ success: true, data: { token, user } });
  }),
);

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    const now = new Date();

    if (user?.lockedUntil && user.lockedUntil > now) {
      await recordSecurityEvent({ req, type: "LOGIN_BLOCKED", userId: user.id, identity: email, metadata: { lockMinutes: env.AUTH_LOCK_MINUTES } });
      return res.status(429).json({ success: false, message: "Too many unsuccessful sign-in attempts. Please try again later." });
    }

    const passwordMatches = user?.isActive ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
    if (!user || !user.isActive || !passwordMatches) {
      if (user?.isActive) {
        const previousFailures = user.lockedUntil && user.lockedUntil <= now ? 0 : Number(user.failedLoginCount || 0);
        const nextFailures = previousFailures + 1;
        const shouldLock = nextFailures >= env.AUTH_MAX_FAILED_LOGINS;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: nextFailures,
            lockedUntil: shouldLock ? new Date(now.getTime() + env.AUTH_LOCK_MINUTES * 60 * 1000) : null,
          },
        });
        await recordSecurityEvent({ req, type: shouldLock ? "LOGIN_BLOCKED" : "LOGIN_FAILED", userId: user.id, identity: email, metadata: { attempts: nextFailures } });
      } else {
        await recordSecurityEvent({ req, type: "LOGIN_FAILED", identity: email });
      }
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        adminRole: true,
        tokenVersion: true,
        referralCode: true,
      },
    });
    const { session, token } = await createAuthSession(updated, req);
    await recordSecurityEvent({ req, type: "LOGIN_SUCCESS", userId: updated.id, sessionId: session.id, identity: updated.email });
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: updated.id,
          firstName: updated.firstName,
          lastName: updated.lastName,
          email: updated.email,
          phone: updated.phone,
          role: updated.role,
          adminRole: updated.adminRole,
          referralCode: updated.referralCode,
        },
      },
    });
  }),
);

router.post(
  "/forgot-password",
  passwordResetLimit,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ email: z.string().trim().email().max(200) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid email address" });

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, firstName: true, isActive: true } });

    if (user?.isActive) {
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
      });

      const base = (env.PUBLIC_SITE_URL || env.CLIENT_URL).replace(/\/$/, "");
      const resetUrl = `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
      const sent = await sendPasswordResetEmail({ email: user.email, firstName: user.firstName, resetUrl }).catch((error) => {
        console.error("Password reset email failed", error);
        return false;
      });
      if (!sent && env.NODE_ENV !== "production") console.log(`Riseora password reset URL for ${user.email}: ${resetUrl}`);
    }

    res.json({ success: true, message: "If that email is registered, a password reset link has been prepared." });
  }),
);

router.post(
  "/reset-password",
  passwordResetLimit,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ token: z.string().min(40).max(200), password: z.string().min(8).max(100) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid password reset request" });

    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date() || !resetToken.user.isActive) {
      return res.status(400).json({ success: false, message: "This password reset link is invalid or has expired." });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, tokenVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null, lastPasswordChangedAt: new Date() },
      });
      await tx.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } });
      await tx.passwordResetToken.deleteMany({ where: { userId: resetToken.userId, id: { not: resetToken.id }, usedAt: null } });
      await tx.authSession.updateMany({ where: { userId: resetToken.userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "PASSWORD_RESET" } });
    });
    await recordSecurityEvent({ req, type: "PASSWORD_RESET", userId: resetToken.userId, identity: resetToken.user.email });

    res.json({ success: true, message: "Password updated. All previous sessions were signed out. Please sign in with your new password." });
  }),
);

router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.authSessionId) await revokeAuthSession(req.authSessionId, req.user!.id, "USER_LOGOUT");
    await recordSecurityEvent({ req, type: "LOGOUT", userId: req.user!.id, sessionId: req.authSessionId || null, identity: req.user!.email });
    res.json({ success: true, message: "Signed out." });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        adminRole: true,
        referralCode: true,
        isActive: true,
      },
    });

    if (!user?.isActive) {
      return res.status(401).json({ success: false, message: "Account unavailable" });
    }

    res.json({ success: true, data: user });
  }),
);

export default router;
