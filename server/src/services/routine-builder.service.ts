import { prisma } from "../config/prisma";

const ROUTINE_WINDOW_MS = 60 * 60 * 1000;
const MAX_EVENTS = 1500;
type RoutineEventType = "view" | "guided_pick" | "add";
type RoutineEvent = { at: number; type: RoutineEventType; selectedCount: number };
const events: RoutineEvent[] = [];

function trimEvents(now = Date.now()) {
  const cutoff = now - ROUTINE_WINDOW_MS;
  while (events.length && events[0].at < cutoff) events.shift();
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

export function recordRoutineBuilderEvent(input: { type: RoutineEventType; selectedCount?: number }) {
  events.push({ at: Date.now(), type: input.type, selectedCount: Math.max(0, Math.min(4, Number(input.selectedCount || 0))) });
  trimEvents();
}

export function routineBuilderEngagementSnapshot() {
  trimEvents();
  const views = events.filter((row) => row.type === "view").length;
  const guidedPicks = events.filter((row) => row.type === "guided_pick").length;
  const adds = events.filter((row) => row.type === "add").length;
  return {
    windowMinutes: 60,
    views,
    guidedPicks,
    routineAdds: adds,
    guidedPickRatePercent: views ? Number(((guidedPicks / views) * 100).toFixed(1)) : 0,
    addRatePercent: views ? Number(((adds / views) * 100).toFixed(1)) : 0,
    privacy: "Aggregated in-memory routine-builder counters only; no customer identity or cart contents are retained.",
  };
}

function plainText(value: unknown) {
  return String(value || "")
    .replace(/<\/(li|p|div|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(["and", "the", "with", "for", "from", "your", "this", "that", "care", "daily", "product", "skin", "hair"]);
function tokens(value: unknown) {
  return new Set(
    plainText(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3 && part.length <= 28 && !STOP.has(part)),
  );
}
function overlap(a: Set<string>, b: Set<string>) {
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
}
function mergeTokens(products: any[], field: "ingredients" | "suitableFor" | "benefits") {
  const out = new Set<string>();
  for (const product of products) for (const token of tokens(product?.[field])) out.add(token);
  return out;
}
function publicVariant(variant: any) {
  const availableQuantity = Math.max(0, Number(variant?.stockQuantity || 0) - Math.max(0, Number(variant?.safetyStock || 0)));
  return { ...variant, stockQuantity: availableQuantity, availableQuantity };
}
function productRating(product: any) {
  const rows = Array.isArray(product.reviews) ? product.reviews : [];
  return rows.length ? rows.reduce((sum: number, row: any) => sum + Number(row.rating || 0), 0) / rows.length : 0;
}
function availableVariant(product: any) {
  return (product.variants || []).find((variant: any) => Number(variant.stockQuantity || 0) > Number(variant.safetyStock || 0)) || null;
}
function publicProduct(product: any, reason?: string) {
  const reviews = Array.isArray(product.reviews) ? product.reviews : [];
  const { reviews: _reviews, ...rest } = product;
  return {
    ...rest,
    variants: (rest.variants || []).map(publicVariant),
    ratingAverage: Number(productRating(product).toFixed(1)),
    reviewCount: reviews.length,
    ...(reason ? { routineReason: reason } : {}),
  };
}

const include = {
  category: true,
  images: { orderBy: { sortOrder: "asc" as const } },
  variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" as const } },
  reviews: { where: { isApproved: true }, select: { rating: true } },
};

function recommendationReason(input: { suitability: number; benefits: number; ingredients: number; newCategory: boolean; sameCategory: boolean; categoryName?: string | null; featured: boolean }) {
  if (input.suitability >= 1) return "Complements your selected routine";
  if (input.benefits >= 2) return "Supports similar product goals";
  if (input.ingredients >= 2) return "Pairs with similar ingredients";
  if (input.newCategory) return "Adds variety to your routine";
  if (input.sameCategory) return input.categoryName ? `More from ${input.categoryName}` : "More from this category";
  if (input.featured) return "Popular Riseora pick";
  return "Suggested for your routine";
}

export async function getRoutineGuidance(input: { productIds?: string[]; seedSlug?: string; limit?: number }) {
  const limit = Math.max(4, Math.min(10, Number(input.limit || 8)));
  const ids = [...new Set((input.productIds || []).map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 4);
  let selected = ids.length ? await prisma.product.findMany({ where: { id: { in: ids }, isActive: true }, include }) : [];
  let seedProduct: any = null;
  const seedSlug = String(input.seedSlug || "").trim();
  if (seedSlug) {
    seedProduct = await prisma.product.findUnique({ where: { slug: seedSlug }, include });
    if (!seedProduct?.isActive) seedProduct = null;
    if (seedProduct && !selected.some((row: any) => row.id === seedProduct.id) && selected.length < 4) selected = [seedProduct, ...selected];
  }

  const selectedIds = selected.map((row: any) => row.id);
  const candidates = await prisma.product.findMany({
    where: { isActive: true, ...(selectedIds.length ? { id: { notIn: selectedIds } } : {}) },
    include,
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: 140,
  });

  const selectedSuitable = mergeTokens(selected, "suitableFor");
  const selectedBenefits = mergeTokens(selected, "benefits");
  const selectedIngredients = mergeTokens(selected, "ingredients");
  const selectedCategories = new Set(selected.map((row: any) => row.categoryId));
  const selectedPrices = selected.map(availableVariant).filter(Boolean).map((variant: any) => Number(variant.sellingPrice || 0)).filter((value: number) => value > 0);
  const referencePrice = selectedPrices.length ? selectedPrices.reduce((sum: number, value: number) => sum + value, 0) / selectedPrices.length : 0;

  const ranked = candidates
    .filter((product: any) => Boolean(availableVariant(product)))
    .map((product: any) => {
      const suitability = overlap(selectedSuitable, tokens(product.suitableFor));
      const benefits = overlap(selectedBenefits, tokens(product.benefits));
      const ingredients = overlap(selectedIngredients, tokens(product.ingredients));
      const sameCategory = selectedCategories.has(product.categoryId);
      const newCategory = selected.length > 0 && !sameCategory;
      const variant = availableVariant(product);
      const price = Number(variant?.sellingPrice || 0);
      const priceFit = referencePrice > 0 && price > 0 && price / referencePrice >= 0.5 && price / referencePrice <= 1.6;
      let score = 0;
      if (!selected.length) score += product.isFeatured ? 30 : 0;
      score += Math.min(45, suitability * 18);
      score += Math.min(24, benefits * 8);
      score += Math.min(18, ingredients * 6);
      if (newCategory && (suitability || benefits || ingredients)) score += 18;
      if (sameCategory) score += 8;
      if (priceFit) score += 7;
      if (product.isFeatured) score += 7;
      score += Math.min(10, productRating(product) * 2);
      return {
        product,
        score,
        reason: recommendationReason({ suitability, benefits, ingredients, newCategory, sameCategory, categoryName: product.category?.name, featured: Boolean(product.isFeatured) }),
      };
    })
    .sort((a: any, b: any) => b.score - a.score || String(a.product.name).localeCompare(String(b.product.name)));

  return {
    selected: selected.map((row: any) => publicProduct(row)),
    seedProduct: seedProduct ? publicProduct(seedProduct) : null,
    products: ranked.slice(0, limit).map((row: any) => publicProduct(row.product, row.reason)),
    strategy: selected.length ? "guided" : "catalog",
    note: "Routine guidance is catalogue relevance only and is not medical advice. Checkout remains the final authority for stock, price and promotions.",
  };
}

export async function previewRoutineSelections(selections: Array<{ variantId: string; quantity?: number }>) {
  const normalized = (Array.isArray(selections) ? selections : [])
    .map((row) => ({ variantId: String(row?.variantId || "").trim(), quantity: Math.max(1, Math.min(4, Number(row?.quantity || 1))) }))
    .filter((row) => row.variantId)
    .slice(0, 4);
  const ids = [...new Set(normalized.map((row) => row.variantId))];
  if (!ids.length) return { ready: false, lines: [], issues: [{ code: "EMPTY_ROUTINE", message: "Choose at least one product for your routine." }], merchandiseTotal: 0, mrpTotal: 0, catalogSavings: 0 };

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: ids } },
    include: { product: { include: { category: true, images: { orderBy: { sortOrder: "asc" } } } } },
  });
  const map = new Map(variants.map((variant: any) => [variant.id, variant]));
  const lines: any[] = [];
  const issues: Array<{ code: string; message: string; variantId?: string }> = [];
  let merchandiseTotal = 0;
  let mrpTotal = 0;

  for (const selection of normalized) {
    const variant: any = map.get(selection.variantId);
    if (!variant || !variant.isActive || !variant.product?.isActive) {
      issues.push({ code: "UNAVAILABLE", variantId: selection.variantId, message: "A selected routine item is no longer available." });
      continue;
    }
    const publicStock = Math.max(0, Number(variant.stockQuantity || 0) - Math.max(0, Number(variant.safetyStock || 0)));
    const productLimit = Number.isInteger(Number(variant.product.maxPurchaseQuantity)) && Number(variant.product.maxPurchaseQuantity) > 0 ? Number(variant.product.maxPurchaseQuantity) : null;
    const allowed = Math.max(0, Math.min(publicStock, productLimit ?? publicStock));
    if (allowed < selection.quantity) {
      issues.push({ code: "STOCK_CHANGED", variantId: variant.id, message: `${variant.product.name} is no longer available in the selected quantity.` });
      continue;
    }
    const publicV = publicVariant(variant);
    const product = { ...variant.product, variants: [publicV] };
    merchandiseTotal += Number(variant.sellingPrice || 0) * selection.quantity;
    mrpTotal += Number(variant.mrp || 0) * selection.quantity;
    lines.push({ product, variant: publicV, quantity: selection.quantity });
  }

  return {
    ready: issues.length === 0 && lines.length === normalized.length,
    lines,
    issues,
    merchandiseTotal: Number(merchandiseTotal.toFixed(2)),
    mrpTotal: Number(mrpTotal.toFixed(2)),
    catalogSavings: Number(Math.max(0, mrpTotal - merchandiseTotal).toFixed(2)),
    pricingNote: "Savings shown compare current MRP with current selling prices. Any additional deal or coupon is recalculated at checkout.",
  };
}
