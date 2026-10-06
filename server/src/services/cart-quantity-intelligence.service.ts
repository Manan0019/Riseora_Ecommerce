import { prisma } from "../config/prisma";
import { availableToSell } from "./inventory.service";

type RequestedLine = { variantId: string; quantity: number };
type ReadinessEvent = { at: number; adjustmentRequired: boolean; lowStock: boolean; atLimit: boolean };

const readinessEvents: ReadinessEvent[] = [];
const WINDOW_MS = 60 * 60 * 1000;

function normalizeQuantity(value: unknown) {
  const parsed = Math.trunc(Number(value || 0));
  return Number.isFinite(parsed) ? Math.max(1, Math.min(99, parsed)) : 1;
}

function normalizeRequestedLines(value: unknown): RequestedLine[] {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, number>();
  for (const raw of value.slice(0, 50)) {
    const variantId = typeof raw?.variantId === "string" ? raw.variantId : "";
    if (!variantId) continue;
    merged.set(variantId, Math.max(merged.get(variantId) || 0, normalizeQuantity(raw?.quantity)));
  }
  return [...merged.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
}

function pruneEvents() {
  const cutoff = Date.now() - WINDOW_MS;
  while (readinessEvents.length && readinessEvents[0].at < cutoff) readinessEvents.shift();
}

function recordReadinessEvent(event: Omit<ReadinessEvent, "at">) {
  readinessEvents.push({ ...event, at: Date.now() });
  pruneEvents();
}

export async function getCartQuantityReadiness(requestedValue: unknown) {
  const requested = normalizeRequestedLines(requestedValue);
  if (!requested.length) {
    return {
      lines: [],
      summary: { lineCount: 0, readyLines: 0, lowStockLines: 0, atLimitLines: 0, adjustmentLines: 0, checkoutReady: true },
      policy: "Current price, public availability and purchase limits are re-read from the live catalogue before checkout.",
    };
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: requested.map((row) => row.variantId) }, isActive: true, product: { isActive: true } },
    include: { product: { include: { images: { orderBy: { sortOrder: "asc" } } } } },
  });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const requestedByProduct = new Map<string, number>();

  for (const row of requested) {
    const variant = byId.get(row.variantId);
    if (!variant) continue;
    requestedByProduct.set(variant.productId, (requestedByProduct.get(variant.productId) || 0) + row.quantity);
  }

  const acceptedByProduct = new Map<string, number>();
  const lines = requested.map((row) => {
    const variant = byId.get(row.variantId);
    if (!variant) {
      return {
        variantId: row.variantId,
        requestedQuantity: row.quantity,
        safeQuantity: 0,
        quantityCeiling: 0,
        status: "UNAVAILABLE" as const,
        messages: ["This option is no longer available."],
      };
    }

    const available = availableToSell(variant);
    const productLimit = Number.isInteger(variant.product.maxPurchaseQuantity) && Number(variant.product.maxPurchaseQuantity) > 0
      ? Number(variant.product.maxPurchaseQuantity)
      : null;
    const alreadyAccepted = acceptedByProduct.get(variant.productId) || 0;
    const remainingByProduct = productLimit == null ? available : Math.max(0, productLimit - alreadyAccepted);
    const quantityCeiling = Math.max(0, Math.min(available, remainingByProduct));
    const safeQuantity = Math.max(0, Math.min(row.quantity, quantityCeiling));
    acceptedByProduct.set(variant.productId, alreadyAccepted + safeQuantity);

    const lowStockThreshold = Math.max(0, Number(variant.lowStockThreshold || 0));
    const lowStock = available > 0 && lowStockThreshold > 0 && available <= lowStockThreshold;
    const productRequested = requestedByProduct.get(variant.productId) || 0;
    const productLimitReached = productLimit != null && productRequested >= productLimit;
    const stockLimitReached = safeQuantity > 0 && safeQuantity >= available;
    const adjustmentRequired = safeQuantity !== row.quantity;
    const atLimit = safeQuantity > 0 && (productLimitReached || stockLimitReached || safeQuantity >= quantityCeiling);
    const messages: string[] = [];

    if (available <= 0) messages.push("Currently unavailable after safety stock.");
    if (adjustmentRequired && safeQuantity > 0) messages.push(`Quantity adjusted from ${row.quantity} to ${safeQuantity} using current availability and purchase limits.`);
    if (adjustmentRequired && safeQuantity <= 0) messages.push("This quantity cannot be purchased right now.");
    if (productLimit != null) messages.push(`Purchase limit: ${productLimit} per product.`);
    if (lowStock) messages.push(`Only ${available} currently available after safety stock.`);
    if (!messages.length) messages.push("Ready at the current quantity.");

    const primary = variant.product.images.find((image) => image.isPrimary) || variant.product.images[0];
    return {
      variantId: variant.id,
      productId: variant.product.id,
      productSlug: variant.product.slug,
      productName: variant.product.name,
      variantName: variant.name,
      sku: variant.sku,
      imageUrl: primary?.url || "",
      price: Number(variant.sellingPrice),
      mrp: Number(variant.mrp),
      stockQuantity: available,
      weightGrams: Math.max(0, Number(variant.weightGrams || 0)),
      maxPurchaseQuantity: productLimit,
      requestedQuantity: row.quantity,
      safeQuantity,
      quantityCeiling,
      lowStockThreshold,
      lowStock,
      atLimit,
      adjustmentRequired,
      status: available <= 0 ? "UNAVAILABLE" as const : adjustmentRequired ? "ADJUST" as const : lowStock ? "LOW_STOCK" as const : atLimit ? "AT_LIMIT" as const : "READY" as const,
      messages,
    };
  });

  const readyLines = lines.filter((line) => line.status === "READY").length;
  const lowStockLines = lines.filter((line) => "lowStock" in line && line.lowStock).length;
  const atLimitLines = lines.filter((line) => "atLimit" in line && line.atLimit).length;
  const adjustmentLines = lines.filter((line) => "adjustmentRequired" in line && line.adjustmentRequired).length;
  const checkoutReady = adjustmentLines === 0 && lines.every((line) => line.status !== "UNAVAILABLE");

  recordReadinessEvent({ adjustmentRequired: adjustmentLines > 0, lowStock: lowStockLines > 0, atLimit: atLimitLines > 0 });

  return {
    lines,
    summary: { lineCount: lines.length, readyLines, lowStockLines, atLimitLines, adjustmentLines, checkoutReady },
    policy: "Current price, public availability and purchase limits are re-read from the live catalogue before checkout. Safety stock is never counted as customer-available inventory.",
  };
}

