import { prisma } from "../config/prisma";
import { availableToSell } from "./inventory.service";

export type AccountCartRequestLine = { variantId: string; quantity: number };
type StoredLine = AccountCartRequestLine;

type CartAdjustment = {
  variantId: string;
  type: "REMOVED_UNAVAILABLE" | "QUANTITY_ADJUSTED";
  requestedQuantity: number;
  acceptedQuantity: number;
};

function normalizeLines(value: unknown): StoredLine[] {
  const source = Array.isArray(value) ? value : [];
  const merged = new Map<string, number>();
  for (const row of source) {
    if (!row || typeof row !== "object") continue;
    const variantId = typeof (row as any).variantId === "string" ? (row as any).variantId : "";
    const quantity = Math.max(1, Math.min(99, Math.trunc(Number((row as any).quantity || 1))));
    if (!variantId) continue;
    merged.set(variantId, Math.max(merged.get(variantId) || 0, quantity));
  }
  return [...merged.entries()].slice(0, 50).map(([variantId, quantity]) => ({ variantId, quantity }));
}

function mergeRequestedLines(account: StoredLine[], browser: StoredLine[]) {
  const merged = new Map<string, number>();
  for (const row of [...normalizeLines(account), ...normalizeLines(browser)]) {
    merged.set(row.variantId, Math.max(merged.get(row.variantId) || 0, row.quantity));
  }
  return [...merged.entries()].slice(0, 50).map(([variantId, quantity]) => ({ variantId, quantity }));
}

async function hydrateLines(requestedValue: unknown) {
  const requested = normalizeLines(requestedValue);
  if (!requested.length) return { items: [] as any[], adjustments: [] as CartAdjustment[] };

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: requested.map((row) => row.variantId) }, isActive: true, product: { isActive: true } },
    include: { product: { include: { images: { orderBy: { sortOrder: "asc" } } } } },
  });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const productQuantity = new Map<string, number>();
  const items: any[] = [];
  const adjustments: CartAdjustment[] = [];

  for (const row of requested) {
    const variant = byId.get(row.variantId);
    if (!variant) {
      adjustments.push({ variantId: row.variantId, type: "REMOVED_UNAVAILABLE", requestedQuantity: row.quantity, acceptedQuantity: 0 });
      continue;
    }
    const available = availableToSell(variant); // availableToSell subtracts safetyStock before customer-visible availability.
    if (available <= 0) {
      adjustments.push({ variantId: row.variantId, type: "REMOVED_UNAVAILABLE", requestedQuantity: row.quantity, acceptedQuantity: 0 });
      continue;
    }
    const existingProductQuantity = productQuantity.get(variant.productId) || 0;
    const productLimit = Number.isInteger(variant.product.maxPurchaseQuantity) && Number(variant.product.maxPurchaseQuantity) > 0
      ? Number(variant.product.maxPurchaseQuantity)
      : null;
    const remainingByProduct = productLimit == null ? available : Math.max(0, productLimit - existingProductQuantity);
    const acceptedQuantity = Math.max(0, Math.min(row.quantity, available, remainingByProduct));
    if (acceptedQuantity <= 0) {
      adjustments.push({ variantId: row.variantId, type: "REMOVED_UNAVAILABLE", requestedQuantity: row.quantity, acceptedQuantity: 0 });
      continue;
    }
    if (acceptedQuantity !== row.quantity) {
      adjustments.push({ variantId: row.variantId, type: "QUANTITY_ADJUSTED", requestedQuantity: row.quantity, acceptedQuantity });
    }
    productQuantity.set(variant.productId, existingProductQuantity + acceptedQuantity);
    const primary = variant.product.images.find((image) => image.isPrimary) || variant.product.images[0];
    items.push({
      variantId: variant.id,
      productId: variant.product.id,
      productSlug: variant.product.slug,
      productName: variant.product.name,
      variantName: variant.name,
      sku: variant.sku,
      price: Number(variant.sellingPrice),
      mrp: Number(variant.mrp),
      stockQuantity: available,
      weightGrams: Math.max(0, Number(variant.weightGrams || 0)),
      maxPurchaseQuantity: productLimit,
      imageUrl: primary?.url || "",
      quantity: acceptedQuantity,
    });
  }
  return { items, adjustments };
}

function persistentLines(items: Array<{ variantId: string; quantity: number }>) {
  // Saved Bag persistence intentionally stores only product-option identity + requested quantity.
  // Price, stock, names and images are re-read from the live catalogue on every restore/sync.
  return items.map((item) => ({ variantId: item.variantId, quantity: item.quantity }));
}

export async function getAccountCart(userId: string) {
  const cart = await prisma.accountCart.findUnique({ where: { userId } });
  const hydrated = await hydrateLines(cart?.items || []);
  return {
    ...hydrated,
    revision: cart?.revision || 0,
    savedAt: cart?.updatedAt?.toISOString() || null,
    sourceLineCount: normalizeLines(cart?.items || []).length,
  };
}

export async function mergeAccountCart(userId: string, browserItems: AccountCartRequestLine[]) {
  const existing = await prisma.accountCart.findUnique({ where: { userId } });
  const accountLines = normalizeLines(existing?.items || []);
  const browserLines = normalizeLines(browserItems);
  const mergedRequested = mergeRequestedLines(accountLines, browserLines);
  const hydrated = await hydrateLines(mergedRequested);
  const stored = persistentLines(hydrated.items);
  const now = new Date();
  const cart = await prisma.accountCart.upsert({
    where: { userId },
    create: { userId, items: stored as any, revision: 1, lastMergedAt: now },
    update: { items: stored as any, revision: { increment: 1 }, lastMergedAt: now },
  });
  return {
    ...hydrated,
    revision: cart.revision,
    savedAt: cart.updatedAt.toISOString(),
    merge: { accountLineCount: accountLines.length, browserLineCount: browserLines.length, combinedLineCount: stored.length },
  };
}

export async function saveAccountCart(userId: string, requestedItems: AccountCartRequestLine[]) {
  const hydrated = await hydrateLines(requestedItems);
  const stored = persistentLines(hydrated.items);
  const cart = await prisma.accountCart.upsert({
    where: { userId },
    create: { userId, items: stored as any, revision: 1 },
    update: { items: stored as any, revision: { increment: 1 } },
  });
  return { ...hydrated, revision: cart.revision, savedAt: cart.updatedAt.toISOString() };
}

export async function accountCartHealth() {
  const now = Date.now();
  const day = new Date(now - 24 * 60 * 60 * 1000);
  const week = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const month = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const [savedBags, updated24h, active7d, stale30d] = await Promise.all([
    prisma.accountCart.count(),
    prisma.accountCart.count({ where: { updatedAt: { gte: day } } }),
    prisma.accountCart.count({ where: { updatedAt: { gte: week } } }),
    prisma.accountCart.count({ where: { updatedAt: { lt: month } } }),
  ]);
  return { savedBags, updated24h, active7d, stale30d, checkedAt: new Date().toISOString() };
}
