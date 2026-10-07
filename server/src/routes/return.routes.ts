import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { getStoreSettings } from "../services/store.service";
import { phase83Priority, phase83SlaDueAt, returnResolutionHealth } from "../services/return-resolution.service";
import { phase84SupportHealth, phase84SupportPriority, phase84SupportSlaDueAt } from "../services/support-operations.service";
import { phase86LifecycleProfile } from "../services/retention-growth.service";

const router = Router();
router.use(requireAuth);

function makeReturnNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `RET-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function requiresEvidence(reason: string) { return /(damaged|wrong|quality|defect|leak|broken|unsafe|reaction)/i.test(reason); }

async function decorateReturn(item: any) {
  const ids = [...new Set((item.items || []).map((row: any) => row.replacementVariantId).filter(Boolean))] as string[];
  const variants = ids.length ? await prisma.productVariant.findMany({
    where: { id: { in: ids } },
    select: { id: true, sku: true, name: true, size: true, unit: true, sellingPrice: true, product: { select: { name: true } } },
  }) : [];
  const byId = new Map(variants.map((variant: any) => [variant.id, variant]));
  return {
    ...item,
    items: (item.items || []).map((row: any) => ({ ...row, replacementVariant: row.replacementVariantId ? byId.get(row.replacementVariantId) || null : null })),
    resolutionHealth: returnResolutionHealth(item),
  };
}

router.get("/eligibility/:orderNumber", asyncHandler(async (req, res) => {
  const settings = await getStoreSettings();
  const order = await prisma.order.findFirst({
    where: { orderNumber: String(req.params.orderNumber), userId: req.user!.id },
    include: {
      shipment: true,
      items: {
        include: {
          variant: { include: { product: { include: { variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" } } } } } },
        },
      },
    },
  });
  if (!order) return res.status(404).json({ success: false, message: "Order not found" });
  const deliveredAt = order.shipment?.deliveredAt ?? order.updatedAt;
  const deadline = new Date(deliveredAt.getTime() + settings.returnWindowDays * 86400000);
  const eligible = Boolean(settings.returnsEnabled && order.status === "DELIVERED" && Date.now() <= deadline.getTime());

  const items = [] as any[];
  for (const line of order.items) {
    const already = await prisma.returnRequestItem.aggregate({
      where: { orderItemId: line.id, returnRequest: { status: { notIn: ["REJECTED", "CANCELLED"] } } },
      _sum: { quantity: true },
    });
    const remainingReturnable = Math.max(0, line.quantity - Number(already._sum.quantity || 0));
    items.push({
      id: line.id,
      productName: line.productName,
      variantName: line.variantName,
      sku: line.sku,
      purchasedQuantity: line.quantity,
      remainingReturnable,
      replacementOptions: line.variant?.product?.variants?.map((variant: any) => ({
        id: variant.id, name: variant.name, sku: variant.sku, size: variant.size, unit: variant.unit,
        sellingPrice: variant.sellingPrice, stockQuantity: variant.stockQuantity, safetyStock: variant.safetyStock,
        available: Math.max(0, Number(variant.stockQuantity || 0) - Number(variant.safetyStock || 0)),
      })) || [],
    });
  }
  res.json({ success: true, data: { eligible, returnsEnabled: settings.returnsEnabled, returnWindowDays: settings.returnWindowDays, deadline, status: order.status, items } });
}));

router.get("/", asyncHandler(async (req, res) => {
  const rows = await prisma.returnRequest.findMany({
    where: { userId: req.user!.id },
    include: {
      order: { select: { orderNumber: true, createdAt: true, totalAmount: true, status: true } },
      items: { include: { orderItem: true } }, evidence: true,
      statusHistory: { where: { customerVisible: true }, orderBy: { createdAt: "asc" } }, creditNote: true,
    }, orderBy: { requestedAt: "desc" },
  });
  res.json({ success: true, data: await Promise.all(rows.map(decorateReturn)) });
}));


const supportCaseSchema = z.object({
  category: z.enum(["GENERAL", "ORDER", "PAYMENT", "DELIVERY", "RETURN_REFUND", "PRODUCT", "ACCOUNT", "REWARDS"]).default("GENERAL"),
  subject: z.string().trim().min(4).max(180),
  message: z.string().trim().min(10).max(4000),
  orderNumber: z.string().trim().max(80).optional().or(z.literal("")),
  returnRequestId: z.string().uuid().optional().nullable(),
});

function makeSupportTicketNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `SUP-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function customerSupportView(ticket: any) {
  const recoveryGrant = ticket.recoveryGrant ? {
    kind: ticket.recoveryGrant.kind,
    couponAmount: ticket.recoveryGrant.couponAmount,
    points: ticket.recoveryGrant.points,
    couponCodeSnapshot: ticket.recoveryGrant.couponCodeSnapshot,
    expiresAt: ticket.recoveryGrant.expiresAt,
    createdAt: ticket.recoveryGrant.createdAt,
  } : null;
  return {
    ...ticket,
    recoveryGrant,
    messages: (ticket.messages || []).filter((message: any) => !message.isInternal),
    supportHealth: phase84SupportHealth(ticket),
  };
}

