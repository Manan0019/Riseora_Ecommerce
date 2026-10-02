import { prisma } from "../config/prisma";
import { sendPriceDropNotification } from "./notification.service";
import { createUserNotification } from "./notification-center.service";

function eligible(currentPrice: number, subscribedPrice: number, targetPrice: number | null) {
  if (targetPrice != null) return currentPrice <= targetPrice && currentPrice < subscribedPrice;
  return currentPrice < subscribedPrice;
}

async function deliver(alert: any) {
  const variant = alert.variant;
  if (!variant || !variant.isActive || !variant.product?.isActive) return false;

  const currentPrice = Number(variant.sellingPrice || 0);
  const subscribedPrice = Number(alert.subscribedPrice || 0);
  const targetPrice = alert.targetPrice == null ? null : Number(alert.targetPrice);
  if (!eligible(currentPrice, subscribedPrice, targetPrice)) return false;

  const sent = await sendPriceDropNotification({
    email: alert.email,
    name: alert.name,
    productName: variant.product.name,
    productSlug: variant.product.slug,
    variantName: variant.name,
    previousPrice: subscribedPrice,
    currentPrice,
  });
  if (!sent) return false;

  const user = await prisma.user.findUnique({ where: { email: alert.email }, select: { id: true } }).catch(() => null);
  if (user?.id) {
    await createUserNotification({
      userId: user.id,
      title: `${variant.product.name} just dropped in price`,
      message: `${variant.name} is now ₹${currentPrice.toFixed(0)} (was ₹${subscribedPrice.toFixed(0)} when you created the alert).`,
      type: "PRICE_DROP",
      ctaLabel: "View product",
      ctaUrl: `/product/${variant.product.slug}`,
      metadata: { priceAlertId: alert.id, variantId: variant.id, currentPrice, subscribedPrice },
      dedupeKey: `price-alert/${alert.id}/${currentPrice.toFixed(2)}`,
    }).catch((error) => console.error("Price alert in-app notification failed", error));
  }

  await prisma.priceAlert.updateMany({
    where: { id: alert.id, status: "PENDING" },
    data: { status: "NOTIFIED", notifiedAt: new Date() },
  });
  return true;
}

export async function notifyPriceAlertsForVariant(variantId: string) {
  const alerts = await prisma.priceAlert.findMany({
    where: { variantId, status: "PENDING", variant: { isActive: true, product: { isActive: true } } },
    include: { variant: { include: { product: true } } },
    take: 250,
  });
  let sent = 0;
  for (const alert of alerts) {
    try { if (await deliver(alert)) sent += 1; }
    catch (error) { console.error("Price alert email failed", error); }
  }
  return { pending: alerts.length, sent };
}

export async function notifyEligiblePriceAlerts(limit = 250) {
  const alerts = await prisma.priceAlert.findMany({
    where: { status: "PENDING", variant: { isActive: true, product: { isActive: true } } },
    include: { variant: { include: { product: true } } },
    orderBy: { subscribedAt: "asc" },
    take: limit,
  });
  let eligibleCount = 0;
  let sent = 0;
  for (const alert of alerts) {
    const currentPrice = Number(alert.variant?.sellingPrice || 0);
    const subscribedPrice = Number(alert.subscribedPrice || 0);
    const targetPrice = alert.targetPrice == null ? null : Number(alert.targetPrice);
    if (!eligible(currentPrice, subscribedPrice, targetPrice)) continue;
    eligibleCount += 1;
    try { if (await deliver(alert)) sent += 1; }
    catch (error) { console.error("Price alert email failed", error); }
  }
  return { pending: alerts.length, eligible: eligibleCount, sent };
}
