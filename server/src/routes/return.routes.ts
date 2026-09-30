import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { getStoreSettings } from "../services/store.service";

const router = Router();
router.use(requireAuth);

function makeReturnNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `RET-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const returns = await prisma.returnRequest.findMany({
      where: { userId: req.user!.id },
      include: {
        order: { select: { orderNumber: true, createdAt: true, totalAmount: true, status: true } },
        items: { include: { orderItem: true } },
      },
      orderBy: { requestedAt: "desc" },
    });
    res.json({ success: true, data: returns });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await prisma.returnRequest.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: {
        order: { include: { shipment: true } },
        items: { include: { orderItem: true } },
      },
    });
    if (!item) return res.status(404).json({ success: false, message: "Return request not found" });
    res.json({ success: true, data: item });
  }),
);

const requestSchema = z.object({
  orderNumber: z.string().trim().min(6),
  reason: z.string().trim().min(3).max(120),
  details: z.string().trim().max(1000).optional().or(z.literal("")),
  items: z.array(z.object({ orderItemId: z.string().uuid(), quantity: z.number().int().min(1) })).min(1),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid return request", errors: parsed.error.flatten() });

    const settings = await getStoreSettings();
    if (!settings.returnsEnabled) return res.status(400).json({ success: false, message: "Returns are currently disabled" });

    const order = await prisma.order.findFirst({
      where: { orderNumber: parsed.data.orderNumber, userId: req.user!.id },
      include: { items: true, shipment: true },
    });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.status !== "DELIVERED") return res.status(400).json({ success: false, message: "Returns can be requested only after delivery" });

    const deliveredAt = order.shipment?.deliveredAt ?? order.updatedAt;
    const deadline = new Date(deliveredAt.getTime() + settings.returnWindowDays * 24 * 60 * 60 * 1000);
    if (Date.now() > deadline.getTime()) return res.status(400).json({ success: false, message: `The ${settings.returnWindowDays}-day return window has ended` });

    const orderItemMap = new Map(order.items.map((item) => [item.id, item]));
    const requestedIds = [...new Set(parsed.data.items.map((item) => item.orderItemId))];
    if (requestedIds.length !== parsed.data.items.length || requestedIds.some((id) => !orderItemMap.has(id))) {
      return res.status(400).json({ success: false, message: "One or more return items are invalid" });
    }

    const createItems: { orderItemId: string; quantity: number; unitRefundAmount: number }[] = [];
    let refundAmount = 0;
    const subtotal = Number(order.subtotal || 0);
    const discount = Number(order.discountAmount || 0);

    for (const requested of parsed.data.items) {
      const orderItem = orderItemMap.get(requested.orderItemId)!;
      const already = await prisma.returnRequestItem.aggregate({
        where: {
          orderItemId: orderItem.id,
          returnRequest: { status: { notIn: ["REJECTED", "CANCELLED"] } },
        },
        _sum: { quantity: true },
      });
      const remaining = orderItem.quantity - Number(already._sum.quantity || 0);
      if (requested.quantity > remaining) return res.status(400).json({ success: false, message: `Only ${remaining} unit(s) of ${orderItem.productName} remain returnable` });

      const lineGross = Number(orderItem.lineTotal);
      const lineDiscount = subtotal > 0 ? discount * (lineGross / subtotal) : 0;
      const effectiveLine = Math.max(0, lineGross - lineDiscount);
      const unitRefund = round2(effectiveLine / orderItem.quantity);
      const lineRefund = round2(unitRefund * requested.quantity);
      refundAmount = round2(refundAmount + lineRefund);
      createItems.push({ orderItemId: orderItem.id, quantity: requested.quantity, unitRefundAmount: unitRefund });
    }

    const created = await prisma.returnRequest.create({
      data: {
        returnNumber: makeReturnNumber(),
        orderId: order.id,
        userId: req.user!.id,
        reason: parsed.data.reason,
        details: parsed.data.details || null,
        refundAmount,
        items: { create: createItems },
      },
      include: { order: true, items: { include: { orderItem: true } } },
    });
    res.status(201).json({ success: true, data: created });
  }),
);

router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const updated = await prisma.returnRequest.updateMany({
      where: { id: req.params.id, userId: req.user!.id, status: "REQUESTED" },
      data: { status: "CANCELLED" },
    });
    if (updated.count !== 1) return res.status(409).json({ success: false, message: "This return can no longer be cancelled" });
    res.json({ success: true });
  }),
);

export default router;
