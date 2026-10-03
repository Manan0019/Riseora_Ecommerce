import { prisma } from "../config/prisma";
import { createUserNotification } from "./notification-center.service";
import { sendRefillReminderEmail } from "./notification.service";
import { availableToSell } from "./inventory.service";

const DAY_MS = 24 * 60 * 60 * 1000;

function plusDays(value: Date, days: number) {
  return new Date(value.getTime() + Math.max(1, days) * DAY_MS);
}

export async function processDueRefillReminders(limit = 250) {
  const now = new Date();
  const rows = await prisma.refillReminder.findMany({
    where: { status: "ACTIVE", nextReminderAt: { lte: now } },
    include: {
      user: { select: { id: true, firstName: true, email: true, isActive: true } },
      variant: {
        include: {
          product: { select: { id: true, name: true, slug: true, isActive: true, replenishmentEnabled: true, images: { orderBy: { sortOrder: "asc" }, take: 1 } } },
        },
      },
    },
    orderBy: { nextReminderAt: "asc" },
    take: Math.min(Math.max(limit, 1), 1000),
  });

  let sent = 0; let deferred = 0; let paused = 0; let failed = 0;
  for (const row of rows) {
    try {
      if (!row.user.isActive || !row.variant.isActive || !row.variant.product.isActive || !row.variant.product.replenishmentEnabled) {
        await prisma.refillReminder.update({ where: { id: row.id }, data: { status: "PAUSED" } });
        paused += 1;
        continue;
      }
      if (availableToSell(row.variant) <= 0) {
        await prisma.refillReminder.update({ where: { id: row.id }, data: { nextReminderAt: plusDays(now, 1) } });
        deferred += 1;
        continue;
      }

      const dueKey = row.nextReminderAt.toISOString();
      await Promise.allSettled([
        sendRefillReminderEmail({
          email: row.user.email,
          firstName: row.user.firstName,
          productName: row.variant.product.name,
          productSlug: row.variant.product.slug,
          variantName: row.variant.name,
          quantity: row.quantity,
          price: row.variant.sellingPrice,
          reminderId: row.id,
          dueKey,
        }),
        createUserNotification({
          userId: row.user.id,
          title: `Time to check your ${row.variant.product.name} refill`,
          message: `${row.variant.name} may be running low based on your ${row.intervalDays}-day reminder. Current price ₹${Number(row.variant.sellingPrice).toFixed(0)}.`,
          type: "REFILL",
          ctaLabel: "Refill now",
          ctaUrl: "/refills",
          metadata: { refillReminderId: row.id, variantId: row.variantId, productId: row.variant.product.id },
          dedupeKey: `refill/${row.id}/${dueKey}`,
        }),
      ]);

      await prisma.refillReminder.update({
        where: { id: row.id },
        data: {
          lastReminderAt: now,
          nextReminderAt: plusDays(now, row.intervalDays),
          reminderCount: { increment: 1 },
        },
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("Refill reminder processing failed", row.id, error);
    }
  }
  return { scanned: rows.length, sent, deferred, paused, failed };
}

export async function rescheduleRefillsAfterDeliveredOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { userId: true, items: { select: { variantId: true, quantity: true, isComplimentary: true } } },
  });
  if (!order?.userId) return { updated: 0 };
  const variantIds = [...new Set(order.items.filter((item) => !item.isComplimentary && item.variantId).map((item) => item.variantId!))];
  if (!variantIds.length) return { updated: 0 };
  const now = new Date();
  const reminders = await prisma.refillReminder.findMany({ where: { userId: order.userId, variantId: { in: variantIds }, status: "ACTIVE" } });
  for (const reminder of reminders) {
    await prisma.refillReminder.update({
      where: { id: reminder.id },
      data: { lastOrderedAt: now, nextReminderAt: plusDays(now, reminder.intervalDays) },
    });
  }
  return { updated: reminders.length };
}

export async function refillReorderPreview(userId: string, reminderId: string) {
  const reminder = await prisma.refillReminder.findFirst({
    where: { id: reminderId, userId, status: { not: "CANCELLED" } },
    include: {
      variant: {
        include: {
          product: {
            include: {
              category: true,
              images: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!reminder) throw new Error("REFILL_NOT_FOUND");
  const variant = reminder.variant;
  const product = variant.product;
  if (!variant.isActive || !product.isActive) throw new Error("PRODUCT_UNAVAILABLE");
  const stock = availableToSell(variant);
  if (stock <= 0) throw new Error("OUT_OF_STOCK");
  const purchaseLimit = product.maxPurchaseQuantity == null ? stock : Math.max(1, Number(product.maxPurchaseQuantity));
  const quantity = Math.max(1, Math.min(reminder.quantity, stock, purchaseLimit));
  return { reminder, items: [{ product, variant, quantity }], adjusted: quantity !== reminder.quantity };
}
