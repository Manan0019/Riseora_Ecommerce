import { prisma } from "../config/prisma";

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/<\/(li|p|div|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function listTokens(value: unknown, maxLength = 80) {
  return [...new Set(cleanText(value)
    .split(/[\n,;|•]+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 2 && item.length <= maxLength))];
}

function addTokens(target: Map<string, { name: string; count: number }>, value: unknown, maxLength = 80) {
  for (const name of listTokens(value, maxLength)) {
    const key = name.toLocaleLowerCase();
    const current = target.get(key) || { name, count: 0 };
    current.count += 1;
    target.set(key, current);
  }
}

function pct(value: number, total: number) {
  return total ? Number(((value / total) * 100).toFixed(1)) : 0;
}

function availableVariant(variant: { stockQuantity: number; safetyStock: number }) {
  return Math.max(0, Number(variant.stockQuantity || 0) - Math.max(0, Number(variant.safetyStock || 0)));
}

async function discoveryRows() {
  return prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      ingredients: true,
      benefits: true,
      suitableFor: true,
      category: { select: { id: true, name: true, slug: true, description: true, imageUrl: true, sortOrder: true } },
      variants: { where: { isActive: true }, select: { sellingPrice: true, stockQuantity: true, safetyStock: true } },
      reviews: { where: { isApproved: true }, select: { rating: true } },
    },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
  });
}

