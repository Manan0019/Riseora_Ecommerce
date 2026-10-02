import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { asyncHandler } from "../utils/async-handler";
import { createUserNotification } from "../services/notification-center.service";
import { sendSupportReplyNotification } from "../services/notification.service";

const router = Router();
const statuses = ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED", "SPAM"] as const;
const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const categories = ["GENERAL", "ORDER", "PAYMENT", "DELIVERY", "RETURN_REFUND", "PRODUCT", "ACCOUNT", "REWARDS"] as const;

router.get("/support/overview", asyncHandler(async (_req, res) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [newCount, active, waiting, urgent, resolved24h, failedEmails24h] = await Promise.all([
    prisma.contactMessage.count({ where: { status: "NEW" } }),
    prisma.contactMessage.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } }),
    prisma.contactMessage.count({ where: { status: "WAITING_CUSTOMER" } }),
    prisma.contactMessage.count({ where: { priority: "URGENT", status: { in: ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER"] } } }),
    prisma.contactMessage.count({ where: { status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { gte: since24h } } }),
    prisma.emailDeliveryLog.count({ where: { status: "FAILED", createdAt: { gte: since24h } } }),
  ]);
  res.json({ success: true, data: { newCount, active, waiting, urgent, resolved24h, failedEmails24h, emailConfigured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM) } });
}));

router.get("/support/tickets", asyncHandler(async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const priority = typeof req.query.priority === "string" ? req.query.priority : "";
  const category = typeof req.query.category === "string" ? req.query.category : "";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const where: any = {};
  if ((statuses as readonly string[]).includes(status)) where.status = status;
  if ((priorities as readonly string[]).includes(priority)) where.priority = priority;
  if ((categories as readonly string[]).includes(category)) where.category = category;
  if (search) where.OR = [
    { ticketNumber: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } },
    { email: { contains: search, mode: "insensitive" } }, { subject: { contains: search, mode: "insensitive" } },
    { orderNumber: { contains: search, mode: "insensitive" } },
  ];
  const data = await prisma.contactMessage.findMany({
    where, orderBy: [{ priority: "desc" }, { lastActivityAt: "desc" }], take: 300,
    select: { id: true, ticketNumber: true, name: true, email: true, phone: true, subject: true, category: true, priority: true, orderNumber: true, status: true, assignedAdminUserId: true, lastActivityAt: true, createdAt: true, _count: { select: { messages: true } } },
  });
  res.json({ success: true, data });
}));

router.get("/support/tickets/:id", asyncHandler(async (req, res) => {
  const item = await prisma.contactMessage.findUnique({ where: { id: String(req.params.id) }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!item) return res.status(404).json({ success: false, message: "Support ticket not found" });
  res.json({ success: true, data: item });
}));

router.patch("/support/tickets/:id", asyncHandler(async (req, res) => {
  const parsed = z.object({
    status: z.enum(statuses).optional(), priority: z.enum(priorities).optional(), category: z.enum(categories).optional(),
    adminNote: z.string().trim().max(4000).nullable().optional(), assignToMe: z.boolean().optional(), clearAssignment: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid support update" });
  const data: any = { ...parsed.data };
  delete data.assignToMe; delete data.clearAssignment;
  if (parsed.data.assignToMe) data.assignedAdminUserId = req.user!.id;
  if (parsed.data.clearAssignment) data.assignedAdminUserId = null;
  if (parsed.data.status && ["RESOLVED", "CLOSED"].includes(parsed.data.status)) data.resolvedAt = new Date();
  else if (parsed.data.status && !["RESOLVED", "CLOSED"].includes(parsed.data.status)) data.resolvedAt = null;
  data.lastActivityAt = new Date();
  const item = await prisma.contactMessage.update({ where: { id: String(req.params.id) }, data });
  res.json({ success: true, data: item });
}));

router.post("/support/tickets/:id/replies", asyncHandler(async (req, res) => {
  const parsed = z.object({ message: z.string().trim().min(2).max(5000), internal: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Reply must be at least 2 characters" });
  const ticket = await prisma.contactMessage.findUnique({ where: { id: String(req.params.id) } });
  if (!ticket) return res.status(404).json({ success: false, message: "Support ticket not found" });
  const nextStatus = parsed.data.internal ? ticket.status : "WAITING_CUSTOMER";
  const [replyRecord] = await prisma.$transaction([
    prisma.supportMessage.create({ data: { ticketId: ticket.id, sender: "ADMIN", authorUserId: req.user!.id, message: parsed.data.message, isInternal: parsed.data.internal } }),
    prisma.contactMessage.update({ where: { id: ticket.id }, data: { status: nextStatus, assignedAdminUserId: ticket.assignedAdminUserId || req.user!.id, lastActivityAt: new Date(), ...(parsed.data.internal ? {} : { resolvedAt: null }) } }),
  ]);
  if (!parsed.data.internal) {
    void sendSupportReplyNotification({ email: ticket.email, name: ticket.name, ticketNumber: ticket.ticketNumber, subject: ticket.subject || "Support update", reply: parsed.data.message, signedIn: Boolean(ticket.userId), replyId: replyRecord.id }).catch((error) => console.error("Support reply email failed", error));
    if (ticket.userId) void createUserNotification({ userId: ticket.userId, type: "SUPPORT", title: `Riseora Support replied · ${ticket.ticketNumber}`, message: parsed.data.message.slice(0, 240), ctaLabel: "Open support thread", ctaUrl: `/support/${ticket.ticketNumber}`, dedupeKey: `support-reply/${ticket.id}/${Date.now()}` }).catch((error) => console.error("Support reply in-app notification failed", error));
  }
  res.status(201).json({ success: true, message: parsed.data.internal ? "Internal note added." : "Reply sent to customer." });
}));

router.get("/support/email-deliveries", asyncHandler(async (req, res) => {
  const failedOnly = String(req.query.failedOnly || "") === "true";
  const data = await prisma.emailDeliveryLog.findMany({ where: failedOnly ? { status: "FAILED" } : {}, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ success: true, data, emailConfigured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM) });
}));

export default router;
