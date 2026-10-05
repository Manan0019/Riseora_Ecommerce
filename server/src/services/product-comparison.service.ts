import { prisma } from "../config/prisma";
import { reviewTrustSummary } from "./product-trust.service";

type CompareEventType = "view" | "product_open" | "add_to_cart";
type CompareEvent = { type: CompareEventType; productIds: string[]; productId?: string | null; at: number };

const EVENTS: CompareEvent[] = [];
const WINDOW_MS = 60 * 60 * 1000;
const MAX_EVENTS = 1200;

function pruneEvents(now = Date.now()) {
  while (EVENTS.length && (EVENTS[0].at < now - WINDOW_MS || EVENTS.length > MAX_EVENTS)) EVENTS.shift();
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

function listTokens(value: unknown) {
  const prepared = String(value || "")
    .replace(/<\/(li|p|div|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of prepared.split(/[\n,;|•]+/)) {
    const value = raw.replace(/\s+/g, " ").trim();
    const key = value.toLowerCase();
    if (value.length < 2 || value.length > 80 || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result.slice(0, 18);
}

function publicVariant(variant: any) {
  const availableQuantity = Math.max(0, Number(variant.stockQuantity || 0) - Math.max(0, Number(variant.safetyStock || 0)));
  return { ...variant, stockQuantity: availableQuantity, availableQuantity };
}

function averageRating(reviews: Array<{ rating: number }>) {
  return reviews.length ? Number((reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1)) : 0;
}

function intersectTokens(products: Array<{ ingredientsList: string[]; suitableForList: string[] }>, key: "ingredientsList" | "suitableForList") {
  if (products.length < 2) return [];
  const first = products[0][key];
  return first.filter((value) => products.slice(1).every((product) => product[key].some((candidate) => candidate.toLowerCase() === value.toLowerCase()))).slice(0, 8);
}

export async function buildProductComparison(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))].slice(0, 3);
  if (!uniqueIds.length) return { products: [], shared: { ingredients: [], suitableFor: [] }, methodology: "Objective catalogue comparison only." };

  const rows = await prisma.product.findMany({
    where: { id: { in: uniqueIds }, isActive: true },
    include: {
      category: true,
      images: { orderBy: { sortOrder: "asc" } },
      variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" } },
      reviews: { where: { isApproved: true }, select: { id: true, rating: true, title: true, comment: true, images: true, verifiedPurchase: true, createdAt: true } },
      questions: { where: { isPublished: true, answer: { not: null } }, select: { id: true } },
    },
  });

  const ordered = uniqueIds.map((id) => rows.find((row) => row.id === id)).filter(Boolean) as any[];
  const products = ordered.map((product) => {
    const variants = product.variants.map(publicVariant);
    const availableVariants = variants.filter((variant: any) => Number(variant.availableQuantity || 0) > 0);
    const startingVariant = variants[0] || null;
    const startingPrice = startingVariant ? Number(startingVariant.sellingPrice || 0) : 0;
    const startingMrp = startingVariant ? Number(startingVariant.mrp || 0) : 0;
    const mrpSaving = Math.max(0, startingMrp - startingPrice);
    const mrpSavingPercent = startingMrp > 0 ? Number(((mrpSaving / startingMrp) * 100).toFixed(1)) : 0;
    const trust = reviewTrustSummary(product.reviews);
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      shortDescription: product.shortDescription,
      badge: product.badge,
      category: product.category,
      images: product.images,
      variants,
      codAllowed: product.codAllowed,
      isFeatured: product.isFeatured,
      suitableFor: plainText(product.suitableFor),
      benefits: plainText(product.benefits),
      ingredients: plainText(product.ingredients),
      suitableForList: listTokens(product.suitableFor),
      benefitsList: listTokens(product.benefits),
      ingredientsList: listTokens(product.ingredients),
      ratingAverage: averageRating(product.reviews),
      reviewCount: product.reviews.length,
      verifiedReviewCount: trust.verifiedCount,
      verifiedReviewPercent: trust.verifiedPercent,
      photoReviewCount: trust.photoCount,
      answeredQuestionCount: product.questions.length,
      packCount: variants.length,
      availablePackCount: availableVariants.length,
      isAvailable: availableVariants.length > 0,
      startingPrice,
      startingMrp,
      mrpSaving,
      mrpSavingPercent,
      comparisonHighlights: [] as string[],
    };
  });

  if (products.length >= 2) {
    const minPrice = Math.min(...products.filter((product) => product.startingPrice > 0).map((product) => product.startingPrice));
    const maxRating = Math.max(...products.map((product) => product.reviewCount ? product.ratingAverage : 0));
    const maxVerified = Math.max(...products.map((product) => product.verifiedReviewCount));
    const maxPacks = Math.max(...products.map((product) => product.packCount));
    const maxSaving = Math.max(...products.map((product) => product.mrpSavingPercent));
    for (const product of products) {
      if (product.startingPrice > 0 && product.startingPrice === minPrice) product.comparisonHighlights.push("Lowest starting price");
      if (maxRating > 0 && product.reviewCount > 0 && product.ratingAverage === maxRating) product.comparisonHighlights.push("Highest approved rating");
      if (maxVerified > 0 && product.verifiedReviewCount === maxVerified) product.comparisonHighlights.push("Most verified reviews");
      if (maxPacks > 1 && product.packCount === maxPacks) product.comparisonHighlights.push("Most pack choices");
      if (maxSaving > 0 && product.mrpSavingPercent === maxSaving) product.comparisonHighlights.push("Largest current MRP saving");
      if (product.isAvailable && product.comparisonHighlights.length === 0) product.comparisonHighlights.push("Available now");
      product.comparisonHighlights = product.comparisonHighlights.slice(0, 3);
    }
  }

  return {
    products,
    shared: {
      ingredients: intersectTokens(products, "ingredientsList"),
      suitableFor: intersectTokens(products, "suitableForList"),
    },
    methodology: "Objective catalogue and approved-review facts only. Highlights are not medical advice and do not claim product efficacy.",
  };
}