export async function cartQuantityHealth() {
  pruneEvents();
  const [activeProducts, productsWithLimit, activeVariants, lowStockVariants] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true, maxPurchaseQuantity: { not: null } } }),
    prisma.productVariant.count({ where: { isActive: true, product: { isActive: true } } }),
    prisma.productVariant.findMany({
      where: { isActive: true, product: { isActive: true } },
      select: { stockQuantity: true, safetyStock: true, lowStockThreshold: true },
    }),
  ]);

  const lowStockSellableVariants = lowStockVariants.filter((variant) => {
    const available = Math.max(0, Number(variant.stockQuantity || 0) - Math.max(0, Number(variant.safetyStock || 0)));
    const threshold = Math.max(0, Number(variant.lowStockThreshold || 0));
    return available > 0 && threshold > 0 && available <= threshold;
  }).length;

  return {
    activeProducts,
    productsWithLimit,
    purchaseLimitCoverage: activeProducts ? Number(((productsWithLimit / activeProducts) * 100).toFixed(1)) : 0,
    activeVariants,
    lowStockSellableVariants,
    engagement: {
      readinessChecks: readinessEvents.length,
      adjustmentCarts: readinessEvents.filter((event) => event.adjustmentRequired).length,
      lowStockCarts: readinessEvents.filter((event) => event.lowStock).length,
      atLimitCarts: readinessEvents.filter((event) => event.atLimit).length,
    },
    note: "Rolling 60-minute readiness counters are aggregate in-memory signals and contain no customer identity or cart contents.",
  };
}
