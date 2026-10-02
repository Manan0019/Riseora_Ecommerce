import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { createUserNotification } from "../services/notification-center.service";
import { sendSupportAdminNotification, sendSupportTicketReceived } from "../services/notification.service";

const router = Router();
router.use(requireAuth);

const category = z.enum(["GENERAL", "ORDER", "PAYMENT", "DELIVERY", "RETURN_REFUND", "PRODUCT", "ACCOUNT", "REWARDS"]);
const createSchema = z.object({
  category: category.default("GENERAL"),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10).max(5000),
  orderNumber: z.string().trim().max(80).optional().or(z.literal("")),
});
const replySchema = z.object({ message: z.string().trim().min(2).max(5000) });

function ticketNumber() {
  const d = new Date();
  const date = `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `SUP-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function ownerWhere(userId: string, email: string) {
  return { OR: [{ userId }, { email: email.toLowerCase() }] };
}

router.get("/tickets", asyncHandler(async (req, res) => {
  const data = await prisma.contactMessage.findMany({
    where: ownerWhere(req.user!.id, req.user!.email),
    orderBy: { lastActivityAt: "desc" },
    take: 100,
    select: { id: true, ticketNumber: true, subject: true, category: true, priority: true, status: true, orderNumber: true, lastActivityAt: true, createdAt: true, _count: { select: { messages: true } } },
  });
  res.json({ success: true, data });
}));

router.get("/tickets/:ticketNumber", asyncHandler(async (req, res) => {
  const item = await prisma.contactMessage.findFirst({
    where: { ticketNumber: String(req.params.ticketNumber), ...ownerWhere(req.user!.id, req.user!.email) },
    include: { messages: { where: { isInternal: false }, orderBy: { createdAt: "asc" } } },
  });
  if (!item) return res.status(404).json({ success: false, message: "Support ticket not found" });
  res.json({ success: true, data: item });
}));

router.post("/tickets", asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Please check your support request", errors: parsed.error.flatten() });
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } });
  if (!user) return res.status(401).json({ success: false, message: "Session expired" });
  const orderNumber = parsed.data.orderNumber || null;
  if (orderNumber) {
    const order = await prisma.order.findFirst({ where: { orderNumber, userId: user.id }, select: { id: true } });
    if (!order) return res.status(400).json({ success: false, message: "That order number is not linked to your account." });
  }
  const number = ticketNumber();
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.contactMessage.create({ data: {
      ticketNumber: number, userId: user.id, name: fullName, email: user.email.toLowerCase(), phone: user.phone || null,
      category: parsed.data.category, subject: parsed.data.subject, message: parsed.data.message, orderNumber,
      lastActivityAt: new Date(),
    } });
    await tx.supportMessage.create({ data: { ticketId: created.id, sender: "CUSTOMER", authorUserId: user.id, message: parsed.data.message } });
    return created;
  });
  void sendSupportTicketReceived({ email: user.email, name: user.firstName, ticketNumber: item.ticketNumber, subject: item.subject || "Support request", signedIn: true }).catch((error) => console.error("Support receipt email failed", error));
  void sendSupportAdminNotification({ ticketNumber: item.ticketNumber, name: item.name, email: item.email, category: item.category, subject: item.subject || "Support request", priority: item.priority }).catch((error) => console.error("Support admin notification failed", error));
  void createUserNotification({ userId: user.id, type: "SUPPORT", title: `Support request ${item.ticketNumber} received`, message: "Your Riseora support thread is open. We’ll notify you when the team replies.", ctaLabel: "Open support", ctaUrl: `/support/${item.ticketNumber}`, dedupeKey: `support-created/${item.id}` }).catch((error) => console.error("Support in-app notification failed", error));
  res.status(201).json({ success: true, data: item, message: `Support ticket ${item.ticketNumber} created.` });
}));

router.post("/tickets/:ticketNumber/replies", asyncHandler(async (req, res) => {
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Reply must be at least 2 characters" });
  const ticket = await prisma.contactMessage.findFirst({ where: { ticketNumber: String(req.params.ticketNumber), ...ownerWhere(req.user!.id, req.user!.email) } });
  if (!ticket) return res.status(404).json({ success: false, message: "Support ticket not found" });
  if (["SPAM", "CLOSED"].includes(ticket.status)) return res.status(409).json({ success: false, message: "This support ticket is closed." });
  await prisma.$transaction([
    prisma.supportMessage.create({ data: { ticketId: ticket.id, sender: "CUSTOMER", authorUserId: req.user!.id, message: parsed.data.message } }),
    prisma.contactMessage.update({ where: { id: ticket.id }, data: { status: "IN_PROGRESS", resolvedAt: null, lastActivityAt: new Date() } }),
  ]);
  res.status(201).json({ success: true, message: "Reply sent to Riseora Support." });
}));

router.patch("/tickets/:ticketNumber/close", asyncHandler(async (req, res) => {
  const ticket = await prisma.contactMessage.findFirst({ where: { ticketNumber: String(req.params.ticketNumber), ...ownerWhere(req.user!.id, req.user!.email) } });
  if (!ticket) return res.status(404).json({ success: false, message: "Support ticket not found" });
  if (ticket.status === "CLOSED") return res.json({ success: true, message: "Ticket is already closed." });
  await prisma.$transaction([
    prisma.contactMessage.update({ where: { id: ticket.id }, data: { status: "CLOSED", resolvedAt: new Date(), lastActivityAt: new Date() } }),
    prisma.supportMessage.create({ data: { ticketId: ticket.id, sender: "SYSTEM", authorUserId: req.user!.id, message: "Customer closed this support request." } }),
  ]);
  res.json({ success: true, message: "Support ticket closed." });
}));

export default router;