router.get("/support-cases", asyncHandler(async (req, res) => {
  const rows = await prisma.contactMessage.findMany({
    where: { userId: req.user!.id },
    include: { returnRequest: { select: { id: true, returnNumber: true, status: true } }, recoveryGrant: true, messages: { where: { isInternal: false }, orderBy: { createdAt: "asc" } } },
    orderBy: { lastActivityAt: "desc" },
  });
  res.json({ success: true, data: rows.map(customerSupportView) });
}));

router.get("/support-cases/:id", asyncHandler(async (req, res) => {
  const item = await prisma.contactMessage.findFirst({
    where: { id: String(req.params.id), userId: req.user!.id },
    include: { returnRequest: { select: { id: true, returnNumber: true, status: true } }, recoveryGrant: true, messages: { where: { isInternal: false }, orderBy: { createdAt: "asc" } } },
  });
  if (!item) return res.status(404).json({ success: false, message: "Support case not found" });
  res.json({ success: true, data: customerSupportView(item) });
}));

router.post("/support-cases", asyncHandler(async (req, res) => {
  const parsed = supportCaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid support case", errors: parsed.error.flatten() });

  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } });
  if (!user) return res.status(404).json({ success: false, message: "Customer account not found" });

  let orderNumber: string | null = parsed.data.orderNumber || null;
  if (orderNumber) {
    const order = await prisma.order.findFirst({ where: { orderNumber, userId: req.user!.id }, select: { orderNumber: true } });
    if (!order) return res.status(400).json({ success: false, message: "Choose an order that belongs to your account" });
  }

  let returnRequestId: string | null = parsed.data.returnRequestId || null;
  if (returnRequestId) {
    const linked = await prisma.returnRequest.findFirst({ where: { id: returnRequestId, userId: req.user!.id }, select: { id: true, order: { select: { orderNumber: true } } } });
    if (!linked) return res.status(400).json({ success: false, message: "Return case does not belong to your account" });
    orderNumber ||= linked.order.orderNumber;
  }

  const createdAt = new Date();
  const priority = phase84SupportPriority(parsed.data.category, parsed.data.subject, parsed.data.message);
  const created = await prisma.contactMessage.create({
    data: {
      ticketNumber: makeSupportTicketNumber(),
      userId: user.id,
      name: `${user.firstName} ${user.lastName || ""}`.trim(),
      email: user.email,
      phone: user.phone,
      subject: parsed.data.subject,
      message: parsed.data.message,
      category: parsed.data.category as any,
      priority: priority as any,
      orderNumber,
      returnRequestId,
      status: "NEW",
      slaDueAt: phase84SupportSlaDueAt(createdAt, priority),
      lastActivityAt: createdAt,
      lastCustomerReplyAt: createdAt,
      messages: { create: { sender: "CUSTOMER", authorUserId: user.id, message: parsed.data.message, isInternal: false } },
    },
    include: { returnRequest: { select: { id: true, returnNumber: true, status: true } }, messages: { where: { isInternal: false }, orderBy: { createdAt: "asc" } } },
  });
  res.status(201).json({ success: true, data: customerSupportView(created) });
}));

