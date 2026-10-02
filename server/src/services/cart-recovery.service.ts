import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { sendCartRecoveryEmail } from "./notification.service";
import { createUserNotification } from "./notification-center.service";

function canSendEmail() {
  return Boolean(env.CART_RECOVERY_ENABLED && env.RESEND_API_KEY && env.EMAIL_FROM);
}

export async function sendCartRecoveryReminder(id: string, force = false) {
  const session = await prisma.cartRecoverySession.findUnique({ where: { id } });
  if (!session || session.status !== "ACTIVE" || session.expiresAt <= new Date()) return { sent: false, reason: "Cart is no longer recoverable" };
  if (!session.recoveryOptIn) return { sent: false, reason: "Customer did not opt in to recovery reminders" };
  if (!force && !canSendEmail()) return { sent: false, reason: "Cart recovery email is not configured or enabled" };
  if (force && !(env.RESEND_API_KEY && env.EMAIL_FROM)) return { sent: false, reason: "Email delivery is not configured" };
  if (session.reminderCount >= 2) return { sent: false, reason: "Maximum reminder count reached" };

  const items = Array.isArray(session.items) ? session.items as Array<{ productName?: string; variantName?: string; quantity?: number }> : [];
  const reminderNumber = session.reminderCount + 1;
  const sent = await sendCartRecoveryEmail({
    email: session.email,
    name: session.name,
    cartToken: session.cartToken,
    subtotal: session.subtotal,
    reminderNumber,
    items,
  });
  if (!sent) return { sent: false, reason: "Email delivery is not configured" };

  await prisma.cartRecoverySession.update({
    where: { id: session.id },
    data: { reminderCount: { increment: 1 }, lastReminderAt: new Date() },
  });
  if (session.userId) {
    await createUserNotification({
      userId: session.userId,
      title: reminderNumber > 1 ? "Your Riseora cart is still waiting" : "You left something in your Riseora cart",
      message: `Your saved cart is worth ₹${Number(session.subtotal || 0).toFixed(0)}. Prices and stock are checked again when you return.`,
      type: "CAMPAIGN",
      ctaLabel: "Restore cart",
      ctaUrl: `/recover-cart/${session.cartToken}`,
      metadata: { cartRecoveryId: session.id, reminderNumber },
      dedupeKey: `cart-recovery/${session.id}/${reminderNumber}`,
    }).catch((error) => console.error("Cart recovery in-app notification failed", error));
  }
  return { sent: true, reminderNumber };
}

export async function processCartRecoveryReminders(limit = 100) {
  if (!canSendEmail()) return { checked: 0, sent: 0 };

  const now = new Date();
  const firstCutoff = new Date(now.getTime() - env.CART_RECOVERY_FIRST_DELAY_MINUTES * 60 * 1000);
  const secondCutoff = new Date(now.getTime() - env.CART_RECOVERY_SECOND_DELAY_MINUTES * 60 * 1000);

  await prisma.cartRecoverySession.updateMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

  const candidates = await prisma.cartRecoverySession.findMany({
    where: {
      status: "ACTIVE",
      recoveryOptIn: true,
      expiresAt: { gt: now },
      OR: [
        { reminderCount: 0, lastSeenAt: { lte: firstCutoff } },
        { reminderCount: 1, lastReminderAt: { lte: secondCutoff } },
      ],
    },
    orderBy: { lastSeenAt: "asc" },
    take: limit,
  });

  let sent = 0;
  for (const candidate of candidates) {
    try {
      const result = await sendCartRecoveryReminder(candidate.id);
      if (result.sent) sent += 1;
    } catch (error) {
      console.error(`Cart recovery reminder failed for ${candidate.id}`, error);
    }
  }
  return { checked: candidates.length, sent };
}
