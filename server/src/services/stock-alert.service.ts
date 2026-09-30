import { prisma } from "../config/prisma";
import { sendBackInStockNotification } from "./notification.service";

async function deliver(alert: any) {
  const variant = alert.variant;
  if (!variant || Number(variant.stockQuantity) <= 0 || !variant.isActive || !variant.product?.isActive) return false;
  const sent = await sendBackInStockNotification({
    email: alert.email,
    name: alert.name,
    productName: variant.product.name,
    productSlug: variant.product.slug,
    variantName: variant.name,
  });
  if (!sent) return false;
  await prisma.stockAlert.updateMany({
    where: { id: alert.id, status: "PENDING" },
    data: { status: "NOTIFIED", notifiedAt: new Date() },
  });
  return true;
}

export async function notifyStockAlertsForVariant(variantId: string) {
  const alerts = await prisma.stockAlert.findMany({
    where: { variantId, status: "PENDING", variant: { stockQuantity: { gt: 0 }, isActive: true, product: { isActive: true } } },
    include: { variant: { include: { product: true } } },
    take: 250,
  });
  let sent = 0;
  for (const alert of alerts) {
    try { if (await deliver(alert)) sent += 1; }
    catch (error) { console.error("Stock alert email failed", error); }
  }
  return { pending: alerts.length, sent };
}

export async function notifyReadyStockAlerts(limit = 250) {
  const alerts = await prisma.stockAlert.findMany({
    where: { status: "PENDING", variant: { stockQuantity: { gt: 0 }, isActive: true, product: { isActive: true } } },
    include: { variant: { include: { product: true } } },
    orderBy: { subscribedAt: "asc" },
    take: limit,
  });
  let sent = 0;
  for (const alert of alerts) {
    try { if (await deliver(alert)) sent += 1; }
    catch (error) { console.error("Stock alert email failed", error); }
  }
  return { pending: alerts.length, sent };
}
