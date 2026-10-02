import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

export type InAppNotificationType = "GENERAL" | "ORDER" | "PRICE_DROP" | "STOCK_ALERT" | "CAMPAIGN";

type CreateNotificationInput = {
  userId: string;
  title: string;
  message: string;
  type?: InAppNotificationType;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  dedupeKey?: string | null;
};

export async function createUserNotification(input: CreateNotificationInput) {
  const data = {
    userId: input.userId,
    title: input.title,
    message: input.message,
    type: input.type || "GENERAL",
    ctaLabel: input.ctaLabel || null,
    ctaUrl: input.ctaUrl || null,
    metadata: input.metadata === null ? Prisma.JsonNull : (input.metadata ?? undefined),
    dedupeKey: input.dedupeKey || null,
  };
  if (input.dedupeKey) {
    return prisma.notification.upsert({
      where: { dedupeKey: input.dedupeKey },
      update: {},
      create: data,
    });
  }
  return prisma.notification.create({ data });
}

export async function getUserNotifications(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 40), 1), 100);
  return prisma.notification.findMany({
    where: { userId, ...(options.unreadOnly ? { isRead: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getUnreadNotificationCount(userId: string) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function markNotificationRead(userId: string, id: string) {
  return prisma.notification.updateMany({
    where: { id, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function deleteUserNotification(userId: string, id: string) {
  return prisma.notification.deleteMany({ where: { id, userId } });
}

export async function createOrderPlacedInAppNotification(order: { id: string; userId?: string | null; orderNumber: string; totalAmount?: unknown }) {
  if (!order.userId) return null;
  return createUserNotification({
    userId: order.userId,
    title: `Order ${order.orderNumber} received`,
    message: `We have received your order${order.totalAmount != null ? ` for ₹${Number(order.totalAmount).toFixed(0)}` : ""}. We’ll keep you updated here as it moves forward.`,
    type: "ORDER",
    ctaLabel: "View order",
    ctaUrl: `/orders/${order.orderNumber}`,
    metadata: { orderId: order.id, orderNumber: order.orderNumber },
    dedupeKey: `order-placed/${order.id}`,
  });
}

export async function createOrderStatusInAppNotification(order: { id: string; userId?: string | null; orderNumber: string; status: string; shipment?: { carrier?: string | null; trackingNumber?: string | null } | null }) {
  if (!order.userId) return null;
  const copy: Record<string, string> = {
    CONFIRMED: "Your order is confirmed and queued for processing.",
    PROCESSING: "Your Riseora order is being prepared with care.",
    SHIPPED: order.shipment?.trackingNumber ? `Your order has shipped via ${order.shipment.carrier || "our courier"}. Tracking: ${order.shipment.trackingNumber}.` : "Your order has shipped and is on the way.",
    DELIVERED: "Your order has been delivered. We hope you love your Riseora products.",
    CANCELLED: "Your order has been cancelled. Open the order for full details.",
    PENDING: "Your order is pending confirmation.",
  };
  return createUserNotification({
    userId: order.userId,
    title: `Order ${order.orderNumber}: ${order.status.toLowerCase().replaceAll("_", " ")}`,
    message: copy[order.status] || `Your order status changed to ${order.status}.`,
    type: "ORDER",
    ctaLabel: "View order",
    ctaUrl: `/orders/${order.orderNumber}`,
    metadata: { orderId: order.id, orderNumber: order.orderNumber, status: order.status },
    dedupeKey: `order-status/${order.id}/${order.status}`,
  });
}

export async function createReturnStatusInAppNotification(request: { id: string; userId?: string | null; returnNumber: string; status: string; order?: { orderNumber?: string | null } | null }) {
  if (!request.userId) return null;
  return createUserNotification({
    userId: request.userId,
    title: `Return ${request.returnNumber}: ${request.status.toLowerCase().replaceAll("_", " ")}`,
    message: `Your return request is now ${request.status.toLowerCase().replaceAll("_", " ")}.`,
    type: "ORDER",
    ctaLabel: "View returns",
    ctaUrl: "/returns",
    metadata: { returnId: request.id, returnNumber: request.returnNumber, status: request.status },
    dedupeKey: `return-status/${request.id}/${request.status}`,
  });
}
