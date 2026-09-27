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

export default router;
