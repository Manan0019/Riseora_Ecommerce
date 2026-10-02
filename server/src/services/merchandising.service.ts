import { prisma } from "../config/prisma";

export type CartQuantityInput = { variantId: string; quantity: number };

type BundleRule = { variantId: string; quantity: number };

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function bundleRules(value: unknown): BundleRule[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: BundleRule[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const variantId = String((row as any).variantId || "");
    const quantity = Number((row as any).quantity || 0);
    if (!variantId || !Number.isInteger(quantity) || quantity < 1 || seen.has(variantId)) continue;
    seen.add(variantId);
    result.push({ variantId, quantity });
  }
  return result;
}

function activeDealWhere(now: Date) {
  return {
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
}

export async function getActiveDeals() {
  const now = new Date();
  const deals = await prisma.merchandisingDeal.findMany({
    where: activeDealWhere(now),
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  return enrichDeals(deals);
}

export async function enrichDeals<T extends { bundleItems: unknown; buyVariantId: string | null; giftVariantId: string | null }>(deals: T[]) {
  const ids = new Set<string>();
  for (const deal of deals) {
    if (deal.buyVariantId) ids.add(deal.buyVariantId);
    if (deal.giftVariantId) ids.add(deal.giftVariantId);
    for (const item of bundleRules(deal.bundleItems)) ids.add(item.variantId);
  }
  const variants = ids.size
    ? await prisma.productVariant.findMany({
        where: { id: { in: [...ids] } },
        include: { product: { include: { images: { orderBy: { sortOrder: "asc" } } } } },
      })
    : [];
  const map = new Map(variants.map((variant) => [variant.id, variant]));
  return deals.map((deal) => ({
    ...deal,
    resolvedItems: bundleRules(deal.bundleItems)
      .map((item) => ({ ...item, variant: map.get(item.variantId) || null }))
      .filter((item) => item.variant),
    buyVariant: deal.buyVariantId ? map.get(deal.buyVariantId) || null : null,
    giftVariant: deal.giftVariantId ? map.get(deal.giftVariantId) || null : null,
  }));
}

export async function evaluateBestMerchandisingDeal(cart: CartQuantityInput[], paidSubtotal: number) {
  if (!cart.length) return { deal: null, automaticDiscountAmount: 0, promotionValue: 0, freeItems: [] as any[] };
  const deals = await getActiveDeals();
  if (!deals.length) return { deal: null, automaticDiscountAmount: 0, promotionValue: 0, freeItems: [] as any[] };

  const cartQty = new Map<string, number>();
  for (const item of cart) cartQty.set(item.variantId, (cartQty.get(item.variantId) || 0) + item.quantity);

  const candidates: Array<{ deal: any; automaticDiscountAmount: number; promotionValue: number; freeItems: any[] }> = [];

  for (const deal of deals as any[]) {
    if (deal.type === "BUNDLE_DISCOUNT") {
      const rules = (deal.resolvedItems || []).map((item: any) => ({ variantId: item.variantId, quantity: item.quantity, variant: item.variant }));
      if (rules.length < 2 || !deal.discountPercent) continue;
      const sets = Math.min(...rules.map((rule: any) => Math.floor((cartQty.get(rule.variantId) || 0) / rule.quantity)));
      if (!Number.isFinite(sets) || sets < 1) continue;
      const regularValue = rules.reduce((sum: number, rule: any) => sum + Number(rule.variant.sellingPrice) * rule.quantity * sets, 0);
      const discount = round2(regularValue * (Number(deal.discountPercent) / 100));
      if (discount <= 0) continue;
      candidates.push({ deal, automaticDiscountAmount: discount, promotionValue: discount, freeItems: [] });
      continue;
    }

    if (deal.type === "BUY_X_GET_Y") {
      if (!deal.buyVariant || !deal.giftVariant) continue;
      const buyQty = Math.max(1, Number(deal.buyQuantity || 1));
      const giftQty = Math.max(1, Number(deal.giftQuantity || 1));
      const groups = Math.floor((cartQty.get(deal.buyVariant.id) || 0) / buyQty);
      const freeQuantity = groups * giftQty;
      if (freeQuantity < 1) continue;
      const stockNeeded = (cartQty.get(deal.giftVariant.id) || 0) + freeQuantity;
      if (!deal.giftVariant.isActive || !deal.giftVariant.product?.isActive || Number(deal.giftVariant.stockQuantity || 0) < stockNeeded) continue;
      const value = round2(Number(deal.giftVariant.sellingPrice) * freeQuantity);
      candidates.push({
        deal,
        automaticDiscountAmount: 0,
        promotionValue: value,
        freeItems: [{ variant: deal.giftVariant, quantity: freeQuantity, promotionLabel: deal.name }],
      });
      continue;
    }

    if (deal.type === "GIFT_WITH_PURCHASE") {
      if (!deal.giftVariant) continue;
      const threshold = Number(deal.minOrderAmount || 0);
      const freeQuantity = Math.max(1, Number(deal.giftQuantity || 1));
      if (paidSubtotal + 0.009 < threshold) continue;
      const stockNeeded = (cartQty.get(deal.giftVariant.id) || 0) + freeQuantity;
      if (!deal.giftVariant.isActive || !deal.giftVariant.product?.isActive || Number(deal.giftVariant.stockQuantity || 0) < stockNeeded) continue;
      const value = round2(Number(deal.giftVariant.sellingPrice) * freeQuantity);
      candidates.push({
        deal,
        automaticDiscountAmount: 0,
        promotionValue: value,
        freeItems: [{ variant: deal.giftVariant, quantity: freeQuantity, promotionLabel: deal.name }],
      });
    }
  }

  candidates.sort((a, b) => b.promotionValue - a.promotionValue || Number(b.deal.priority || 0) - Number(a.deal.priority || 0));
  return candidates[0] || { deal: null, automaticDiscountAmount: 0, promotionValue: 0, freeItems: [] as any[] };
}