export async function shopDiscoveryFacets() {
  const products = await discoveryRows();
  const categoryCounts = new Map<string, number>();
  const ingredientCounts = new Map<string, { name: string; count: number }>();
  const benefitCounts = new Map<string, { name: string; count: number }>();
  const suitabilityCounts = new Map<string, { name: string; count: number }>();
  const prices: number[] = [];
  let inStockCount = 0;
  let fourStarCount = 0;
  let threeStarCount = 0;

  for (const product of products) {
    categoryCounts.set(product.category.id, (categoryCounts.get(product.category.id) || 0) + 1);
    addTokens(ingredientCounts, product.ingredients, 60);
    addTokens(benefitCounts, product.benefits, 80);
    addTokens(suitabilityCounts, product.suitableFor, 60);
    const activePrices = product.variants.map((variant) => Number(variant.sellingPrice)).filter(Number.isFinite);
    prices.push(...activePrices);
    if (product.variants.some((variant) => availableVariant(variant) > 0)) inStockCount += 1;
    const ratings = product.reviews.map((review) => Number(review.rating)).filter(Number.isFinite);
    const average = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
    if (average >= 4) fourStarCount += 1;
    if (average >= 3) threeStarCount += 1;
  }

  const categoryRows = await prisma.category.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true, description: true, imageUrl: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const categories = categoryRows.map((category) => ({ ...category, count: categoryCounts.get(category.id) || 0 }));
  const byCount = (map: Map<string, { name: string; count: number }>, limit = 30) => [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
  const ingredients = byCount(ingredientCounts, 30);
  const benefits = byCount(benefitCounts, 24);
  const suitability = byCount(suitabilityCounts, 24);

  const collections = [
    ...categories.filter((item) => item.count > 0).slice(0, 2).map((item) => ({ id: `category:${item.slug}`, type: "category", value: item.slug, label: item.name, kicker: "CATEGORY", count: item.count, description: `Browse active ${item.name} products.` })),
    ...ingredients.filter((item) => item.count >= 1).slice(0, 2).map((item) => ({ id: `ingredient:${item.name}`, type: "ingredient", value: item.name, label: item.name, kicker: "INGREDIENT", count: item.count, description: `Products whose catalogue ingredients include ${item.name}.` })),
    ...suitability.filter((item) => item.count >= 1).slice(0, 2).map((item) => ({ id: `suitableFor:${item.name}`, type: "suitableFor", value: item.name, label: item.name, kicker: "SUITABLE FOR", count: item.count, description: `Products configured as suitable for ${item.name}.` })),
    ...benefits.filter((item) => item.count >= 1).slice(0, 2).map((item) => ({ id: `benefit:${item.name}`, type: "benefit", value: item.name, label: item.name, kicker: "CATALOGUE BENEFIT", count: item.count, description: `Products whose catalogue benefits include ${item.name}.` })),
  ].slice(0, 8);

  return {
    categories,
    suitability,
    ingredients,
    benefits,
    ratings: [
      { value: 4, label: "4★ & up", count: fourStarCount },
      { value: 3, label: "3★ & up", count: threeStarCount },
    ],
    availability: { inStock: inStockCount, total: products.length },
    price: { min: prices.length ? Math.floor(Math.min(...prices)) : 0, max: prices.length ? Math.ceil(Math.max(...prices)) : 0 },
    collections,
    guidance: "Filters reflect Riseora catalogue information and approved customer ratings; they do not diagnose conditions or promise treatment outcomes.",
  };
}

type DiscoveryEvent = {
  type: "view" | "filter" | "collection";
  facets?: string[];
  resultCount?: number;
};

type StoredEvent = DiscoveryEvent & { at: number };
const events: StoredEvent[] = [];
const EVENT_WINDOW_MS = 60 * 60 * 1000;

export function recordShopDiscoveryEvent(event: DiscoveryEvent) {
  const now = Date.now();
  events.push({
    type: event.type,
    facets: [...new Set((event.facets || []).map((item) => String(item).slice(0, 32)))].slice(0, 10),
    resultCount: Number.isFinite(event.resultCount) ? Math.max(0, Math.min(500, Number(event.resultCount))) : undefined,
    at: now,
  });
  while (events.length && events[0].at < now - EVENT_WINDOW_MS) events.shift();
  if (events.length > 5000) events.splice(0, events.length - 5000);
}

function engagementSnapshot() {
  const cutoff = Date.now() - EVENT_WINDOW_MS;
  const current = events.filter((event) => event.at >= cutoff);
  const views = current.filter((event) => event.type === "view").length;
  const filters = current.filter((event) => event.type === "filter").length;
  const collectionOpens = current.filter((event) => event.type === "collection").length;
  const facetCounts = new Map<string, number>();
  for (const event of current) for (const facet of event.facets || []) facetCounts.set(facet, (facetCounts.get(facet) || 0) + 1);
  return {
    windowMinutes: 60,
    shopViews: views,
    filterActions: filters,
    collectionOpens,
    topFacets: [...facetCounts.entries()].map(([facet, count]) => ({ facet, count })).sort((a, b) => b.count - a.count || a.facet.localeCompare(b.facet)).slice(0, 8),
  };
}

export async function shopDiscoveryHealth() {
  const products = await discoveryRows();
  const facets = await shopDiscoveryFacets();
  const discoverable = products.filter((product) => listTokens(product.ingredients).length || listTokens(product.benefits).length || listTokens(product.suitableFor).length).length;
  const withIngredients = products.filter((product) => listTokens(product.ingredients).length > 0).length;
  const withBenefits = products.filter((product) => listTokens(product.benefits).length > 0).length;
  const withSuitability = products.filter((product) => listTokens(product.suitableFor).length > 0).length;
  const inStock = products.filter((product) => product.variants.some((variant) => availableVariant(variant) > 0)).length;
  const missing = products.filter((product) => !listTokens(product.ingredients).length && !listTokens(product.benefits).length && !listTokens(product.suitableFor).length).slice(0, 8).map((product) => ({ id: product.id, name: product.name, slug: product.slug }));
  return {
    activeProducts: products.length,
    discoverableProducts: discoverable,
    discoveryCoverage: pct(discoverable, products.length),
    ingredientCoverage: pct(withIngredients, products.length),
    benefitCoverage: pct(withBenefits, products.length),
    suitabilityCoverage: pct(withSuitability, products.length),
    inStockProducts: inStock,
    inStockCoverage: pct(inStock, products.length),
    guidedCollections: facets.collections.length,
    uniqueIngredients: facets.ingredients.length,
    uniqueBenefits: facets.benefits.length,
    missingDiscoveryContent: missing,
    engagement: engagementSnapshot(),
  };
}
