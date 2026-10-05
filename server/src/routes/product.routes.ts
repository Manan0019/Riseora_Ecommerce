import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { buildSearchDictionary, recordSearchObservation, relatedSearchTerms, suggestedCorrection } from "../services/search-intelligence.service";
import { recordRecommendationEvent, smartCartRecommendations, smartProductRecommendations } from "../services/product-recommendation.service";
import { getRoutineGuidance, previewRoutineSelections, recordRoutineBuilderEvent } from "../services/routine-builder.service";

const router = Router();
const recommendationEventLimiter = rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: "draft-8", legacyHeaders: false });

function publicVariant<T extends { stockQuantity?: number | null; safetyStock?: number | null }>(variant: T) {
  const availableQuantity = Math.max(0, Number(variant.stockQuantity || 0) - Math.max(0, Number(variant.safetyStock || 0)));
  return { ...variant, stockQuantity: availableQuantity, availableQuantity };
}

function publicStock<T extends { variants?: any[] }>(product: T) {
  return { ...product, variants: Array.isArray(product.variants) ? product.variants.map(publicVariant) : product.variants };
}

function withRating<T extends { reviews?: Array<{ rating: number }> }>(product: T) {
  const ratings = product.reviews || [];
  const ratingAverage = ratings.length ? ratings.reduce((sum, review) => sum + review.rating, 0) / ratings.length : 0;
  const { reviews: _reviews, ...rest } = product;
  return { ...publicStock(rest), ratingAverage: Number(ratingAverage.toFixed(1)), reviewCount: ratings.length };
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
  return [...new Set(prepared.split(/[\n,;|•]+/).map((item) => item.replace(/\s+/g, " ").trim()).filter((item) => item.length >= 2 && item.length <= 50))];
}

function searchClauses(term: string) {
  return [
    { name: { contains: term, mode: "insensitive" as const } },
    { shortDescription: { contains: term, mode: "insensitive" as const } },
    { description: { contains: term, mode: "insensitive" as const } },
    { benefits: { contains: term, mode: "insensitive" as const } },
    { ingredients: { contains: term, mode: "insensitive" as const } },
    { suitableFor: { contains: term, mode: "insensitive" as const } },
    { category: { name: { contains: term, mode: "insensitive" as const } } },
    { variants: { some: { sku: { contains: term, mode: "insensitive" as const } } } },
  ];
}

function relevanceScore(product: any, query: string) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const name = String(product.name || "").toLowerCase();
  const category = String(product.category?.name || "").toLowerCase();
  const searchable = [name, category, product.shortDescription, plainText(product.benefits), plainText(product.ingredients), product.suitableFor, ...(product.variants || []).map((v: any) => v.sku)].join(" ").toLowerCase();
  let score = name === q ? 120 : name.startsWith(q) ? 90 : name.includes(q) ? 65 : searchable.includes(q) ? 40 : 0;
  for (const term of terms) {
    if (name.startsWith(term)) score += 18;
    else if (name.includes(term)) score += 12;
    else if (category.includes(term)) score += 8;
    else if (searchable.includes(term)) score += 4;
  }
  if (product.isFeatured) score += 2;
  return score;
}


function searchWhere(query: string) {
  const terms = query.split(/\s+/).map((term) => term.trim()).filter(Boolean).slice(0, 5);
  return terms.length ? { AND: terms.map((term) => ({ OR: searchClauses(term) })) } : {};
}

async function searchPreviewProducts(query: string, limit: number) {
  const rows = await prisma.product.findMany({
    where: { isActive: true, ...searchWhere(query) },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 2 },
      variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" } },
    },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: Math.max(limit * 4, 20),
  });
  return rows
    .sort((a: any, b: any) => relevanceScore(b, query) - relevanceScore(a, query))
    .slice(0, limit)
    .map((product: any) => ({
      id: product.id, slug: product.slug, name: product.name, shortDescription: product.shortDescription, badge: product.badge,
      category: product.category, images: product.images, variants: product.variants.map(publicVariant),
    }));
}

