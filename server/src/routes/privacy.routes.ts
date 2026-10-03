import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { sendNewsletterPreferenceEmail } from "../services/notification.service";
import {
  currentPrivacyPolicyVersion,
  marketingPreferencesForUser,
  recordConsentEvent,
  updateMarketingPreferences,
  withdrawAllMarketing,
} from "../services/consent.service";

const router = Router();
const privacyEmailLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false });

router.post(
  "/privacy/analytics-consent",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      choice: z.enum(["accepted", "essential"]),
      source: z.string().trim().max(80).optional().default("cookie-banner"),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid privacy choice" });

    await recordConsentEvent({
      req,
      userId: req.user?.id || null,
      email: req.user?.email || null,
      purpose: "ANALYTICS",
      decision: parsed.data.choice === "accepted" ? "GRANTED" : "WITHDRAWN",
      source: parsed.data.source,
    });
    res.json({ success: true });
  }),
);


router.post(
  "/privacy/newsletter/manage-link",
  privacyEmailLimit,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ email: z.string().trim().email().max(200) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid email address" });
    const email = parsed.data.email.toLowerCase();
    const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { email }, select: { isActive: true, unsubscribeToken: true } });
    if (subscriber?.isActive) {
      void sendNewsletterPreferenceEmail({ email, unsubscribeToken: subscriber.unsubscribeToken }).catch((error) => console.error("Newsletter preference email failed", error));
    }
    res.json({ success: true, message: "If that address is subscribed, Riseora will send a secure email-preference link." });
  }),
);

router.post(
  "/privacy/newsletter/unsubscribe",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ token: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid unsubscribe link" });

    const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: parsed.data.token } });
    if (!subscriber) return res.status(404).json({ success: false, message: "This unsubscribe link is no longer valid" });

    await prisma.$transaction(async (tx) => {
      await tx.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: { isActive: false, unsubscribedAt: new Date() },
      });
      const user = await tx.user.findUnique({ where: { email: subscriber.email }, select: { id: true } });
      if (user) {
        await tx.marketingPreference.upsert({
          where: { userId: user.id },
          create: { userId: user.id, emailMarketing: false, lastSource: "one-click-unsubscribe" },
          update: { emailMarketing: false, lastSource: "one-click-unsubscribe" },
        });
      }
    });

    const user = await prisma.user.findUnique({ where: { email: subscriber.email }, select: { id: true } });
    await recordConsentEvent({
      req,
      userId: user?.id || null,
      email: subscriber.email,
      purpose: "NEWSLETTER",
      decision: "WITHDRAWN",
      source: "one-click-unsubscribe",
      policyVersion: subscriber.consentVersion,
    });
    if (user) {
      await recordConsentEvent({ req, userId: user.id, email: subscriber.email, purpose: "EMAIL_MARKETING", decision: "WITHDRAWN", source: "one-click-unsubscribe", policyVersion: subscriber.consentVersion });
    }

    res.json({ success: true, message: "You have been unsubscribed from Riseora marketing email." });
  }),
);

router.use("/privacy", requireAuth);

router.get(
  "/privacy/preferences",
  asyncHandler(async (req, res) => {
    const [preference, policyVersion] = await Promise.all([
      marketingPreferencesForUser(req.user!.id),
      currentPrivacyPolicyVersion(),
    ]);
    if (!preference) return res.status(404).json({ success: false, message: "Account not found" });
    res.json({ success: true, data: { preference, policyVersion } });
  }),
);

router.patch(
  "/privacy/preferences",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      emailMarketing: z.boolean(),
      smsMarketing: z.boolean(),
      whatsappMarketing: z.boolean(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid communication preferences" });

    try {
      const preference = await updateMarketingPreferences({ req, userId: req.user!.id, values: parsed.data, source: "account-privacy-center" });
      res.json({ success: true, data: preference, message: "Communication preferences updated." });
    } catch (error) {
      if (error instanceof Error && error.message === "PHONE_REQUIRED_FOR_MESSAGING") return res.status(400).json({ success: false, message: "Add a phone number in My Account before enabling SMS or WhatsApp marketing." });
      throw error;
    }
  }),
);

router.get(
  "/privacy/history",
  asyncHandler(async (req, res) => {
    const events = await prisma.consentEvent.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, purpose: true, decision: true, source: true, policyVersion: true, createdAt: true },
    });
    res.json({ success: true, data: events });
  }),
);

router.get(
  "/privacy/requests",
  asyncHandler(async (req, res) => {
    const data = await prisma.privacyRequest.findMany({
      where: { userId: req.user!.id },
      orderBy: { requestedAt: "desc" },
      take: 50,
      select: { id: true, type: true, status: true, message: true, requestedAt: true, resolvedAt: true, updatedAt: true },
    });
    res.json({ success: true, data });
  }),
);

router.post(
  "/privacy/requests",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      type: z.enum(["ERASURE", "CORRECTION", "OTHER"]),
      message: z.string().trim().min(5).max(2000),
      currentPassword: z.string().max(100).optional().or(z.literal("")),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Add the request details" });

    const duplicate = await prisma.privacyRequest.findFirst({
      where: { userId: req.user!.id, type: parsed.data.type, status: { in: ["OPEN", "IN_REVIEW"] } },
      select: { id: true },
    });
    if (duplicate) return res.status(409).json({ success: false, message: "You already have an open request of this type." });

    if (parsed.data.type === "ERASURE") {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { passwordHash: true } });
      if (!user || !parsed.data.currentPassword || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
        return res.status(400).json({ success: false, message: "Current password is required to request account erasure." });
      }
      await withdrawAllMarketing({ req, userId: req.user!.id, source: "privacy-erasure-request" });
    }

    const data = await prisma.privacyRequest.create({
      data: { userId: req.user!.id, type: parsed.data.type, message: parsed.data.message },
      select: { id: true, type: true, status: true, message: true, requestedAt: true },
    });
    res.status(201).json({ success: true, data, message: parsed.data.type === "ERASURE" ? "Account erasure request received. Marketing preferences were disabled immediately." : "Privacy request received." });
  }),
);

router.patch(
  "/privacy/requests/:id/cancel",
  asyncHandler(async (req, res) => {
    const result = await prisma.privacyRequest.updateMany({
      where: { id: String(req.params.id), userId: req.user!.id, status: "OPEN" },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });
    if (!result.count) return res.status(404).json({ success: false, message: "Open privacy request not found" });
    res.json({ success: true, message: "Privacy request cancelled." });
  }),
);

export default router;