const supportReplySchema = z.object({ message: z.string().trim().min(2).max(4000) });
router.post("/support-cases/:id/reply", asyncHandler(async (req, res) => {
  const parsed = supportReplySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Write a valid reply" });
  const current = await prisma.contactMessage.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!current) return res.status(404).json({ success: false, message: "Support case not found" });
  if (["RESOLVED", "CLOSED", "SPAM"].includes(current.status)) return res.status(409).json({ success: false, message: "Reopen this resolved case before replying" });
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.supportMessage.create({ data: { ticketId: current.id, sender: "CUSTOMER", authorUserId: req.user!.id, message: parsed.data.message, isInternal: false } });
    await tx.contactMessage.update({ where: { id: current.id }, data: { status: "IN_PROGRESS", lastCustomerReplyAt: now, lastActivityAt: now } });
  });
  res.json({ success: true });
}));

router.post("/support-cases/:id/reopen", asyncHandler(async (req, res) => {
  const current = await prisma.contactMessage.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!current) return res.status(404).json({ success: false, message: "Support case not found" });
  if (!["RESOLVED", "CLOSED"].includes(current.status)) return res.status(409).json({ success: false, message: "Only a resolved case can be reopened" });
  if (current.resolvedAt && Date.now() - new Date(current.resolvedAt).getTime() > 14 * 86400000) return res.status(409).json({ success: false, message: "This case is older than the 14-day reopen window. Please open a new support case." });
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.contactMessage.update({ where: { id: current.id }, data: { status: "IN_PROGRESS", reopenedAt: now, resolvedAt: null, resolutionCode: null, resolutionSummary: null, satisfactionScore: null, satisfactionComment: null, satisfactionSubmittedAt: null, slaDueAt: phase84SupportSlaDueAt(now, current.priority), lastActivityAt: now } });
    await tx.supportMessage.create({ data: { ticketId: current.id, sender: "SYSTEM", message: "Customer reopened this support case.", isInternal: false } });
  });
  res.json({ success: true });
}));

const supportRatingSchema = z.object({ score: z.number().int().min(1).max(5), comment: z.string().trim().max(1200).optional().or(z.literal("")) });
router.post("/support-cases/:id/rating", asyncHandler(async (req, res) => {
  const parsed = supportRatingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
  const current = await prisma.contactMessage.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!current) return res.status(404).json({ success: false, message: "Support case not found" });
  if (!["RESOLVED", "CLOSED"].includes(current.status)) return res.status(409).json({ success: false, message: "Rate the support experience after the case is resolved" });
  if (current.satisfactionSubmittedAt) return res.status(409).json({ success: false, message: "Feedback has already been submitted for this case" });
  await prisma.contactMessage.update({ where: { id: current.id }, data: { satisfactionScore: parsed.data.score, satisfactionComment: parsed.data.comment || null, satisfactionSubmittedAt: new Date() } });
  res.json({ success: true });
}));



