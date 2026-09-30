import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { slugify } from "../utils/slugify";

const router = Router();
router.use(requireAuth, requireAdmin);

const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().optional(),
  description: z.string().trim().optional().or(z.literal("")),
  imageUrl: z.string().url().optional().or(z.literal("")),
});

router.post(
  "/categories",
  asyncHandler(async (req, res) => {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid category", errors: parsed.error.flatten() });
    }

    const category = await prisma.category.create({
      data: {
        name: parsed.data.name,
        slug: slugify(parsed.data.slug || parsed.data.name),
        description: parsed.data.description || null,
        imageUrl: parsed.data.imageUrl || null,
      },
    });

    res.status(201).json({ success: true, data: category });
  }),
);

const productSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().optional(),
  shortDescription: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().optional().or(z.literal("")),
  isFeatured: z.boolean().default(false),
  images: z
    .array(
      z.object({
        url: z.string().url(),
        altText: z.string().trim().optional().or(z.literal("")),
        isPrimary: z.boolean().default(false),
      }),
    )
    .default([]),
  variants: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        sku: z.string().trim().min(2).max(80),
        size: z.string().trim().optional().or(z.literal("")),
        unit: z.string().trim().optional().or(z.literal("")),
        mrp: z.number().positive(),
        sellingPrice: z.number().positive(),
        costPrice: z.number().nonnegative().optional(),
        stockQuantity: z.number().int().nonnegative().default(0),
        lowStockThreshold: z.number().int().nonnegative().default(5),
        weightGrams: z.number().positive().optional(),
      }),
    )
    .min(1),
});

router.post(
  "/products",
  asyncHandler(async (req, res) => {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid product", errors: parsed.error.flatten() });
    }

    const product = await prisma.product.create({
      data: {
        categoryId: parsed.data.categoryId,
        name: parsed.data.name,
        slug: slugify(parsed.data.slug || parsed.data.name),
        shortDescription: parsed.data.shortDescription || null,
        description: parsed.data.description || null,
        isFeatured: parsed.data.isFeatured,
        images: {
          create: parsed.data.images.map((image, index) => ({
            url: image.url,
            altText: image.altText || parsed.data.name,
            isPrimary: image.isPrimary || index === 0,
            sortOrder: index,
          })),
        },
        variants: {
          create: parsed.data.variants.map((variant) => ({
            name: variant.name,
            sku: variant.sku,
            size: variant.size || null,
            unit: variant.unit || null,
            mrp: variant.mrp,
            sellingPrice: variant.sellingPrice,
            costPrice: variant.costPrice ?? null,
            stockQuantity: variant.stockQuantity,
            lowStockThreshold: variant.lowStockThreshold,
            weightGrams: variant.weightGrams ?? null,
          })),
        },
      },
      include: { category: true, images: true, variants: true },
    });

    res.status(201).json({ success: true, data: product });
  }),
);

router.get(
  "/orders",
  asyncHandler(async (_req, res) => {
    const orders = await prisma.order.findMany({
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        items: true,
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: orders });
  }),
);

const statusSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]),
});

router.patch(
  "/orders/:id/status",
  asyncHandler(async (req, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid order status" });
    }

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status },
      include: { items: true, payment: true },
    });

    res.json({ success: true, data: order });
  }),
);



const couponSchema = z.object({
  code: z.string().trim().min(3).max(40),
  description: z.string().trim().optional().or(z.literal("")),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.number().positive(),
  minOrderAmount: z.number().nonnegative().optional(),
  maxDiscountAmount: z.number().nonnegative().optional(),
  usageLimit: z.number().int().positive().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

router.get(
  "/coupons",
  asyncHandler(async (_req, res) => {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ success: true, data: coupons });
  }),
);

router.post(
  "/coupons",
  asyncHandler(async (req, res) => {
    const parsed = couponSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid coupon", errors: parsed.error.flatten() });
    if (parsed.data.discountType === "PERCENTAGE" && parsed.data.discountValue > 100) return res.status(400).json({ success: false, message: "Percentage discount cannot exceed 100%" });
    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) return res.status(400).json({ success: false, message: "Coupon end date must be after the start date" });

    const coupon = await prisma.coupon.create({
      data: {
        code: parsed.data.code.toUpperCase(),
        description: parsed.data.description || null,
        discountType: parsed.data.discountType,
        discountValue: parsed.data.discountValue,
        minOrderAmount: parsed.data.minOrderAmount ?? null,
        maxDiscountAmount: parsed.data.maxDiscountAmount ?? null,
        usageLimit: parsed.data.usageLimit ?? null,
        startsAt,
        endsAt,
      },
    });
    res.status(201).json({ success: true, data: coupon });
  }),
);

router.patch(
  "/coupons/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid coupon update" });
    const coupon = await prisma.coupon.update({ where: { id: req.params.id }, data: { isActive: parsed.data.isActive } });
    res.json({ success: true, data: coupon });
  }),
);

const offerSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().optional().or(z.literal("")),
  badge: z.string().trim().max(60).optional().or(z.literal("")),
  ctaText: z.string().trim().max(60).optional().or(z.literal("")),
  ctaLink: z.string().trim().max(200).optional().or(z.literal("")),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

router.get(
  "/offers",
  asyncHandler(async (_req, res) => {
    const offers = await prisma.offer.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] });
    res.json({ success: true, data: offers });
  }),
);

router.post(
  "/offers",
  asyncHandler(async (req, res) => {
    const parsed = offerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid offer", errors: parsed.error.flatten() });
    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) return res.status(400).json({ success: false, message: "Offer end date must be after the start date" });
    const offer = await prisma.offer.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        badge: parsed.data.badge || null,
        ctaText: parsed.data.ctaText || null,
        ctaLink: parsed.data.ctaLink || null,
        startsAt,
        endsAt,
        priority: parsed.data.priority ?? 0,
      },
    });
    res.status(201).json({ success: true, data: offer });
  }),
);

router.patch(
  "/offers/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid offer update" });
    const offer = await prisma.offer.update({ where: { id: req.params.id }, data: { isActive: parsed.data.isActive } });
    res.json({ success: true, data: offer });
  }),
);

export default router;