async function searchFallbackProducts(limit: number) {
  const rows = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 2 },
      variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" } },
    },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(8, limit)),
  });
  return rows.map((product: any) => ({
    id: product.id, slug: product.slug, name: product.name, shortDescription: product.shortDescription, badge: product.badge,
    category: product.category, images: product.images, variants: product.variants.map(publicVariant),
  }));
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const badge = typeof req.query.badge === "string" ? req.query.badge.trim() : "";
    const suitableFor = typeof req.query.suitableFor === "string" ? req.query.suitableFor.trim() : "";
    const ingredient = typeof req.query.ingredient === "string" ? req.query.ingredient.trim() : "";
    const featured = req.query.featured === "true";
    const inStock = req.query.inStock === "true";
    const sort = typeof req.query.sort === "string" ? req.query.sort : "featured";
    const minPrice = typeof req.query.minPrice === "string" && req.query.minPrice !== "" ? Number(req.query.minPrice) : null;
    const maxPrice = typeof req.query.maxPrice === "string" && req.query.maxPrice !== "" ? Number(req.query.maxPrice) : null;
    const limit = Math.min(60, Math.max(1, Number(req.query.limit || 60)));

    const variantFilter: any = { isActive: true };
    if (inStock) variantFilter.stockQuantity = { gt: 0 };
    if (minPrice !== null || maxPrice !== null) {
      variantFilter.sellingPrice = {};
      if (minPrice !== null && Number.isFinite(minPrice)) variantFilter.sellingPrice.gte = minPrice;
      if (maxPrice !== null && Number.isFinite(maxPrice)) variantFilter.sellingPrice.lte = maxPrice;
    }

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(featured ? { isFeatured: true } : {}),
        ...(category ? { category: { slug: category, isActive: true } } : {}),
        ...(badge ? { badge: { equals: badge, mode: "insensitive" } } : {}),
        ...(suitableFor ? { suitableFor: { contains: suitableFor, mode: "insensitive" } } : {}),
        ...(ingredient ? { ingredients: { contains: ingredient, mode: "insensitive" } } : {}),
        ...(inStock || minPrice !== null || maxPrice !== null ? { variants: { some: variantFilter } } : {}),
        ...(search
          ? {
              AND: search.split(/\s+/).filter(Boolean).slice(0, 5).map((term) => ({ OR: searchClauses(term) })),
            }
          : {}),
      },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        variants: { where: variantFilter, orderBy: { sellingPrice: "asc" } },
        reviews: { where: { isApproved: true }, select: { rating: true } },
      },
      orderBy: sort === "name" ? { name: "asc" } : [{ isFeatured: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    let enriched = products.map(withRating);
    if (inStock) enriched = enriched.filter((product: any) => product.variants?.some((variant: any) => Number(variant.stockQuantity || 0) > 0));
    enriched.sort((a: any, b: any) => {
      if (search && sort === "featured") {
        const relevance = relevanceScore(b, search) - relevanceScore(a, search);
        if (relevance) return relevance;
      }
      const ap = Number(a.variants?.[0]?.sellingPrice || 0);
      const bp = Number(b.variants?.[0]?.sellingPrice || 0);
      if (sort === "price_asc") return ap - bp;
      if (sort === "price_desc") return bp - ap;
      if (sort === "rating") return Number(b.ratingAverage || 0) - Number(a.ratingAverage || 0);
      if (sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return 0;
    });

    res.json({ success: true, data: enriched });
  }),
);


router.get(
  "/discovery/facets",
  asyncHandler(async (_req, res) => {
    const [categories, suitabilityOptions, products, priceRows] = await Promise.all([
      prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true, imageUrl: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.suitabilityOption.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.product.findMany({ where: { isActive: true, ingredients: { not: null } }, select: { ingredients: true } }),
      prisma.productVariant.findMany({ where: { isActive: true, product: { isActive: true } }, select: { sellingPrice: true } }),
    ]);
    const ingredientCounts = new Map<string, { name: string; count: number }>();
    for (const product of products) {
      for (const name of listTokens(product.ingredients)) {
        const key = name.toLowerCase();
        const row = ingredientCounts.get(key) || { name, count: 0 };
        row.count += 1; ingredientCounts.set(key, row);
      }
    }
    const ingredients = [...ingredientCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 24);
    const prices = priceRows.map((row) => Number(row.sellingPrice)).filter(Number.isFinite);
    return res.json({ success: true, data: {
      categories, suitability: suitabilityOptions, ingredients,
      price: { min: prices.length ? Math.floor(Math.min(...prices)) : 0, max: prices.length ? Math.ceil(Math.max(...prices)) : 0 },
    } });
  }),
);

