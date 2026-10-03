import { Router } from "express";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/async-handler";
import { processDueRefillReminders } from "../services/refill-reminder.service";

const router = Router();

router.get("/refills/overview", asyncHandler(async (_req, res) => {
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [active, due, upcoming, paused, total, recent, grouped] = await Promise.all([
    prisma.refillReminder.count({ where: { status: "ACTIVE" } }),
    prisma.refillReminder.count({ where: { status: "ACTIVE", nextReminderAt: { lte: now } } }),
    prisma.refillReminder.count({ where: { status: "ACTIVE", nextReminderAt: { gt: now, lte: sevenDays } } }),
    prisma.refillReminder.count({ where: { status: "PAUSED" } }),
    prisma.refillReminder.count(),
    prisma.refillReminder.findMany({
      where: { status: { not: "CANCELLED" } },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, variant: { include: { product: { select: { id: true, name: true, slug: true } } } } },
      orderBy: { updatedAt: "desc" }, take: 120,
    }),
    prisma.refillReminder.groupBy({ by: ["variantId"], where: { status: "ACTIVE" }, _count: { _all: true }, _avg: { intervalDays: true } }),
  ]);
  const ranked = [...grouped].sort((a, b) => b._count._all - a._count._all).slice(0, 12);
  const variantIds = ranked.map((row) => row.variantId);
  const variants = variantIds.length ? await prisma.productVariant.findMany({ where: { id: { in: variantIds } }, include: { product: { select: { name: true, slug: true } } } }) : [];
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
  const popular = ranked.map((row) => ({ variant: variantMap.get(row.variantId), activeReminders: row._count._all, averageDays: Math.round(Number(row._avg.intervalDays || 0)) })).filter((row) => row.variant);
  res.json({ success: true, data: { active, due, upcoming, paused, total, recent, popular } });
}));

router.post("/refills/process", asyncHandler(async (_req, res) => {
  const data = await processDueRefillReminders(500);
  res.json({ success: true, data, message: `Processed ${data.scanned} due refill reminder${data.scanned === 1 ? "" : "s"}.` });
}));

export default router;
