import { prisma } from "../config/prisma";

const RECOMMENDATION_WINDOW_MS = 60 * 60 * 1000;
const MAX_EVENTS = 2000;

type RecommendationEventType = "impression" | "click" | "add";
type RecommendationEvent = {
  at: number;
  type: RecommendationEventType;
  shelf: string;
  sourceProductId: string;
  targetProductId?: string;
};

const recommendationEvents: RecommendationEvent[] = [];

function trimEvents(now = Date.now()) {
  const cutoff = now - RECOMMENDATION_WINDOW_MS;
  while (recommendationEvents.length && recommendationEvents[0].at < cutoff) recommendationEvents.shift();
  if (recommendationEvents.length > MAX_EVENTS) recommendationEvents.splice(0, recommendationEvents.length - MAX_EVENTS);
}

export function recordRecommendationEvent(input: Omit<RecommendationEvent, "at">) {
  const shelf = String(input.shelf || "product-detail").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "product-detail";
  recommendationEvents.push({ ...input, shelf, at: Date.now() });
  trimEvents();
}

export function recommendationEngagementSnapshot() {
  trimEvents();
  const impressions = recommendationEvents.filter((event) => event.type === "impression");
  const clicks = recommendationEvents.filter((event) => event.type === "click");
  const adds = recommendationEvents.filter((event) => event.type === "add");
  const shelfMap = new Map<string, { shelf: string; impressions: number; clicks: number; adds: number }>();
  for (const event of recommendationEvents) {
    const row = shelfMap.get(event.shelf) || { shelf: event.shelf, impressions: 0, clicks: 0, adds: 0 };
    if (event.type === "impression") row.impressions += 1;
    if (event.type === "click") row.clicks += 1;
    if (event.type === "add") row.adds += 1;
    shelfMap.set(event.shelf, row);
  }
  const shelves = [...shelfMap.values()].map((row) => ({
    ...row,
    clickThroughRatePercent: row.impressions ? Number(((row.clicks / row.impressions) * 100).toFixed(1)) : 0,
    addToCartRatePercent: row.impressions ? Number(((row.adds / row.impressions) * 100).toFixed(1)) : 0,
  })).sort((a, b) => b.impressions - a.impressions || b.adds - a.adds || b.clicks - a.clicks);
  return {
    windowMinutes: Math.round(RECOMMENDATION_WINDOW_MS / 60000),
    impressions: impressions.length,
    clicks: clicks.length,
    adds: adds.length,
    clickThroughRatePercent: impressions.length ? Number(((clicks.length / impressions.length) * 100).toFixed(1)) : 0,
    addToCartRatePercent: impressions.length ? Number(((adds.length / impressions.length) * 100).toFixed(1)) : 0,
    shelves,
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

const STOP_WORDS = new Set(["and", "the", "with", "for", "from", "your", "this", "that", "care", "daily", "product", "skin", "hair"]);

function tokens(value: unknown) {
  return new Set(
    plainText(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3 && word.length <= 28 && !STOP_WORDS.has(word)),
  );
}

function overlap(a: Set<string>, b: Set<string>) {
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
}

function availablePrice(product: any) {
  const variant = (product.variants || []).find((row: any) => Number(row.stockQuantity || 0) > Number(row.safetyStock || 0)) || product.variants?.[0];
  return Number(variant?.sellingPrice || 0);
}

function rating(product: any) {
  const ratings = Array.isArray(product.reviews) ? product.reviews.map((review: any) => Number(review.rating || 0)).filter(Boolean) : [];
  return ratings.length ? ratings.reduce((sum: number, value: number) => sum + value, 0) / ratings.length : 0;
}

function publicVariant<T extends { stockQuantity?: number | null; safetyStock?: number | null }>(variant: T) {
  const availableQuantity = Math.max(0, Number(variant.stockQuantity || 0) - Math.max(0, Number(variant.safetyStock || 0)));
  return { ...variant, stockQuantity: availableQuantity, availableQuantity };
}

function recommendationReason({ sameCategory, ingredientOverlap, suitabilityOverlap, priceNear, featured }: {
  sameCategory: boolean;
  ingredientOverlap: number;
  suitabilityOverlap: number;
  priceNear: boolean;
  featured: boolean;
}) {
  if (ingredientOverlap >= 2) return "Similar ingredients";
  if (suitabilityOverlap >= 1) return "Suited to a similar routine";
  if (sameCategory) return "More from this category";
  if (priceNear) return "Similar price range";
  if (featured) return "Popular Riseora pick";
  return "You may also like";
}

export async function smartProductRecommendations(slug: string, requestedLimit = 8) {
  const limit = Math.max(4, Math.min(10, Number(requestedLimit || 8)));
  const include = {
    category: true,
    images: { orderBy: { sortOrder: "asc" as const } },
    variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" as const } },
    reviews: { where: { isApproved: true }, select: { rating: true } },
  };

  const current = await prisma.product.findUnique({ where: { slug }, include });
  if (!current?.isActive) return null;

  const candidates = await prisma.product.findMany({
    where: { isActive: true, id: { not: current.id } },
    include,
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: 120,
  });

  const currentIngredients = tokens(current.ingredients);
  const currentSuitable = tokens(current.suitableFor);
  const currentBenefits = tokens(current.benefits);
  const currentPrice = availablePrice(current);

  const scored = candidates.map((product: any) => {
    const sameCategory = product.categoryId === current.categoryId;
    const ingredientOverlap = overlap(currentIngredients, tokens(product.ingredients));
    const suitabilityOverlap = overlap(currentSuitable, tokens(product.suitableFor));
    const benefitOverlap = overlap(currentBenefits, tokens(product.benefits));
    const candidatePrice = availablePrice(product);
    const ratio = currentPrice > 0 && candidatePrice > 0 ? candidatePrice / currentPrice : 0;
    const priceNear = ratio >= 0.7 && ratio <= 1.35;
    const priceBroadlyNear = ratio >= 0.5 && ratio <= 1.65;
    const inStock = (product.variants || []).some((variant: any) => Number(variant.stockQuantity || 0) > Number(variant.safetyStock || 0));
    const averageRating = rating(product);

    let score = 0;
    if (sameCategory) score += 42;
    score += Math.min(30, ingredientOverlap * 10);
    score += Math.min(24, suitabilityOverlap * 12);
    score += Math.min(12, benefitOverlap * 4);
    if (priceNear) score += 14;
    else if (priceBroadlyNear) score += 7;
    if (product.isFeatured) score += 7;
    if (inStock) score += 6;
    score += Math.min(8, averageRating * 1.6);

    return {
      product,
      score,
      reason: recommendationReason({ sameCategory, ingredientOverlap, suitabilityOverlap, priceNear, featured: Boolean(product.isFeatured) }),
    };
  });

  scored.sort((a, b) => b.score - a.score || Number(Boolean(b.product.isFeatured)) - Number(Boolean(a.product.isFeatured)) || String(a.product.name).localeCompare(String(b.product.name)));

  const selected = scored.slice(0, limit).map(({ product, reason }) => {
    const ratings = product.reviews || [];
    const ratingAverage = ratings.length ? ratings.reduce((sum: number, review: any) => sum + Number(review.rating || 0), 0) / ratings.length : 0;
    const { reviews: _reviews, ...rest } = product;
    return {
      ...rest,
      variants: (rest.variants || []).map(publicVariant),
      ratingAverage: Number(ratingAverage.toFixed(1)),
      reviewCount: ratings.length,
      recommendationReason: reason,
    };
  });

  return {
    sourceProductId: current.id,
    sourceCategory: current.category?.name || null,
    products: selected,
    strategy: selected.some((product: any) => product.recommendationReason !== "Popular Riseora pick" && product.recommendationReason !== "You may also like") ? "relevance" : "catalog",
  };
}

function mergeTokens(products: any[], field: "ingredients" | "suitableFor" | "benefits") {
  const merged = new Set<string>();
  for (const product of products) for (const token of tokens(product?.[field])) merged.add(token);
  return merged;
}

function cartRecommendationReason({ coPurchaseCount, suitabilityOverlap, ingredientOverlap, sameCategory, categoryName, affordable, featured }: {
  coPurchaseCount: number;
  suitabilityOverlap: number;
  ingredientOverlap: number;
  sameCategory: boolean;
  categoryName?: string | null;
  affordable: boolean;
  featured: boolean;
}) {
  if (coPurchaseCount >= 2) return "Frequently paired with your bag";
  if (suitabilityOverlap >= 1) return "Complements your routine";
  if (ingredientOverlap >= 2) return "Pairs with similar ingredients";
  if (sameCategory) return categoryName ? `More from ${categoryName}` : "More from this category";
  if (affordable) return "Easy routine add-on";
  if (featured) return "Popular Riseora pick";
  return "Complete your routine";
}

export async function smartCartRecommendations(productIds: string[], requestedLimit = 6) {
  const sourceIds = [...new Set((Array.isArray(productIds) ? productIds : []).map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 20);
  const limit = Math.max(3, Math.min(8, Number(requestedLimit || 6)));
  if (!sourceIds.length) return { sourceProductIds: [], products: [], strategy: "empty", explanation: "Add products to your bag to unlock suggestions." };

  const include = {
    category: true,
    images: { orderBy: { sortOrder: "asc" as const } },
    variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" as const } },
    reviews: { where: { isApproved: true }, select: { rating: true } },
  };

  const [sources, recentOrders, candidates] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: sourceIds }, isActive: true }, include }),
    prisma.order.findMany({
      where: { status: "DELIVERED", items: { some: { variant: { productId: { in: sourceIds } } } } },
      select: { items: { select: { variant: { select: { productId: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 220,
    }),
    prisma.product.findMany({
      where: { isActive: true, id: { notIn: sourceIds } },
      include,
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      take: 160,
    }),
  ]);

  if (!sources.length) return { sourceProductIds: sourceIds, products: [], strategy: "empty", explanation: "Your bag products are no longer available." };

  const coPurchaseCounts = new Map<string, number>();
  for (const order of recentOrders) {
    const orderProductIds = new Set((order.items || []).map((item: any) => item.variant?.productId).filter(Boolean));
    if (![...orderProductIds].some((id) => sourceIds.includes(id))) continue;
    for (const productId of orderProductIds) {
      if (sourceIds.includes(productId)) continue;
      coPurchaseCounts.set(productId, (coPurchaseCounts.get(productId) || 0) + 1);
    }
  }

  const sourceCategories = new Set(sources.map((product: any) => product.categoryId).filter(Boolean));
  const sourceIngredients = mergeTokens(sources, "ingredients");
  const sourceSuitable = mergeTokens(sources, "suitableFor");
  const sourceBenefits = mergeTokens(sources, "benefits");
  const sourcePrices = sources.map(availablePrice).filter((value) => value > 0);
  const averageSourcePrice = sourcePrices.length ? sourcePrices.reduce((sum, value) => sum + value, 0) / sourcePrices.length : 0;

  const scored = candidates.map((product: any) => {
    const inStock = (product.variants || []).some((variant: any) => Number(variant.stockQuantity || 0) > Number(variant.safetyStock || 0));
    const coPurchaseCount = coPurchaseCounts.get(product.id) || 0;
    const sameCategory = sourceCategories.has(product.categoryId);
    const ingredientOverlap = overlap(sourceIngredients, tokens(product.ingredients));
    const suitabilityOverlap = overlap(sourceSuitable, tokens(product.suitableFor));
    const benefitOverlap = overlap(sourceBenefits, tokens(product.benefits));
    const candidatePrice = availablePrice(product);
    const affordable = averageSourcePrice > 0 && candidatePrice > 0 && candidatePrice <= Math.max(499, averageSourcePrice * 1.15);
    const averageRating = rating(product);

    let score = 0;
    score += Math.min(72, coPurchaseCount * 18);
    if (sameCategory) score += 18;
    score += Math.min(24, ingredientOverlap * 8);
    score += Math.min(30, suitabilityOverlap * 10);
    score += Math.min(12, benefitOverlap * 4);
    if (affordable) score += 8;
    if (product.isFeatured) score += 7;
    if (inStock) score += 10;
    else score -= 100;
    score += Math.min(8, averageRating * 1.6);

    return {
      product, score, coPurchaseCount,
      reason: cartRecommendationReason({
        coPurchaseCount, suitabilityOverlap, ingredientOverlap, sameCategory,
        categoryName: product.category?.name, affordable, featured: Boolean(product.isFeatured),
      }),
    };
  }).filter((row) => row.score > 0);

  scored.sort((a, b) => b.score - a.score || b.coPurchaseCount - a.coPurchaseCount || String(a.product.name).localeCompare(String(b.product.name)));
  const selected = scored.slice(0, limit).map(({ product, reason, coPurchaseCount }) => {
    const ratings = product.reviews || [];
    const ratingAverage = ratings.length ? ratings.reduce((sum: number, review: any) => sum + Number(review.rating || 0), 0) / ratings.length : 0;
    const { reviews: _reviews, ...rest } = product;
    return {
      ...rest,
      variants: (rest.variants || []).map(publicVariant),
      ratingAverage: Number(ratingAverage.toFixed(1)),
      reviewCount: ratings.length,
      recommendationReason: reason,
      recommendationSignal: coPurchaseCount > 0 ? "order-history" : "catalog-fit",
    };
  });

  const usesOrderHistory = selected.some((product: any) => product.recommendationSignal === "order-history");
  return {
    sourceProductIds: sources.map((product: any) => product.id),
    products: selected,
    strategy: usesOrderHistory ? "orders+relevance" : "relevance",
    explanation: usesOrderHistory
      ? "Chosen from real purchase patterns plus routine fit."
      : "Chosen from category, ingredient and routine fit.",
  };
}

