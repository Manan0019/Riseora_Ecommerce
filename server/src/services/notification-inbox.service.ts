import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/prisma";
import type { InAppNotificationType } from "./notification-center.service";

export type NotificationInboxCategory = "ORDERS" | "SUPPORT" | "REFILLS" | "SHOPPING" | "RISEORA";

const CATEGORY_TYPES: Record<NotificationInboxCategory, InAppNotificationType[]> = {
  ORDERS: ["ORDER"],
  SUPPORT: ["SUPPORT"],
  REFILLS: ["REFILL"],
  SHOPPING: ["PRICE_DROP", "STOCK_ALERT"],
  RISEORA: ["GENERAL", "CAMPAIGN"],
};

export function notificationInboxCategory(type: string): NotificationInboxCategory {
  if (type === "ORDER") return "ORDERS";
  if (type === "SUPPORT") return "SUPPORT";
  if (type === "REFILL") return "REFILLS";
  if (type === "PRICE_DROP" || type === "STOCK_ALERT") return "SHOPPING";
  return "RISEORA";
}

export function notificationNeedsAttention(item: { type: string; isRead: boolean; ctaUrl?: string | null }) {
  if (item.isRead || !item.ctaUrl) return false;
  return item.type === "ORDER" || item.type === "SUPPORT" || item.type === "REFILL";
}

function summaryFor(items: Array<{ type: string; isRead: boolean; ctaUrl?: string | null }>) {
  const summary = {
    all: items.length,
    unread: 0,
    read: 0,
    actionRequired: 0,
    categories: { ORDERS: 0, SUPPORT: 0, REFILLS: 0, SHOPPING: 0, RISEORA: 0 } as Record<NotificationInboxCategory, number>,
  };
  for (const item of items) {
    const category = notificationInboxCategory(item.type);
    summary.categories[category] += 1;
    if (item.isRead) summary.read += 1;
    else summary.unread += 1;
    if (notificationNeedsAttention(item)) summary.actionRequired += 1;
  }
  return summary;
}

export async function getNotificationCenter(userId: string, limitInput = 80) {
  const limit = Math.min(Math.max(Number(limitInput || 80), 1), 100);
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const items = rows.map((item) => ({
    ...item,
    inboxCategory: notificationInboxCategory(item.type),
    requiresAttention: notificationNeedsAttention(item),
  }));
  return { items, summary: summaryFor(items) };
}

export async function markNotificationSelectionRead(
  userId: string,
  input: { category?: NotificationInboxCategory; actionableOnly?: boolean },
) {
  const where: Prisma.NotificationWhereInput = { userId, isRead: false };
  if (input.category) where.type = { in: CATEGORY_TYPES[input.category] };
  if (input.actionableOnly) {
    where.ctaUrl = { not: null };
    where.type = { in: ["ORDER", "SUPPORT", "REFILL"] };
  }
  return prisma.notification.updateMany({
    where,
    data: { isRead: true, readAt: new Date() },
  });
}

export async function clearReadNotifications(userId: string) {
  return prisma.notification.deleteMany({ where: { userId, isRead: true } });
}

export async function adminNotificationHealth() {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const [created7d, unread, unreadUsers, oldestUnread, grouped] = await Promise.all([
    prisma.notification.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.notification.count({ where: { isRead: false } }),
    prisma.notification.findMany({ where: { isRead: false }, distinct: ["userId"], select: { userId: true } }),
    prisma.notification.findFirst({ where: { isRead: false }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.notification.groupBy({ by: ["type"], where: { createdAt: { gte: sevenDaysAgo } }, _count: { _all: true } }),
  ]);

  const categories = { ORDERS: 0, SUPPORT: 0, REFILLS: 0, SHOPPING: 0, RISEORA: 0 } as Record<NotificationInboxCategory, number>;
  for (const row of grouped) categories[notificationInboxCategory(row.type)] += row._count._all;
  const oldestUnreadHours = oldestUnread ? Math.max(0, Math.round((now - oldestUnread.createdAt.getTime()) / 36_000) / 100) : 0;

  return {
    created7d,
    unread,
    customersWithUnread: unreadUsers.length,
    oldestUnreadHours,
    categories,
  };
}
