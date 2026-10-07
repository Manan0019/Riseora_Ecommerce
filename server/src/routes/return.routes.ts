import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { getStoreSettings } from "../services/store.service";
import { phase83Priority, phase83SlaDueAt, returnResolutionHealth } from "../services/return-resolution.service";

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
