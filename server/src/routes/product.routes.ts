import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";

const router = Router();

function withRating<T extends { reviews?: Array<{ rating: number }> }>(product: T) {
  const ratings = product.reviews || [];
  const ratingAverage = ratings.length ? ratings.reduce((sum, review) => sum + review.rating, 0) / ratings.length : 0;
  const { reviews: _reviews, ...rest } = product;
  return { ...rest, ratingAverage: Number(ratingAverage.toFixed(1)), reviewCount: ratings.length };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const badge = typeof req.query.badge === "string" ? req.query.badge.trim() : "";
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
        ...(inStock || minPrice !== null || maxPrice !== null ? { variants: { some: variantFilter } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { shortDescription: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { benefits: { contains: search, mode: "insensitive" } },
                { ingredients: { contains: search, mode: "insensitive" } },
                { variants: { some: { sku: { contains: search, mode: "insensitive" } } } },
              ],
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

    const enriched = products.map(withRating);
    enriched.sort((a: any, b: any) => {
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
            { category: { name: { contains: query, mode: "insensitive" } } },
            { variants: { some: { sku: { contains: query, mode: "insensitive" } } } },
          ],
        },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 2 },
          variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" }, take: 1 },
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
          variants: product.variants,
        })),
        categories,
      },
    });
  }),
);

router.get(
  "/:slug/recommendations",
  asyncHandler(async (req, res) => {
    const current = await prisma.product.findUnique({
      where: { slug: req.params.slug },
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
      where: { slug: req.params.slug },
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
    res.json({ success: true, data: { ...product, ratingAverage: Number(ratingAverage.toFixed(1)), reviewCount: ratings.length } });
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

    const product = await prisma.product.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const purchased = await prisma.orderItem.findFirst({
      where: {
        order: { userId: req.user!.id, status: "DELIVERED" },
        variant: { productId: req.params.id },
      },
      select: { id: true },
    });

    const review = await prisma.review.upsert({
      where: { userId_productId: { userId: req.user!.id, productId: req.params.id } },
      create: {
        userId: req.user!.id,
        productId: req.params.id,
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

    const product = await prisma.product.findFirst({ where: { id: req.params.id, isActive: true }, select: { id: true, name: true } });
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
