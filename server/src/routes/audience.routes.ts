import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { notifyReadyStockAlerts } from "../services/stock-alert.service";
import { env } from "../config/env";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/contact-messages", asyncHandler(async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const where: any = {};
  if (["NEW", "IN_PROGRESS", "RESOLVED", "SPAM"].includes(status)) where.status = status;
  if (search) where.OR = [
    { name: { contains: search, mode: "insensitive" } },
    { email: { contains: search, mode: "insensitive" } },
    { subject: { contains: search, mode: "insensitive" } },
    { message: { contains: search, mode: "insensitive" } },
  ];
  const data = await prisma.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 });
  res.json({ success: true, data });
}));

router.patch("/contact-messages/:id", asyncHandler(async (req, res) => {
  const parsed = z.object({
    status: z.enum(["NEW", "IN_PROGRESS", "RESOLVED", "SPAM"]).optional(),
    adminNote: z.string().trim().max(2000).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, message: "Invalid message update" });
  const data = await prisma.contactMessage.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ success: true, data });
}));

router.get("/newsletter", asyncHandler(async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const active = typeof req.query.active === "string" ? req.query.active : "";
  const where: any = {};
  if (active === "true") where.isActive = true;
  if (active === "false") where.isActive = false;
  if (search) where.email = { contains: search, mode: "insensitive" };
  const data = await prisma.newsletterSubscriber.findMany({ where, orderBy: { subscribedAt: "desc" }, take: 1000 });
  res.json({ success: true, data });
}));

router.patch("/newsletter/:id", asyncHandler(async (req, res) => {
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid subscriber update" });
  const data = await prisma.newsletterSubscriber.update({
    where: { id: req.params.id },
    data: { isActive: parsed.data.isActive, unsubscribedAt: parsed.data.isActive ? null : new Date(), ...(parsed.data.isActive ? { subscribedAt: new Date() } : {}) },
  });
  res.json({ success: true, data });
}));


router.get("/cart-recoveries", asyncHandler(async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "ACTIVE";
  const where: any = {};
  if (["ACTIVE", "CONVERTED", "DISMISSED", "EXPIRED"].includes(status)) where.status = status;
  if (status === "ACTIVE") where.expiresAt = { gt: new Date() };
  const data = await prisma.cartRecoverySession.findMany({ where, orderBy: { lastSeenAt: "desc" }, take: 300 });
  res.json({ success: true, data });
}));


router.get("/stock-alerts", asyncHandler(async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const where: any = {};
  if (["PENDING", "NOTIFIED", "CANCELLED"].includes(status)) where.status = status;
  const data = await prisma.stockAlert.findMany({
    where,
    include: { variant: { include: { product: { select: { id: true, name: true, slug: true, isActive: true } } } } },
    orderBy: { subscribedAt: "desc" },
    take: 500,
  });
  res.json({ success: true, data, emailConfigured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM) });
}));

router.patch("/stock-alerts/:id", asyncHandler(async (req, res) => {
  const parsed = z.object({ status: z.enum(["PENDING", "CANCELLED"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid stock alert update" });
  const data = await prisma.stockAlert.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status, ...(parsed.data.status === "PENDING" ? { notifiedAt: null, subscribedAt: new Date() } : {}) },
  });
  res.json({ success: true, data });
}));

router.post("/stock-alerts/notify-ready", asyncHandler(async (_req, res) => {
  const result = await notifyReadyStockAlerts(250);
  res.json({
    success: true,
    data: result,
    emailConfigured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    message: env.RESEND_API_KEY && env.EMAIL_FROM
      ? `${result.sent} back-in-stock notification${result.sent === 1 ? "" : "s"} sent.`
      : "Email delivery is not configured. Pending alerts were left untouched.",
  });
}));

export default router;
