import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { processCartRecoveryReminders } from "./cart-recovery.service";
import { notifyEligiblePriceAlerts } from "./price-alert.service";
import { notifyReadyStockAlerts } from "./stock-alert.service";

export type LifecycleJob = "ALL" | "CART_RECOVERY" | "STOCK_ALERTS" | "PRICE_ALERTS";

export async function getLifecycleOverview() {
  const now = new Date();
  const firstCutoff = new Date(now.getTime() - env.CART_RECOVERY_FIRST_DELAY_MINUTES * 60 * 1000);
  const secondCutoff = new Date(now.getTime() - env.CART_RECOVERY_SECOND_DELAY_MINUTES * 60 * 1000);
  const [activeRecoveries, optedRecoveries, dueRecoveries, pendingStock, readyStock, pendingPrice, priceRows] = await Promise.all([
    prisma.cartRecoverySession.count({ where: { status: "ACTIVE", expiresAt: { gt: now } } }),
    prisma.cartRecoverySession.count({ where: { status: "ACTIVE", expiresAt: { gt: now }, recoveryOptIn: true } }),
    prisma.cartRecoverySession.count({ where: { status: "ACTIVE", expiresAt: { gt: now }, recoveryOptIn: true, OR: [
      { reminderCount: 0, lastSeenAt: { lte: firstCutoff } },
      { reminderCount: 1, lastReminderAt: { lte: secondCutoff } },
    ] } }),
    prisma.stockAlert.count({ where: { status: "PENDING" } }),
    prisma.stockAlert.count({ where: { status: "PENDING", variant: { stockQuantity: { gt: 0 }, isActive: true, product: { isActive: true } } } }),
    prisma.priceAlert.count({ where: { status: "PENDING" } }),
    prisma.priceAlert.findMany({
      where: { status: "PENDING", variant: { isActive: true, product: { isActive: true } } },
      select: { subscribedPrice: true, targetPrice: true, variant: { select: { sellingPrice: true } } },
      take: 1000,
    }),
  ]);

  const eligiblePrice = priceRows.filter((row: { subscribedPrice: unknown; targetPrice: unknown; variant: { sellingPrice: unknown } }) => {
    const current = Number(row.variant.sellingPrice || 0);
    const subscribed = Number(row.subscribedPrice || 0);
    const target = row.targetPrice == null ? null : Number(row.targetPrice);
    return target == null ? current < subscribed : current <= target && current < subscribed;
  }).length;

  return {
    emailConfigured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    cartRecoveryAutomationEnabled: Boolean(env.CART_RECOVERY_ENABLED),
    cartRecoveryFirstDelayMinutes: env.CART_RECOVERY_FIRST_DELAY_MINUTES,
    cartRecoverySecondDelayMinutes: env.CART_RECOVERY_SECOND_DELAY_MINUTES,
    activeRecoveries,
    optedRecoveries,
    dueRecoveries,
    pendingStock,
    readyStock,
    pendingPrice,
    eligiblePrice,
  };
}

export async function runLifecycleJob(job: LifecycleJob) {
  const result: Record<string, unknown> = {};
  if (job === "ALL" || job === "CART_RECOVERY") result.cartRecovery = await processCartRecoveryReminders(100);
  if (job === "ALL" || job === "STOCK_ALERTS") result.stockAlerts = await notifyReadyStockAlerts(250);
  if (job === "ALL" || job === "PRICE_ALERTS") result.priceAlerts = await notifyEligiblePriceAlerts(250);
  return result;
}