const routineGuidanceSchema = z.object({
  productIds: z.array(z.string().uuid()).max(4).optional().default([]),
  seedSlug: z.string().trim().max(180).optional().default(""),
  limit: z.number().int().min(4).max(10).optional().default(8),
});

router.post(
  "/routine/intelligence",
  asyncHandler(async (req, res) => {
    const parsed = routineGuidanceSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid routine request" });
    const data = await getRoutineGuidance(parsed.data);
    return res.json({ success: true, data });
  }),
);

const routinePreviewSchema = z.object({
  selections: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(4).optional().default(1) })).min(1).max(4),
});

router.post(
  "/routine/preview",
  asyncHandler(async (req, res) => {
    const parsed = routinePreviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Choose up to four valid routine items" });
    const data = await previewRoutineSelections(parsed.data.selections);
    return res.json({ success: true, data });
  }),
);

const routineEventSchema = z.object({
  type: z.enum(["view", "guided_pick", "add"]),
  selectedCount: z.number().int().min(0).max(4).optional().default(0),
});

router.post(
  "/routine/event",
  recommendationEventLimiter,
  asyncHandler(async (req, res) => {
    const parsed = routineEventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid routine event" });
    recordRoutineBuilderEvent(parsed.data);
    return res.json({ success: true });
  }),
);

router.get(
  "/compare",
  asyncHandler(async (req, res) => {
    const ids = typeof req.query.ids === "string" ? [...new Set(req.query.ids.split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 3) : [];
    if (!ids.length) return res.json({ success: true, data: [] });
    const products = await prisma.product.findMany({
      where: { id: { in: ids }, isActive: true },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" } },
        reviews: { where: { isApproved: true }, select: { rating: true } },
      },
    });
    const map = new Map(products.map((product) => [product.id, withRating(product)]));
    return res.json({ success: true, data: ids.map((id) => map.get(id)).filter(Boolean) });
  }),
);

router.get(
  "/search/intelligence",
  asyncHandler(async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const source = typeof req.query.source === "string" ? req.query.source.trim().slice(0, 24) : "search";
    const limit = Math.min(8, Math.max(3, Number(req.query.limit || 6)));
    if (query.length < 2) {
      return res.json({ success: true, data: { products: [], categories: [], didYouMean: null, relatedTerms: [], resultCount: 0, rescueProducts: [] } });
    }

    const [dictionaryProducts, categoryRows, suitabilityRows] = await Promise.all([
      prisma.product.findMany({
        where: { isActive: true },
        select: { name: true, ingredients: true, suitableFor: true, category: { select: { name: true } }, variants: { where: { isActive: true }, select: { sku: true }, take: 4 } },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true, imageUrl: true }, orderBy: { name: "asc" } }),
      prisma.suitabilityOption.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { sortOrder: "asc" } }),
    ]);

    const dictionaryValues: unknown[] = [];
    for (const product of dictionaryProducts) {
      dictionaryValues.push(product.name, product.category?.name, ...listTokens(product.ingredients), ...listTokens(product.suitableFor));
      for (const variant of product.variants || []) dictionaryValues.push(variant.sku);
    }
    for (const category of categoryRows) dictionaryValues.push(category.name);
    for (const option of suitabilityRows) dictionaryValues.push(option.name);
    const dictionary = buildSearchDictionary(dictionaryValues);

    let products = await searchPreviewProducts(query, limit);
    const correction = products.length === 0 ? suggestedCorrection(query, dictionary) : null;
    if (!products.length && correction) products = await searchPreviewProducts(correction, limit);

    const categoryQuery = correction || query;
    const categoryTerms = categoryQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const categories = categoryRows
      .map((category) => ({ category, score: categoryTerms.reduce((score, term) => score + (category.name.toLowerCase().includes(term) ? 1 : 0), 0) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.category.name.localeCompare(b.category.name))
      .slice(0, 4)
      .map((row) => row.category);

    const relatedTerms = relatedSearchTerms(correction || query, dictionary, 7);
    const rescueProducts = products.length ? [] : await searchFallbackProducts(4);
    recordSearchObservation({ query, source, resultCount: products.length, correctedQuery: correction });

    return res.json({
      success: true,
      data: { products, categories, didYouMean: correction, relatedTerms, resultCount: products.length, rescueProducts },
    });
  }),
);