router.get("/phase86-lifecycle", asyncHandler(async (req, res) => {
  const [orders, returns, tickets, reminders, marketingPreference, rewardAccount, enrollments] = await Promise.all([
    prisma.order.findMany({ where: { userId: req.user!.id }, select: { status: true, totalAmount: true, createdAt: true, shipment: { select: { deliveredAt: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.returnRequest.findMany({ where: { userId: req.user!.id }, select: { status: true } }),
    prisma.contactMessage.findMany({ where: { userId: req.user!.id }, select: { status: true, satisfactionScore: true } }),
    prisma.refillReminder.findMany({ where: { userId: req.user!.id }, select: { status: true, nextReminderAt: true } }),
    prisma.marketingPreference.findUnique({ where: { userId: req.user!.id } }),
    prisma.rewardAccount.findUnique({ where: { userId: req.user!.id }, select: { balance: true } }),
    prisma.retentionEnrollment.findMany({ where: { userId: req.user!.id, status: "ISSUED" }, include: { campaign: true, coupon: { select: { code: true, endsAt: true, isActive: true, usageCount: true, usageLimit: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const profile = phase86LifecycleProfile({ orders, returns, tickets, reminders });
  const now = Date.now();
  const benefits = enrollments.filter((row: any) => row.campaign.benefitKind === "COUPON" ? Boolean(row.coupon?.isActive) && (!row.coupon?.usageLimit || row.coupon.usageCount < row.coupon.usageLimit) && (!row.expiresAt || new Date(row.expiresAt).getTime() > now) : new Date(row.createdAt).getTime() > now - 90 * 86400000).map((row: any) => ({ id: row.id, campaignName: row.campaign.name, benefitKind: row.campaign.benefitKind, couponAmount: row.campaign.couponAmount, rewardPoints: row.campaign.rewardPoints, couponCode: row.couponCodeSnapshot, expiresAt: row.expiresAt, createdAt: row.createdAt }));
  res.json({ success: true, data: { profile, rewardBalance: rewardAccount?.balance || 0, marketingPreference, benefits } });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const item = await prisma.returnRequest.findFirst({
    where: { id: String(req.params.id), userId: req.user!.id },
    include: {
      order: { include: { shipment: true } }, items: { include: { orderItem: true } }, evidence: true,
      statusHistory: { where: { customerVisible: true }, orderBy: { createdAt: "asc" } }, creditNote: true,
    },
  });
  if (!item) return res.status(404).json({ success: false, message: "Return request not found" });
  res.json({ success: true, data: await decorateReturn(item) });
}));

const requestSchema = z.object({
  orderNumber: z.string().trim().min(6),
  reason: z.string().trim().min(3).max(120),
  details: z.string().trim().max(1600).optional().or(z.literal("")),
  preferredResolution: z.enum(["REFUND", "REPLACEMENT"]).default("REFUND"),
  items: z.array(z.object({
    orderItemId: z.string().uuid(), quantity: z.number().int().min(1), replacementVariantId: z.string().uuid().optional().nullable(),
  })).min(1),
  evidence: z.array(z.object({
    url: z.string().trim().min(1).max(1500).refine((value) => value.startsWith("/uploads/returns/") || /^https:\/\/res\.cloudinary\.com\//i.test(value), "Invalid evidence URL"),
    publicId: z.string().trim().max(500).optional().nullable(), originalName: z.string().trim().max(255).optional().nullable(),
  })).max(4).optional().default([]),
});

router.post("/", asyncHandler(async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid return request", errors: parsed.error.flatten() });
  if (requiresEvidence(parsed.data.reason) && parsed.data.evidence.length === 0) {
    return res.status(400).json({ success: false, message: "Add at least one clear evidence photo for damaged, wrong, quality or safety-related return reasons" });
  }

  const settings = await getStoreSettings();
  if (!settings.returnsEnabled) return res.status(400).json({ success: false, message: "Returns are currently disabled" });
  const order = await prisma.order.findFirst({
    where: { orderNumber: parsed.data.orderNumber, userId: req.user!.id },
    include: { items: { include: { variant: { include: { product: { include: { variants: { where: { isActive: true } } } } } } } }, shipment: true },
  });
  if (!order) return res.status(404).json({ success: false, message: "Order not found" });
  if (order.status !== "DELIVERED") return res.status(400).json({ success: false, message: "Returns can be requested only after delivery" });
  const deliveredAt = order.shipment?.deliveredAt ?? order.updatedAt;
  const deadline = new Date(deliveredAt.getTime() + settings.returnWindowDays * 86400000);
  if (Date.now() > deadline.getTime()) return res.status(400).json({ success: false, message: `The ${settings.returnWindowDays}-day return window has ended` });

  const orderItemMap = new Map(order.items.map((item: any) => [item.id, item]));
  const requestedIds = [...new Set(parsed.data.items.map((item) => item.orderItemId))];
  if (requestedIds.length !== parsed.data.items.length || requestedIds.some((id) => !orderItemMap.has(id))) {
    return res.status(400).json({ success: false, message: "One or more return items are invalid" });
  }

  const createItems: any[] = [];
  let refundAmount = 0;
  const subtotal = Number(order.subtotal || 0), discount = Number(order.discountAmount || 0);
  const hasLineDiscountSnapshot = order.items.some((item: any) => Number(item.discountAmount || 0) > 0);
  for (const requested of parsed.data.items) {
    const orderItem: any = orderItemMap.get(requested.orderItemId)!;
    const already = await prisma.returnRequestItem.aggregate({
      where: { orderItemId: orderItem.id, returnRequest: { status: { notIn: ["REJECTED", "CANCELLED"] } } }, _sum: { quantity: true },
    });
    const remaining = orderItem.quantity - Number(already._sum.quantity || 0);
    if (requested.quantity > remaining) return res.status(400).json({ success: false, message: `Only ${remaining} unit(s) of ${orderItem.productName} remain returnable` });

    let replacementVariantId: string | null = null;
    if (parsed.data.preferredResolution === "REPLACEMENT") {
      replacementVariantId = requested.replacementVariantId || orderItem.variantId || null;
      const allowed = orderItem.variant?.product?.variants?.some((variant: any) => variant.id === replacementVariantId);
      if (!replacementVariantId || !allowed) return res.status(400).json({ success: false, message: `Choose a valid replacement option for ${orderItem.productName}` });
    }

    const lineGross = Number(orderItem.lineTotal);
    const lineDiscount = hasLineDiscountSnapshot ? Number(orderItem.discountAmount || 0) : subtotal > 0 ? discount * (lineGross / subtotal) : 0;
    const unitRefund = round2(Math.max(0, lineGross - lineDiscount) / orderItem.quantity);
    refundAmount = round2(refundAmount + round2(unitRefund * requested.quantity));
    createItems.push({ orderItemId: orderItem.id, quantity: requested.quantity, unitRefundAmount: unitRefund, replacementVariantId });
  }

  const requestedAt = new Date();
  const priority = phase83Priority(parsed.data.reason, requestedAt);
  const created = await prisma.returnRequest.create({
    data: {
      returnNumber: makeReturnNumber(), orderId: order.id, userId: req.user!.id,
      reason: parsed.data.reason, details: parsed.data.details || null, refundAmount,
      preferredResolution: parsed.data.preferredResolution as any, priority: priority as any, slaDueAt: phase83SlaDueAt(requestedAt, priority),
      items: { create: createItems },
      evidence: parsed.data.evidence.length ? { create: parsed.data.evidence.map((item) => ({ url: item.url, publicId: item.publicId || null, originalName: item.originalName || null })) } : undefined,
      statusHistory: { create: { status: "REQUESTED", note: `${parsed.data.preferredResolution === "REPLACEMENT" ? "Replacement" : "Refund"} requested · ${parsed.data.details || parsed.data.reason}`, source: "CUSTOMER", customerVisible: true } },
    },
    include: { order: true, items: { include: { orderItem: true } }, evidence: true, statusHistory: { orderBy: { createdAt: "asc" } } },
  });
  res.status(201).json({ success: true, data: await decorateReturn(created) });
}));

router.post("/:id/cancel", asyncHandler(async (req, res) => {
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.returnRequest.updateMany({ where: { id: String(req.params.id), userId: req.user!.id, status: "REQUESTED" }, data: { status: "CANCELLED", resolutionCompletedAt: new Date() } });
    if (changed.count !== 1) return false;
    await tx.returnStatusHistory.create({ data: { returnRequestId: String(req.params.id), status: "CANCELLED", note: "Return request cancelled by customer", source: "CUSTOMER", customerVisible: true } });
    return true;
  });
  if (!updated) return res.status(409).json({ success: false, message: "This return can no longer be cancelled" });
  res.json({ success: true });
}));

export default router;
