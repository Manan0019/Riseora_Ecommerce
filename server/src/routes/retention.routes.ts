import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { getSegmentCustomers, getSegmentSummaries, RETENTION_SEGMENTS } from "../services/retention.service";

const router = Router();
router.use(requireAuth, requireAdmin);
const segmentEnum = z.enum(RETENTION_SEGMENTS);

router.get("/segments", asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await getSegmentSummaries() });
}));

router.get("/segments/:segment", asyncHandler(async (req, res) => {
  const parsed = segmentEnum.safeParse(String(req.params.segment));
  if (!parsed.success) return res.status(400).json({ success: false, message: "Unknown customer segment" });
  const customers = await getSegmentCustomers(parsed.data);
  res.json({ success: true, data: customers.slice(0, 100), total: customers.length });
}));

router.post("/campaigns/in-app", asyncHandler(async (req, res) => {
  const parsed = z.object({
    segment: segmentEnum,
    title: z.string().trim().min(3).max(100),
    message: z.string().trim().min(5).max(600),
    ctaLabel: z.string().trim().max(40).optional().or(z.literal("")),
    ctaUrl: z.string().trim().max(300).regex(/^\//, "CTA must use an internal Riseora path").optional().or(z.literal("")),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid campaign", errors: parsed.error.flatten() });

  const customers = await getSegmentCustomers(parsed.data.segment);
  if (!customers.length) return res.status(400).json({ success: false, message: "This segment currently has no customers" });
  if (customers.length > 5000) return res.status(400).json({ success: false, message: "Audience is too large for a single in-app campaign" });

  const result = await prisma.notification.createMany({
    data: customers.map((customer) => ({
      userId: customer.id, title: parsed.data.title, message: parsed.data.message, type: "CAMPAIGN" as const,
      ctaLabel: parsed.data.ctaLabel || null, ctaUrl: parsed.data.ctaUrl || null,
      metadata: { segment: parsed.data.segment },
    })),
  });
  res.status(201).json({ success: true, data: { delivered: result.count, segment: parsed.data.segment } });
}));

export default router;