router.get(
  "/search/suggestions",
  asyncHandler(async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = Math.min(8, Math.max(3, Number(req.query.limit || 6)));
    if (query.length < 2) return res.json({ success: true, data: { products: [], categories: [] } });

    const [products, categories] = await Promise.all([
      prisma.product.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { shortDescription: { contains: query, mode: "insensitive" } },
            { benefits: { contains: query, mode: "insensitive" } },
            { ingredients: { contains: query, mode: "insensitive" } },
            { suitableFor: { contains: query, mode: "insensitive" } },
            { category: { name: { contains: query, mode: "insensitive" } } },
            { variants: { some: { sku: { contains: query, mode: "insensitive" } } } },
          ],
        },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 2 },
          variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" } },
        },
        orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
        take: limit,
      }),
      prisma.category.findMany({
        where: { isActive: true, name: { contains: query, mode: "insensitive" } },
        select: { id: true, name: true, slug: true, imageUrl: true },
        orderBy: { name: "asc" },
        take: 4,
      }),
    ]);

    res.json({
      success: true,
      data: {
        products: products.map((product) => ({
          id: product.id,
          slug: product.slug,
          name: product.name,
          shortDescription: product.shortDescription,
          badge: product.badge,
          category: product.category,
          images: product.images,
          variants: product.variants.map(publicVariant),
        })),
        categories,
      },
    });
  }),
);

router.post(
  "/recommendations/cart",
  recommendationEventLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({
      productIds: z.array(z.string().uuid()).min(1).max(20),
      limit: z.number().int().min(3).max(8).optional(),
    }).parse(req.body);
    const result = await smartCartRecommendations(body.productIds, body.limit || 6);
    return res.json({ success: true, data: result });
  }),
);

router.post(
  "/recommendations/event",
  recommendationEventLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({
      type: z.enum(["impression", "click", "add"]),
      shelf: z.string().trim().min(1).max(40).default("product-detail"),
      sourceProductId: z.string().uuid(),
      targetProductId: z.string().uuid().optional(),
    }).parse(req.body);
    recordRecommendationEvent(body);
    return res.json({ success: true });
  }),
);

router.get(
  "/:slug/recommendations/similar",
  asyncHandler(async (req, res) => {
    const result = await smartProductRecommendations(String(req.params.slug), Number(req.query.limit || 8));
    if (!result) return res.status(404).json({ success: false, message: "Product not found" });
    return res.json({ success: true, data: result });
  }),
);