export function recordProductComparisonEvent(input: { type: CompareEventType; productIds: string[]; productId?: string | null }) {
  const productIds = [...new Set((input.productIds || []).filter(Boolean))].slice(0, 3);
  if (productIds.length < 2) return;
  EVENTS.push({ type: input.type, productIds, productId: input.productId || null, at: Date.now() });
  pruneEvents();
}

export async function productComparisonHealth() {
  pruneEvents();
  const views = EVENTS.filter((event) => event.type === "view");
  const opens = EVENTS.filter((event) => event.type === "product_open");
  const adds = EVENTS.filter((event) => event.type === "add_to_cart");
  const counts = new Map<string, number>();
  for (const event of views) for (const id of event.productIds) counts.set(id, (counts.get(id) || 0) + 1);
  const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  const names = topIds.length ? await prisma.product.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true } }) : [];
  const nameMap = new Map(names.map((item) => [item.id, item.name]));
  return {
    windowMinutes: 60,
    comparisonViews: views.length,
    productOpens: opens.length,
    assistedAdds: adds.length,
    openRate: views.length ? Number(((opens.length / views.length) * 100).toFixed(1)) : 0,
    addRate: views.length ? Number(((adds.length / views.length) * 100).toFixed(1)) : 0,
    averageProductsPerComparison: views.length ? Number((views.reduce((sum, event) => sum + event.productIds.length, 0) / views.length).toFixed(1)) : 0,
    topCompared: topIds.map((id) => ({ id, name: nameMap.get(id) || "Product", comparisons: counts.get(id) || 0 })),
    methodology: "Rolling in-memory operational comparison events. No customer identity or comparison history is persisted.",
  };
}
