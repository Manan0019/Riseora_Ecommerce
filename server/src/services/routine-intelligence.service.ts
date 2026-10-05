import { prisma } from "../config/prisma";
import { availableToSell } from "./inventory.service";
import { getStoreSettings } from "./store.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function daysBetween(a: Date, b: Date) {
  return Math.max(1, Math.round(Math.abs(b.getTime() - a.getTime()) / DAY_MS));
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function deliveredAt(order: any) {
  return order.shipment?.deliveredAt || order.statusHistory?.[0]?.createdAt || order.updatedAt || order.createdAt;
}

function forecastStatus(daysUntil: number) {
  if (daysUntil <= 0) return "DUE";
  if (daysUntil <= 7) return "SOON";
  if (daysUntil <= 21) return "UPCOMING";
  return "LATER";
}

export async function getRoutineForecast(userId: string) {
  const [orders, reminders] = await Promise.all([
    prisma.order.findMany({
      where: { userId, status: "DELIVERED" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        shipment: { select: { deliveredAt: true } },
        statusHistory: { where: { status: "DELIVERED" }, select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        items: {
          where: { isComplimentary: false, variantId: { not: null } },
          select: {
            quantity: true,
            unitPrice: true,
            variantId: true,
            variant: {
              select: {
                id: true,
                name: true,
                sku: true,
                sellingPrice: true,
                mrp: true,
                stockQuantity: true,
                safetyStock: true,
                isActive: true,
                weightGrams: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    isActive: true,
                    replenishmentEnabled: true,
                    replenishmentDays: true,
                    replenishmentLabel: true,
                    maxPurchaseQuantity: true,
                    images: { select: { id: true, url: true, altText: true, isPrimary: true, sortOrder: true }, orderBy: { sortOrder: "asc" }, take: 2 },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.refillReminder.findMany({
      where: { userId, status: { not: "CANCELLED" } },
      select: { id: true, variantId: true, intervalDays: true, quantity: true, status: true, nextReminderAt: true },
    }),
  ]);

  const reminderByVariant = new Map<string, any>(reminders.map((item) => [item.variantId, item] as [string, any]));
  const history = new Map<string, { variant: any; events: Array<{ at: Date; quantity: number; unitPrice: number }> }>();

  for (const order of orders) {
    const at = new Date(deliveredAt(order));
    for (const item of order.items) {
      const variant = item.variant;
      if (!variant?.id || !variant.product?.replenishmentEnabled) continue;
      const bucket = history.get(variant.id) || { variant, events: [] };
      bucket.events.push({ at, quantity: Math.max(1, Number(item.quantity || 1)), unitPrice: Number(item.unitPrice || 0) });
      history.set(variant.id, bucket);
    }
  }

  const now = new Date();
  const products = [] as any[];
  for (const [variantId, bucket] of history.entries()) {
    const variant = bucket.variant;
    const product = variant.product;
    if (!variant.isActive || !product?.isActive) continue;
    const events = [...bucket.events].sort((a, b) => a.at.getTime() - b.at.getTime());
    if (!events.length) continue;

    const recent = events.slice(-5);
    const intervals = recent.slice(1).map((event, index) => daysBetween(recent[index].at, event.at));
    const productCadence = clamp(Number(product.replenishmentDays || 30), 7, 180);
    const suggestedIntervalDays = clamp(intervals.length ? median(intervals) : productCadence, 7, 180);
    const last = events[events.length - 1];
    const nextSuggestedAt = new Date(last.at.getTime() + suggestedIntervalDays * DAY_MS);
    const daysUntil = Math.ceil((nextSuggestedAt.getTime() - now.getTime()) / DAY_MS);
    const reminder = reminderByVariant.get(variantId) || null;
    const quantity = clamp(Math.round(median(recent.map((event) => event.quantity))) || last.quantity || 1, 1, Number(product.maxPurchaseQuantity || 50));
    const availability = availableToSell(variant);
    const currentPrice = Number(variant.sellingPrice || 0);
    const lastPrice = Number(last.unitPrice || 0);
    const confidence = events.length >= 3 ? "HIGH" : events.length === 2 ? "MEDIUM" : "STARTER";
    const timingSource = intervals.length ? `${events.length} delivered purchases` : product.replenishmentLabel || "Riseora product cadence";

    products.push({
      variantId,
      productId: product.id,
      product,
      variant: { ...variant, stockQuantity: availability, availableQuantity: availability },
      purchaseCount: events.length,
      suggestedIntervalDays,
      suggestedQuantity: quantity,
      lastDeliveredAt: last.at,
      nextSuggestedAt,
      daysUntil,
      status: forecastStatus(daysUntil),
      confidence,
      timingSource,
      availability,
      currentPrice,
      lastPrice,
      priceChanged: Math.abs(currentPrice - lastPrice) >= 0.01,
      reminder,
      reminderAligned: Boolean(reminder && Math.abs(Number(reminder.intervalDays) - suggestedIntervalDays) <= 5),
    });
  }

  products.sort((a, b) => a.daysUntil - b.daysUntil || b.purchaseCount - a.purchaseCount);
  const dueNow = products.filter((item) => item.status === "DUE").length;
  const dueSoon = products.filter((item) => item.status === "SOON").length;
  const protectedByReminder = products.filter((item) => item.reminder?.status === "ACTIVE").length;

  return {
    generatedAt: now,
    summary: { repeatProducts: products.length, dueNow, dueSoon, protectedByReminder },
    products: products.slice(0, 12),
  };
}

export async function getRoutineRetentionSummary() {
  const settings = await getStoreSettings();
  const voucherPoints = Math.max(0, Number(settings.rewardVoucherPoints || 0));
  const nearRewardFloor = voucherPoints > 0 ? Math.ceil(voucherPoints * 0.75) : 0;
  const now = new Date();
  const next7 = new Date(now.getTime() + 7 * DAY_MS);
  const next30 = new Date(now.getTime() + 30 * DAY_MS);

  const [activeReminders, dueReminders, next7Reminders, next30Reminders, pausedReminders, reminderUsers, nearRewardCustomers] = await Promise.all([
    prisma.refillReminder.count({ where: { status: "ACTIVE" } }),
    prisma.refillReminder.count({ where: { status: "ACTIVE", nextReminderAt: { lte: now } } }),
    prisma.refillReminder.count({ where: { status: "ACTIVE", nextReminderAt: { gt: now, lte: next7 } } }),
    prisma.refillReminder.count({ where: { status: "ACTIVE", nextReminderAt: { gt: next7, lte: next30 } } }),
    prisma.refillReminder.count({ where: { status: "PAUSED" } }),
    prisma.refillReminder.findMany({ where: { status: "ACTIVE" }, distinct: ["userId"], select: { userId: true } }),
    nearRewardFloor > 0
      ? prisma.rewardAccount.count({ where: { balance: { gte: nearRewardFloor, lt: voucherPoints } } })
      : Promise.resolve(0),
  ]);

  return {
    activeReminders,
    dueReminders,
    next7Reminders,
    next30Reminders,
    pausedReminders,
    customersWithActiveReminders: reminderUsers.length,
    nearRewardCustomers,
    rewardThresholdPoints: voucherPoints,
    nearRewardFloor,
  };
}
