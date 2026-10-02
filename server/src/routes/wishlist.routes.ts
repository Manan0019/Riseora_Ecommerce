import { randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";

const router = Router();

const shareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many wishlist share requests. Please try again shortly." },
});

const shareSchema = z.object({
  title: z.string().trim().max(80).optional().or(z.literal("")),
  productIds: z.array(z.string().uuid()).min(1).max(40),
});

const tokenSchema = z.string().regex(/^[a-f0-9]{32}$/i);

function withRating(product: any) {
  const ratings = product.reviews || [];
  const ratingAverage = ratings.length
    ? ratings.reduce((sum: number, review: any) => sum + review.rating, 0) / ratings.length
    : 0;
  const { reviews: _reviews, ...rest } = product;
  return { ...rest, ratingAverage: Number(ratingAverage.toFixed(1)), reviewCount: ratings.length };
}


const syncWishlistSchema = z.object({
  productIds: z.array(z.string().uuid()).max(80).default([]),
});

const wishlistProductInclude = {
  category: true,
  images: { orderBy: { sortOrder: "asc" as const } },
  variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" as const } },
  reviews: { where: { isApproved: true }, select: { rating: true } },
};

async function accountWishlist(userId: string) {
  const rows = await prisma.wishlistItem.findMany({
    where: { userId, product: { isActive: true } },
    include: { product: { include: wishlistProductInclude } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => withRating(row.product));
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    return res.json({ success: true, data: await accountWishlist(req.user!.id) });
  }),
);

router.post(
  "/sync",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = syncWishlistSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid wishlist sync payload" });
    const ids = [...new Set(parsed.data.productIds)];
    if (ids.length) {
      const available = await prisma.product.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
      if (available.length) {
        await prisma.wishlistItem.createMany({
          data: available.map((product) => ({ userId: req.user!.id, productId: product.id })),
          skipDuplicates: true,
        });
      }
    }
    return res.json({ success: true, data: await accountWishlist(req.user!.id) });
  }),
);

router.put(
  "/items/:productId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = String(req.params.productId);
    const product = await prisma.product.findFirst({ where: { id: productId, isActive: true }, select: { id: true } });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    await prisma.wishlistItem.upsert({
      where: { userId_productId: { userId: req.user!.id, productId } },
      create: { userId: req.user!.id, productId },
      update: {},
    });
    return res.json({ success: true, data: await accountWishlist(req.user!.id) });
  }),
);

router.delete(
  "/items/:productId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = String(req.params.productId);
    await prisma.wishlistItem.deleteMany({ where: { userId: req.user!.id, productId } });
    return res.json({ success: true, data: await accountWishlist(req.user!.id) });
  }),
);

router.post(
  "/share",
  shareLimiter,
  asyncHandler(async (req, res) => {
    const parsed = shareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Choose at least one valid product to share" });
    }

    const requested = [...new Set(parsed.data.productIds)];

    // Best-effort cleanup keeps the small ephemeral table from growing forever.
    await prisma.wishlistShare.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    const products = await prisma.product.findMany({
      where: { id: { in: requested }, isActive: true },
      select: { id: true },
    });
    const availableIds = new Set(products.map((product) => product.id));
    const validIds = requested.filter((id) => availableIds.has(id));

    if (!validIds.length) {
      return res.status(400).json({ success: false, message: "None of the selected products are currently available" });
    }

    const token = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const share = await prisma.wishlistShare.create({
      data: {
        token,
        title: parsed.data.title || "Riseora wishlist",
        productIds: validIds,
        expiresAt,
      },
      select: { token: true, title: true, expiresAt: true },
    });

    return res.status(201).json({ success: true, data: share });
  }),
);

router.get(
  "/shared/:token",
  asyncHandler(async (req, res) => {
    const parsedToken = tokenSchema.safeParse(String(req.params.token));
    if (!parsedToken.success) {
      return res.status(404).json({ success: false, message: "This shared wishlist has expired or is unavailable" });
    }

    const share = await prisma.wishlistShare.findUnique({ where: { token: parsedToken.data } });
    if (!share || share.expiresAt <= new Date()) {
      return res.status(404).json({ success: false, message: "This shared wishlist has expired or is unavailable" });
    }

    const ids = Array.isArray(share.productIds)
      ? share.productIds.filter((id): id is string => typeof id === "string")
      : [];

    const products = ids.length
      ? await prisma.product.findMany({
          where: { id: { in: ids }, isActive: true },
          include: {
            category: true,
            images: { orderBy: { sortOrder: "asc" } },
            variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" } },
            reviews: { where: { isApproved: true }, select: { rating: true } },
          },
        })
      : [];

    const productMap = new Map(products.map((product) => [product.id, product]));
    const ordered = ids.map((id) => productMap.get(id)).filter(Boolean).map(withRating);

    return res.json({
      success: true,
      data: {
        title: share.title || "Riseora wishlist",
        expiresAt: share.expiresAt,
        products: ordered,
      },
    });
  }),
);

export default router;
