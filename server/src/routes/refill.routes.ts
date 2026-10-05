import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { refillReorderPreview } from "../services/refill-reminder.service";
import { getRoutineForecast } from "../services/routine-intelligence.service";
import { availableToSell } from "../services/inventory.service";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  variantId: z.string().uuid(),
  intervalDays: z.number().int().min(7).max(180).optional(),
  quantity: z.number().int().min(1).max(50).default(1),
});

router.get("/intelligence", asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getRoutineForecast(req.user!.id) });
}));

router.get("/", asyncHandler(async (req, res) => {
  const rows = await prisma.refillReminder.findMany({
    where: { userId: req.user!.id, status: { not: "CANCELLED" } },
    include: {
      variant: {
        include: {
          product: { include: { category: true, images: { orderBy: { sortOrder: "asc" }, take: 2 } } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { nextReminderAt: "asc" }],
  });
  res.json({ success: true, data: rows.map((row) => ({ ...row, variant: { ...row.variant, stockQuantity: availableToSell(row.variant), availableQuantity: availableToSell(row.variant) } })) });
}));

router.post("/", asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Choose a valid refill interval and quantity", errors: parsed.error.flatten() });
  const variant = await prisma.productVariant.findUnique({
    where: { id: parsed.data.variantId },
    include: { product: true },
  });
  if (!variant || !variant.isActive || !variant.product.isActive) return res.status(404).json({ success: false, message: "Product variant not available" });
  if (!variant.product.replenishmentEnabled) return res.status(409).json({ success: false, message: "Refill reminders are not enabled for this product" });

  const intervalDays = parsed.data.intervalDays ?? Math.max(7, Math.min(180, Number(variant.product.replenishmentDays || 30)));
  const limit = variant.product.maxPurchaseQuantity == null ? 50 : Math.max(1, Number(variant.product.maxPurchaseQuantity));
  const quantity = Math.min(parsed.data.quantity, limit);
  const nextReminderAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);
  const reminder = await prisma.refillReminder.upsert({
    where: { userId_variantId: { userId: req.user!.id, variantId: variant.id } },
    update: { intervalDays, quantity, status: "ACTIVE", nextReminderAt },
    create: { userId: req.user!.id, variantId: variant.id, intervalDays, quantity, nextReminderAt },
    include: { variant: { include: { product: { include: { images: { orderBy: { sortOrder: "asc" }, take: 2 } } } } } },
  });
  res.status(201).json({ success: true, data: reminder, message: `Refill reminder set for every ${intervalDays} days.` });
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const parsed = z.object({
    intervalDays: z.number().int().min(7).max(180).optional(),
    quantity: z.number().int().min(1).max(50).optional(),
    status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid refill update" });
  const existing = await prisma.refillReminder.findFirst({ where: { id: String(req.params.id), userId: req.user!.id, status: { not: "CANCELLED" } }, include: { variant: { include: { product: true } } } });
  if (!existing) return res.status(404).json({ success: false, message: "Refill reminder not found" });
  const limit = existing.variant.product.maxPurchaseQuantity == null ? 50 : Math.max(1, Number(existing.variant.product.maxPurchaseQuantity));
  const intervalDays = parsed.data.intervalDays ?? existing.intervalDays;
  const status = parsed.data.status ?? existing.status;
  const data: any = {
    ...(parsed.data.intervalDays !== undefined ? { intervalDays } : {}),
    ...(parsed.data.quantity !== undefined ? { quantity: Math.min(parsed.data.quantity, limit) } : {}),
    ...(parsed.data.status !== undefined ? { status } : {}),
  };
  if ((parsed.data.intervalDays !== undefined && existing.status === "ACTIVE") || (parsed.data.status === "ACTIVE" && existing.status !== "ACTIVE")) {
    data.nextReminderAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);
  }
  const reminder = await prisma.refillReminder.update({ where: { id: existing.id }, data });
  res.json({ success: true, data: reminder, message: status === "PAUSED" ? "Refill reminder paused." : "Refill reminder updated." });
}));

router.post("/:id/snooze", asyncHandler(async (req, res) => {
  const parsed = z.object({ days: z.number().int().min(1).max(30).default(7) }).safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid snooze period" });
  const existing = await prisma.refillReminder.findFirst({ where: { id: String(req.params.id), userId: req.user!.id, status: { not: "CANCELLED" } } });
  if (!existing) return res.status(404).json({ success: false, message: "Refill reminder not found" });
  const reminder = await prisma.refillReminder.update({ where: { id: existing.id }, data: { status: "ACTIVE", nextReminderAt: new Date(Date.now() + parsed.data.days * 24 * 60 * 60 * 1000) } });
  res.json({ success: true, data: reminder, message: `Reminder snoozed for ${parsed.data.days} days.` });
}));

router.post("/:id/reorder", asyncHandler(async (req, res) => {
  try {
    const data = await refillReorderPreview(req.user!.id, String(req.params.id));
    res.json({ success: true, data, message: data.adjusted ? "Current stock or purchase limits adjusted the refill quantity." : "Refill is ready using current price and stock." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "REFILL_FAILED";
    if (message === "REFILL_NOT_FOUND") return res.status(404).json({ success: false, message: "Refill reminder not found" });
    if (message === "PRODUCT_UNAVAILABLE") return res.status(409).json({ success: false, message: "This product is no longer available" });
    if (message === "OUT_OF_STOCK") return res.status(409).json({ success: false, message: "This refill is currently out of stock. Your reminder will stay active." });
    throw error;
  }
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const changed = await prisma.refillReminder.updateMany({ where: { id: String(req.params.id), userId: req.user!.id, status: { not: "CANCELLED" } }, data: { status: "CANCELLED" } });
  if (!changed.count) return res.status(404).json({ success: false, message: "Refill reminder not found" });
  res.json({ success: true, message: "Refill reminder cancelled." });
}));

export default router;
