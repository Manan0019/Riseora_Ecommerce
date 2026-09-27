import { Router } from "express";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/async-handler";

const router = Router();

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
              ],
            }
          : {}),
      },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        variants: {
          where: { isActive: true },
          orderBy: { sellingPrice: "asc" },
        },
      },
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    });

    res.json({ success: true, data: products });
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
        variants: {
          where: { isActive: true },
          orderBy: { sellingPrice: "asc" },
        },
      },
    });

    if (!product?.isActive) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.json({ success: true, data: product });
  }),
);

export default router;
