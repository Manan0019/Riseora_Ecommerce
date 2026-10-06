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

type ConflictEventType = "CONFLICT" | "ACCOUNT_ACCEPTED" | "BROWSER_KEPT";
type ConflictEvent = { type: ConflictEventType; at: number };
const conflictEvents: ConflictEvent[] = [];
const CONFLICT_WINDOW_MS = 60 * 60 * 1000;

function recordConflictEvent(type: ConflictEventType) {
  conflictEvents.push({ type, at: Date.now() });
  const cutoff = Date.now() - CONFLICT_WINDOW_MS;
  while (conflictEvents.length && conflictEvents[0].at < cutoff) conflictEvents.shift();
}

function conflictSnapshot() {
  const cutoff = Date.now() - CONFLICT_WINDOW_MS;
  const recent = conflictEvents.filter((event) => event.at >= cutoff);
  return {
    conflicts60m: recent.filter((event) => event.type === "CONFLICT").length,
    accountAccepted60m: recent.filter((event) => event.type === "ACCOUNT_ACCEPTED").length,
    browserKept60m: recent.filter((event) => event.type === "BROWSER_KEPT").length,
  };
}

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

export class AccountCartRevisionConflictError extends Error {
  code = "ACCOUNT_CART_REVISION_CONFLICT";
  current: any;
  constructor(current: any) {
    super("Your Saved Bag changed on another device. Choose which version you want to keep.");
    this.name = "AccountCartRevisionConflictError";
    this.current = current;
  }
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

async function throwRevisionConflict(userId: string): Promise<never> {
  const current = await getAccountCart(userId);
  recordConflictEvent("CONFLICT");
  throw new AccountCartRevisionConflictError(current);
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

export async function saveAccountCart(userId: string, requestedItems: AccountCartRequestLine[], expectedRevision?: number | null) {
  const hydrated = await hydrateLines(requestedItems);
  const stored = persistentLines(hydrated.items);
  const existing = await prisma.accountCart.findUnique({ where: { userId }, select: { revision: true } });
  const currentRevision = existing?.revision || 0;

  if (expectedRevision != null && currentRevision !== expectedRevision) await throwRevisionConflict(userId);

  if (!existing) {
    try {
      const cart = await prisma.accountCart.create({ data: { userId, items: stored as any, revision: 1 } });
      return { ...hydrated, revision: cart.revision, savedAt: cart.updatedAt.toISOString() };
    } catch {
      await throwRevisionConflict(userId);
    }
  }

  if (expectedRevision != null) {
    const updated = await prisma.accountCart.updateMany({
      where: { userId, revision: expectedRevision },
      data: { items: stored as any, revision: { increment: 1 } },
    });
    if (updated.count !== 1) await throwRevisionConflict(userId);
  } else {
    await prisma.accountCart.update({ where: { userId }, data: { items: stored as any, revision: { increment: 1 } } });
  }

  const cart = await prisma.accountCart.findUniqueOrThrow({ where: { userId }, select: { revision: true, updatedAt: true } });
  return { ...hydrated, revision: cart.revision, savedAt: cart.updatedAt.toISOString() };
}

export async function resolveAccountCart(
  userId: string,
  strategy: "ACCOUNT" | "BROWSER",
  browserItems: AccountCartRequestLine[],
  expectedRevision: number,
) {
  if (strategy === "ACCOUNT") {
    const current = await getAccountCart(userId);
    recordConflictEvent("ACCOUNT_ACCEPTED");
    return { ...current, resolution: "ACCOUNT" as const };
  }
  const saved = await saveAccountCart(userId, browserItems, expectedRevision);
  recordConflictEvent("BROWSER_KEPT");
  return { ...saved, resolution: "BROWSER" as const };
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
  return { savedBags, updated24h, active7d, stale30d, ...conflictSnapshot(), checkedAt: new Date().toISOString() };
}
