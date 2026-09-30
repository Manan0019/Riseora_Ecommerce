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
    const featured = req.query.featured === "true";

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(featured ? { isFeatured: true } : {}),
        ...(category ? { category: { slug: category, isActive: true } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { shortDescription: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" } },
        reviews: { where: { isApproved: true }, select: { rating: true } },
      },
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    });

    res.json({ success: true, data: products.map(withRating) });
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
      },
    });

    if (!product?.isActive) return res.status(404).json({ success: false, message: "Product not found" });
    const ratings = product.reviews.map((review) => review.rating);
    const ratingAverage = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
    res.json({ success: true, data: { ...product, ratingAverage: Number(ratingAverage.toFixed(1)), reviewCount: ratings.length } });
  }),
);

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(100).optional().or(z.literal("")),
  comment: z.string().trim().min(5).max(1200),
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
        verifiedPurchase: Boolean(purchased),
      },
      update: {
        rating: parsed.data.rating,
        title: parsed.data.title || null,
        comment: parsed.data.comment,
        verifiedPurchase: Boolean(purchased),
        isApproved: true,
      },
      include: { user: { select: { firstName: true } } },
    });

    res.status(201).json({ success: true, data: review });
  }),
);

export default router;
