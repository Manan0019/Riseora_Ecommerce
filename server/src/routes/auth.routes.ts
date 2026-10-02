import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { signAuthToken } from "../utils/jwt";
import { sendPasswordResetEmail } from "../services/notification.service";

const router = Router();
const passwordResetLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false });

const registerSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8).max(20).optional().or(z.literal("")),
  password: z.string().min(8).max(100),
  referralCode: z.string().trim().max(40).optional().or(z.literal("")),
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

    const token = signAuthToken({ sub: user.id, email: user.email, role: user.role, ver: user.tokenVersion });
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

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    });

    if (!user || !user.isActive || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const token = signAuthToken({ sub: user.id, email: user.email, role: user.role, ver: user.tokenVersion });
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          adminRole: user.adminRole,
          referralCode: user.referralCode,
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
      await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } });
      await tx.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } });
      await tx.passwordResetToken.deleteMany({ where: { userId: resetToken.userId, id: { not: resetToken.id }, usedAt: null } });
    });

    res.json({ success: true, message: "Password updated. Please sign in with your new password." });
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
