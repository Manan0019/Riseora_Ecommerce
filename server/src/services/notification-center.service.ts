import { prisma } from "../config/prisma";

export async function createUserNotification(userId: string, title: string, message: string, type = "GENERAL") {
  return prisma.notification.create({
    data: { userId, title, message, type },
  });
}

export async function getUserNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function markNotificationRead(userId: string, id: string) {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
}
