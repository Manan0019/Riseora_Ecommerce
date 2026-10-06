import { prisma } from "../config/prisma";
import { availableToSell } from "./inventory.service";

export type AccountCartRequestLine = { variantId: string; quantity: number };
type StoredLine = AccountCartRequestLine & { intent?: "LATER" };
type BagState = { items: AccountCartRequestLine[]; savedForLater: AccountCartRequestLine[] };

type CartAdjustment = {
  variantId: string;
  location: "ACTIVE" | "LATER";
  type: "REMOVED_UNAVAILABLE" | "QUANTITY_ADJUSTED";
  requestedQuantity: number;
  acceptedQuantity: number;
};

type ConflictEventType = "CONFLICT" | "ACCOUNT_ACCEPTED" | "BROWSER_KEPT";
type ConflictEvent = { type: ConflictEventType; at: number };
const conflictEvents: ConflictEvent[] = [];
const CONFLICT_WINDOW_MS = 60 * 60 * 1000;

type IntentEventType = "SAVE_FOR_LATER" | "RESTORE_TO_BAG";
type IntentEvent = { type: IntentEventType; at: number };
const intentEvents: IntentEvent[] = [];
const INTENT_WINDOW_MS = 60 * 60 * 1000;

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

function recordIntentEvent(type: IntentEventType) {
  intentEvents.push({ type, at: Date.now() });
  const cutoff = Date.now() - INTENT_WINDOW_MS;
  while (intentEvents.length && intentEvents[0].at < cutoff) intentEvents.shift();
}

function intentSnapshot() {
  const cutoff = Date.now() - INTENT_WINDOW_MS;
  const recent = intentEvents.filter((event) => event.at >= cutoff);
  return {
    saveForLater60m: recent.filter((event) => event.type === "SAVE_FOR_LATER").length,
    restoredToBag60m: recent.filter((event) => event.type === "RESTORE_TO_BAG").length,
  };
}

