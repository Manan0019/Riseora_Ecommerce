import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/compliance", asyncHandler(async (_req, res) => {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [
    activeNewsletter,
    emailMarketing,
    smsMarketing,
    whatsappMarketing,
    grants30d,
    withdrawals30d,
    openPrivacyRequests,
    policy,
  ] = await Promise.all([
    prisma.newsletterSubscriber.count({ where: { isActive: true } }),
    prisma.marketingPreference.count({ where: { emailMarketing: true } }),
    prisma.marketingPreference.count({ where: { smsMarketing: true } }),
    prisma.marketingPreference.count({ where: { whatsappMarketing: true } }),
    prisma.consentEvent.count({ where: { decision: "GRANTED", createdAt: { gte: since30 } } }),
    prisma.consentEvent.count({ where: { decision: "WITHDRAWN", createdAt: { gte: since30 } } }),
    prisma.privacyRequest.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    prisma.storeSetting.findUnique({ where: { id: "primary" }, select: { privacyPolicyVersion: true, privacyPolicy: true } }),
  ]);

  const [recentConsent, requests] = await Promise.all([
    prisma.consentEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 250,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    }),
    prisma.privacyRequest.findMany({
      orderBy: { requestedAt: "desc" },
      take: 200,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } } },
    }),
  ]);

  res.json({
    success: true,
    data: {
      summary: { activeNewsletter, emailMarketing, smsMarketing, whatsappMarketing, grants30d, withdrawals30d, openPrivacyRequests },
      policy: { version: policy?.privacyPolicyVersion || "2026-10", configured: Boolean(policy?.privacyPolicy?.trim()) },
      recentConsent,
      requests,
    },
  });
}));

router.patch("/compliance/privacy-requests/:id", asyncHandler(async (req, res) => {
  const parsed = z.object({
    status: z.enum(["IN_REVIEW", "RESOLVED", "REJECTED"]),
    adminNote: z.string().trim().max(4000).optional().or(z.literal("")),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid privacy-request update" });

  const existing = await prisma.privacyRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ success: false, message: "Privacy request not found" });
  if (!["OPEN", "IN_REVIEW"].includes(existing.status)) return res.status(409).json({ success: false, message: "Only open privacy requests can be processed" });

  const data = await prisma.privacyRequest.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.status,
      adminNote: parsed.data.adminNote || null,
      resolvedAt: ["RESOLVED", "REJECTED"].includes(parsed.data.status) ? new Date() : null,
    },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } } },
  });
  res.json({ success: true, data, message: "Privacy request updated." });
}));

export default router;