router.get(
  "/:slug/recommendations",
  asyncHandler(async (req, res) => {
    const current = await prisma.product.findUnique({
      where: { slug: String(req.params.slug) },
      select: { id: true, categoryId: true, isActive: true },
    });
    if (!current?.isActive) return res.status(404).json({ success: false, message: "Product not found" });

    const recentOrders = await prisma.order.findMany({
      where: {
        status: "DELIVERED",
        items: { some: { variant: { productId: current.id } } },
      },
      select: { items: { select: { variant: { select: { productId: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 160,
    });

    const counts = new Map<string, number>();
    for (const order of recentOrders) {
      const seen = new Set<string>();
      for (const item of order.items) {
        const productId = item.variant?.productId;
        if (!productId || productId === current.id || seen.has(productId)) continue;
        seen.add(productId);
        counts.set(productId, (counts.get(productId) || 0) + 1);
      }
    }
    const rankedIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 6);

    const include = {
      category: true,
      images: { orderBy: { sortOrder: "asc" as const } },
      variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" as const } },
      reviews: { where: { isApproved: true }, select: { rating: true } },
    };
    const coPurchased = rankedIds.length ? await prisma.product.findMany({ where: { id: { in: rankedIds }, isActive: true }, include }) : [];
    const coMap = new Map(coPurchased.map((product) => [product.id, product]));
    const ordered = rankedIds.map((id) => coMap.get(id)).filter(Boolean) as typeof coPurchased;

    const missing = Math.max(0, 4 - ordered.length);
    const fallback = missing ? await prisma.product.findMany({
      where: { id: { notIn: [current.id, ...ordered.map((product) => product.id)] }, categoryId: current.categoryId, isActive: true },
      include,
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      take: missing,
    }) : [];

    res.json({ success: true, data: [...ordered, ...fallback].map(withRating), source: ordered.length ? "orders" : "category" });
  }),
);

router.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { slug: String(req.params.slug) },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" } },
        reviews: {
          where: { isApproved: true },
          orderBy: { createdAt: "desc" },
          include: { user: { select: { firstName: true } } },
        },
        questions: {
          where: { isPublished: true, answer: { not: null } },
          orderBy: [{ answeredAt: "desc" }, { createdAt: "desc" }],
          include: { user: { select: { firstName: true } } },
          take: 50,
        },
      },
    });

    if (!product?.isActive) return res.status(404).json({ success: false, message: "Product not found" });
    const ratings = product.reviews.map((review) => review.rating);
    const ratingAverage = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
    res.json({ success: true, data: { ...publicStock(product), ratingAverage: Number(ratingAverage.toFixed(1)), reviewCount: ratings.length } });
  }),
);

const mediaUrlSchema = z.string().trim().max(2000).refine((value) => value.startsWith("/uploads/reviews/") || /^https:\/\//i.test(value), "Invalid review image URL");

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(100).optional().or(z.literal("")),
  comment: z.string().trim().min(5).max(1200),
  images: z.array(mediaUrlSchema).max(4).default([]),
});

router.post(
  "/:id/reviews",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid review", errors: parsed.error.flatten() });

    const product = await prisma.product.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const purchased = await prisma.orderItem.findFirst({
      where: {
        order: { userId: req.user!.id, status: "DELIVERED" },
        variant: { productId: String(req.params.id) },
      },
      select: { id: true },
    });

    const review = await prisma.review.upsert({
      where: { userId_productId: { userId: req.user!.id, productId: String(req.params.id) } },
      create: {
        userId: req.user!.id,
        productId: String(req.params.id),
        rating: parsed.data.rating,
        title: parsed.data.title || null,
        comment: parsed.data.comment,
        images: parsed.data.images,
        verifiedPurchase: Boolean(purchased),
        isApproved: false,
      },
      update: {
        rating: parsed.data.rating,
        title: parsed.data.title || null,
        comment: parsed.data.comment,
        images: parsed.data.images,
        verifiedPurchase: Boolean(purchased),
        isApproved: false,
      },
      include: { user: { select: { firstName: true } } },
    });

    res.status(201).json({ success: true, data: review, message: "Thanks — your review was submitted for moderation." });
  }),
);

const questionSchema = z.object({
  question: z.string().trim().min(8).max(500),
});

router.post(
  "/:id/questions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = questionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Please enter a clear product question", errors: parsed.error.flatten() });

    const product = await prisma.product.findFirst({ where: { id: String(req.params.id), isActive: true }, select: { id: true, name: true } });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const recentDuplicate = await prisma.productQuestion.findFirst({
      where: { userId: req.user!.id, productId: product.id, question: { equals: parsed.data.question, mode: "insensitive" }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      select: { id: true },
    });
    if (recentDuplicate) return res.status(409).json({ success: false, message: "You already submitted this question recently." });

    const question = await prisma.productQuestion.create({
      data: { productId: product.id, userId: req.user!.id, question: parsed.data.question },
      include: { user: { select: { firstName: true } } },
    });
    res.status(201).json({ success: true, data: question, message: "Question submitted. Riseora will publish it after answering." });
  }),
);

export default router;