function normalizeLines(value: unknown): AccountCartRequestLine[] {
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

function normalizeStoredState(value: unknown): BagState {
  const source = Array.isArray(value) ? value : [];
  const active = new Map<string, number>();
  const later = new Map<string, number>();
  for (const row of source) {
    if (!row || typeof row !== "object") continue;
    const variantId = typeof (row as any).variantId === "string" ? (row as any).variantId : "";
    const quantity = Math.max(1, Math.min(99, Math.trunc(Number((row as any).quantity || 1))));
    if (!variantId) continue;
    const intent = (row as any).intent === "LATER" ? "LATER" : "ACTIVE";
    const target = intent === "LATER" ? later : active;
    target.set(variantId, Math.max(target.get(variantId) || 0, quantity));
  }
  // A variant can only be in one customer-intent bucket. Active bag wins for legacy/mixed payloads.
  for (const variantId of active.keys()) later.delete(variantId);
  return {
    items: [...active.entries()].slice(0, 50).map(([variantId, quantity]) => ({ variantId, quantity })),
    savedForLater: [...later.entries()].slice(0, 50).map(([variantId, quantity]) => ({ variantId, quantity })),
  };
}

function normalizeBagRequest(items: unknown, savedForLater: unknown): BagState {
  const active = normalizeLines(items);
  const activeIds = new Set(active.map((row) => row.variantId));
  const later = normalizeLines(savedForLater).filter((row) => !activeIds.has(row.variantId));
  return { items: active, savedForLater: later };
}

function mergeBagStates(account: BagState, browser: BagState): BagState {
  const active = new Map<string, number>();
  const later = new Map<string, number>();
  for (const row of [...normalizeLines(account.items), ...normalizeLines(browser.items)]) {
    active.set(row.variantId, Math.max(active.get(row.variantId) || 0, row.quantity));
  }
  for (const row of [...normalizeLines(account.savedForLater), ...normalizeLines(browser.savedForLater)]) {
    if (active.has(row.variantId)) continue;
    later.set(row.variantId, Math.max(later.get(row.variantId) || 0, row.quantity));
  }
  return {
    items: [...active.entries()].slice(0, 50).map(([variantId, quantity]) => ({ variantId, quantity })),
    savedForLater: [...later.entries()].slice(0, 50).map(([variantId, quantity]) => ({ variantId, quantity })),
  };
}

async function hydrateLines(requestedValue: unknown, location: "ACTIVE" | "LATER") {
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
      adjustments.push({ variantId: row.variantId, location, type: "REMOVED_UNAVAILABLE", requestedQuantity: row.quantity, acceptedQuantity: 0 });
      continue;
    }
    const available = availableToSell(variant); // availableToSell subtracts safetyStock before customer-visible availability.
    if (location === "ACTIVE" && available <= 0) {
      adjustments.push({ variantId: row.variantId, location, type: "REMOVED_UNAVAILABLE", requestedQuantity: row.quantity, acceptedQuantity: 0 });
      continue;
    }
    const existingProductQuantity = productQuantity.get(variant.productId) || 0;
    const productLimit = Number.isInteger(variant.product.maxPurchaseQuantity) && Number(variant.product.maxPurchaseQuantity) > 0
      ? Number(variant.product.maxPurchaseQuantity)
      : null;
    const availabilityCeiling = location === "ACTIVE" ? available : 99;
    const remainingByProduct = productLimit == null ? availabilityCeiling : Math.max(0, productLimit - existingProductQuantity);
    const acceptedQuantity = Math.max(0, Math.min(row.quantity, availabilityCeiling, remainingByProduct));
    if (acceptedQuantity <= 0) {
      adjustments.push({ variantId: row.variantId, location, type: "REMOVED_UNAVAILABLE", requestedQuantity: row.quantity, acceptedQuantity: 0 });
      continue;
    }
    if (acceptedQuantity !== row.quantity) {
      adjustments.push({ variantId: row.variantId, location, type: "QUANTITY_ADJUSTED", requestedQuantity: row.quantity, acceptedQuantity });
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

async function hydrateBag(state: BagState) {
  const [active, later] = await Promise.all([
    hydrateLines(state.items, "ACTIVE"),
    hydrateLines(state.savedForLater, "LATER"),
  ]);
  return {
    items: active.items,
    savedForLater: later.items,
    adjustments: [...active.adjustments, ...later.adjustments],
  };
}

function persistentLines(items: Array<{ variantId: string; quantity: number }>, savedForLater: Array<{ variantId: string; quantity: number }>): StoredLine[] {
  // Saved Bag persistence intentionally stores only product-option identity + requested quantity + customer intent bucket.
  // Price, stock, names and images are re-read from the live catalogue on every restore/sync.
  const active = normalizeLines(items).map((item) => ({ variantId: item.variantId, quantity: item.quantity }));
  const activeIds = new Set(active.map((item) => item.variantId));
  const later = normalizeLines(savedForLater)
    .filter((item) => !activeIds.has(item.variantId))
    .map((item) => ({ variantId: item.variantId, quantity: item.quantity, intent: "LATER" as const }));
  return [...active, ...later].slice(0, 100);
}

function recordIntentTransitions(before: BagState, after: BagState) {
  const beforeActive = new Set(before.items.map((row) => row.variantId));
  const beforeLater = new Set(before.savedForLater.map((row) => row.variantId));
  const afterActive = new Set(after.items.map((row) => row.variantId));
  const afterLater = new Set(after.savedForLater.map((row) => row.variantId));
  for (const id of beforeActive) if (afterLater.has(id)) recordIntentEvent("SAVE_FOR_LATER");
  for (const id of beforeLater) if (afterActive.has(id)) recordIntentEvent("RESTORE_TO_BAG");
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
  const stored = normalizeStoredState(cart?.items || []);
  const hydrated = await hydrateBag(stored);
  return {
    ...hydrated,
    revision: cart?.revision || 0,
    savedAt: cart?.updatedAt?.toISOString() || null,
    sourceLineCount: stored.items.length + stored.savedForLater.length,
  };
}

async function throwRevisionConflict(userId: string): Promise<never> {
  const current = await getAccountCart(userId);
  recordConflictEvent("CONFLICT");
  throw new AccountCartRevisionConflictError(current);
}

export async function mergeAccountCart(userId: string, browserItems: AccountCartRequestLine[], browserSavedForLater: AccountCartRequestLine[] = []) {
  const existing = await prisma.accountCart.findUnique({ where: { userId } });
  const accountState = normalizeStoredState(existing?.items || []);
  const browserState = normalizeBagRequest(browserItems, browserSavedForLater);
  const mergedRequested = mergeBagStates(accountState, browserState);
  const hydrated = await hydrateBag(mergedRequested);
  const stored = persistentLines(hydrated.items, hydrated.savedForLater);
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
    merge: {
      accountLineCount: accountState.items.length + accountState.savedForLater.length,
      browserLineCount: browserState.items.length + browserState.savedForLater.length,
      combinedLineCount: stored.length,
    },
  };
}

export async function saveAccountCart(
  userId: string,
  requestedItems: AccountCartRequestLine[],
  expectedRevision?: number | null,
  requestedSavedForLater?: AccountCartRequestLine[],
) {
  const existing = await prisma.accountCart.findUnique({ where: { userId }, select: { revision: true, items: true } });
  const currentRevision = existing?.revision || 0;
  if (expectedRevision != null && currentRevision !== expectedRevision) await throwRevisionConflict(userId);

  const beforeState = normalizeStoredState(existing?.items || []);
  // Backward compatibility: an older client that does not send savedForLater preserves the account's existing Later bucket.
  const requestedState = normalizeBagRequest(
    requestedItems,
    requestedSavedForLater === undefined ? beforeState.savedForLater : requestedSavedForLater,
  );
  const hydrated = await hydrateBag(requestedState);
  const afterState = normalizeBagRequest(hydrated.items, hydrated.savedForLater);
  const stored = persistentLines(hydrated.items, hydrated.savedForLater);

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

  recordIntentTransitions(beforeState, afterState);
  const cart = await prisma.accountCart.findUniqueOrThrow({ where: { userId }, select: { revision: true, updatedAt: true } });
  return { ...hydrated, revision: cart.revision, savedAt: cart.updatedAt.toISOString() };
}

export async function resolveAccountCart(
  userId: string,
  strategy: "ACCOUNT" | "BROWSER",
  browserItems: AccountCartRequestLine[],
  browserSavedForLater: AccountCartRequestLine[],
  expectedRevision: number,
) {
  if (strategy === "ACCOUNT") {
    const current = await getAccountCart(userId);
    recordConflictEvent("ACCOUNT_ACCEPTED");
    return { ...current, resolution: "ACCOUNT" as const };
  }
  const saved = await saveAccountCart(userId, browserItems, expectedRevision, browserSavedForLater);
  recordConflictEvent("BROWSER_KEPT");
  return { ...saved, resolution: "BROWSER" as const };
}

export async function accountCartHealth() {
  const now = Date.now();
  const day = new Date(now - 24 * 60 * 60 * 1000);
  const week = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const month = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const [savedBags, updated24h, active7d, stale30d, rawBags] = await Promise.all([
    prisma.accountCart.count(),
    prisma.accountCart.count({ where: { updatedAt: { gte: day } } }),
    prisma.accountCart.count({ where: { updatedAt: { gte: week } } }),
    prisma.accountCart.count({ where: { updatedAt: { lt: month } } }),
    prisma.accountCart.findMany({ select: { items: true } }),
  ]);
  const savedForLaterItems = rawBags.reduce((sum, bag) => sum + normalizeStoredState(bag.items).savedForLater.length, 0);
  return {
    savedBags,
    savedForLaterItems,
    updated24h,
    active7d,
    stale30d,
    ...conflictSnapshot(),
    ...intentSnapshot(),
    checkedAt: new Date().toISOString(),
  };
}
