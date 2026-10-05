import { prisma } from "../config/prisma";
import { availableToSell } from "./inventory.service";
import { getStoreSettings } from "./store.service";

type PostPurchaseEvent = {
  at: number;
  type: "care_view" | "reorder_preview" | "reorder_add";
  adjusted: boolean;
  priceChanged: boolean;
};

const WINDOW_MS = 60 * 60 * 1000;
const events: PostPurchaseEvent[] = [];

function prune() {
  const cutoff = Date.now() - WINDOW_MS;
  while (events.length && events[0].at < cutoff) events.shift();
}

function record(type: PostPurchaseEvent["type"], details: { adjusted?: boolean; priceChanged?: boolean } = {}) {
  prune();
  events.push({ at: Date.now(), type, adjusted: Boolean(details.adjusted), priceChanged: Boolean(details.priceChanged) });
  if (events.length > 2000) events.splice(0, events.length - 2000);
}

export function postPurchaseSnapshot() {
  prune();
  const count = (type: PostPurchaseEvent["type"]) => events.filter((event) => event.type === type).length;
  const previews = count("reorder_preview");
  const adds = count("reorder_add");
  return {
    windowMinutes: 60,
    careViews: count("care_view"),
    reorderPreviews: previews,
    reorderAdds: adds,
    reorderAddRatePercent: previews ? Number(((adds / previews) * 100).toFixed(1)) : 0,
    adjustedPreviews: events.filter((event) => event.type === "reorder_preview" && event.adjusted).length,
    priceChangePreviews: events.filter((event) => event.type === "reorder_preview" && event.priceChanged).length,
  };
}

export async function buildReorderPreview(userId: string, orderNumber: string, eventType?: "reorder_preview" | "reorder_add") {
  const order = await prisma.order.findFirst({
    where: { orderNumber: String(orderNumber).toUpperCase(), userId },
    include: { items: true },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.status !== "DELIVERED") throw new Error("REORDER_NOT_AVAILABLE");

  const sourceItems = order.items.filter((item) => !item.isComplimentary && item.variantId);
  const ids = [...new Set(sourceItems.map((item) => item.variantId!).filter(Boolean))];
  const variants = ids.length ? await prisma.productVariant.findMany({
    where: { id: { in: ids } },
    include: {
      product: {
        include: {
          category: true,
          images: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  }) : [];
  const variantMap = new Map<string, any>(variants.map((variant: any) => [variant.id, variant]));
  const usedByProduct = new Map<string, number>();
  const ready: any[] = [];
  const skipped: any[] = [];

  for (const item of sourceItems) {
    const variant = item.variantId ? variantMap.get(item.variantId) : null;
    if (!variant || !variant.isActive || !variant.product.isActive) {
      skipped.push({ sku: item.sku, productName: item.productName, reason: "No longer available" });
      continue;
    }
    const stock = availableToSell(variant);
    if (stock <= 0) {
      skipped.push({ sku: item.sku, productName: item.productName, reason: "Out of stock" });
      continue;
    }
    const limit = variant.product.maxPurchaseQuantity == null ? null : Number(variant.product.maxPurchaseQuantity);
    const already = usedByProduct.get(variant.productId) || 0;
    const room = limit == null ? stock : Math.max(0, limit - already);
    const quantity = Math.max(0, Math.min(Number(item.quantity || 1), stock, room));
    if (quantity <= 0) {
      skipped.push({ sku: item.sku, productName: item.productName, reason: "Current purchase limit reached" });
      continue;
    }
    usedByProduct.set(variant.productId, already + quantity);
    const previousUnitPrice = Number(item.unitPrice);
    const currentUnitPrice = Number(variant.sellingPrice);
    ready.push({
      product: variant.product,
      variant: { ...variant, stockQuantity: stock, availableQuantity: stock },
      quantity,
      previousQuantity: Number(item.quantity || 1),
      previousUnitPrice,
      currentUnitPrice,
      priceChanged: Math.abs(previousUnitPrice - currentUnitPrice) >= 0.01,
      currentLineTotal: Number((currentUnitPrice * quantity).toFixed(2)),
      previousLineTotal: Number((previousUnitPrice * Number(item.quantity || 1)).toFixed(2)),
    });
    if (quantity < Number(item.quantity || 1)) {
      skipped.push({ sku: item.sku, productName: item.productName, reason: `Quantity adjusted to ${quantity} for current stock/limits` });
    }
  }

  const previousTotal = Number(sourceItems.reduce((sum, item) => sum + Number(item.unitPrice) * Number(item.quantity || 1), 0).toFixed(2));
  const currentTotal = Number(ready.reduce((sum, item) => sum + item.currentLineTotal, 0).toFixed(2));
  const data = {
    orderNumber: order.orderNumber,
    items: ready,
    skipped,
    originalItemCount: sourceItems.length,
    availableItemCount: ready.length,
    unavailableItemCount: skipped.length,
    previousTotal,
    currentTotal,
    priceDifference: Number((currentTotal - previousTotal).toFixed(2)),
    priceChanged: ready.some((item) => item.priceChanged),
  };

  if (eventType) record(eventType, { adjusted: skipped.length > 0, priceChanged: data.priceChanged });
  return data;
}

export async function getOrderCare(userId: string, orderNumber: string) {
  const order = await prisma.order.findFirst({
    where: { orderNumber: String(orderNumber).toUpperCase(), userId },
    include: { shipment: true, returnRequests: { select: { id: true, status: true, requestedAt: true } } },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");

  const settings = await getStoreSettings();
  const deliveredAt = order.shipment?.deliveredAt ?? (order.status === "DELIVERED" ? order.updatedAt : null);
  const returnDeadline = deliveredAt ? new Date(deliveredAt.getTime() + Number(settings.returnWindowDays || 0) * 24 * 60 * 60 * 1000) : null;
  const returnEligible = Boolean(settings.returnsEnabled && order.status === "DELIVERED" && returnDeadline && Date.now() <= returnDeadline.getTime());
  const daysRemaining = returnDeadline ? Math.max(0, Math.ceil((returnDeadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : null;

  let reorder: any = null;
  if (order.status === "DELIVERED") {
    try {
      const preview = await buildReorderPreview(userId, order.orderNumber);
      reorder = {
        availableItemCount: preview.availableItemCount,
        originalItemCount: preview.originalItemCount,
        unavailableItemCount: preview.unavailableItemCount,
        priceChanged: preview.priceChanged,
      };
    } catch {
      reorder = { availableItemCount: 0, originalItemCount: 0, unavailableItemCount: 0, priceChanged: false };
    }
  }

  const nextAction = order.status === "DELIVERED"
    ? "Your order is delivered. You can buy available items again, request an eligible return or contact Riseora Care."
    : order.status === "SHIPPED"
      ? "Your order is on the way. Follow the shipment journey for the latest courier update."
      : order.status === "CANCELLED"
        ? "This order is cancelled. View refund/payment details or contact Riseora Care if you need help."
        : "Your order is being prepared. You can track progress here and request cancellation while it remains eligible.";

  record("care_view");
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    nextAction,
    returns: {
      enabled: Boolean(settings.returnsEnabled),
      eligible: returnEligible,
      windowDays: Number(settings.returnWindowDays || 0),
      deadline: returnDeadline?.toISOString() || null,
      daysRemaining,
      existingRequests: order.returnRequests.length,
    },
    reorder,
  };
}
