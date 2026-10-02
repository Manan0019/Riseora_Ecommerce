import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { signAuthToken } from "../utils/jwt";

const router = Router();
router.use(requireAuth);

const profileSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().min(8).max(20).optional().or(z.literal("")),
});

router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, adminRole: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ success: false, message: "Account not found" });
    res.json({ success: true, data: user });
  }),
);

router.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid profile details", errors: parsed.error.flatten() });

    if (parsed.data.phone) {
      const existing = await prisma.user.findFirst({ where: { phone: parsed.data.phone, id: { not: req.user!.id } }, select: { id: true } });
      if (existing) return res.status(409).json({ success: false, message: "Phone number is already used by another account" });
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName || null,
        phone: parsed.data.phone || null,
      },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, adminRole: true },
    });
    res.json({ success: true, data: user });
  }),
);


router.post(
  "/change-password",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      currentPassword: z.string().min(1).max(100),
      newPassword: z.string().min(8).max(100),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Enter your current password and a new password of at least 8 characters" });

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      return res.status(400).json({ success: false, message: "Current password is incorrect" });
    }
    if (await bcrypt.compare(parsed.data.newPassword, user.passwordHash)) {
      return res.status(400).json({ success: false, message: "Choose a new password different from your current password" });
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
      select: { id: true, email: true, role: true, tokenVersion: true },
    });
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    const token = signAuthToken({ sub: updated.id, email: updated.email, role: updated.role, ver: updated.tokenVersion });
    res.json({ success: true, data: { token }, message: "Password changed successfully." });
  }),
);

const addressSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(8).max(20),
  line1: z.string().trim().min(3).max(180),
  line2: z.string().trim().max(180).optional().or(z.literal("")),
  landmark: z.string().trim().max(180).optional().or(z.literal("")),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(4).max(12),
  country: z.string().trim().min(2).max(80).default("India"),
  type: z.enum(["HOME", "WORK", "OTHER"]).default("HOME"),
  isDefault: z.boolean().default(false),
});

router.get(
  "/addresses",
  asyncHandler(async (req, res) => {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    res.json({ success: true, data: addresses });
  }),
);

router.post(
  "/addresses",
  asyncHandler(async (req, res) => {
    const parsed = addressSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid address", errors: parsed.error.flatten() });

    const count = await prisma.address.count({ where: { userId: req.user!.id } });
    const makeDefault = parsed.data.isDefault || count === 0;

    const address = await prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
      return tx.address.create({
        data: {
          userId: req.user!.id,
          name: parsed.data.name,
          phone: parsed.data.phone,
          line1: parsed.data.line1,
          line2: parsed.data.line2 || null,
          landmark: parsed.data.landmark || null,
          city: parsed.data.city,
          state: parsed.data.state,
          postalCode: parsed.data.postalCode,
          country: parsed.data.country,
          type: parsed.data.type,
          isDefault: makeDefault,
        },
      });
    });

    res.status(201).json({ success: true, data: address });
  }),
);

router.patch(
  "/addresses/:id",
  asyncHandler(async (req, res) => {
    const parsed = addressSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid address update", errors: parsed.error.flatten() });

    const existing = await prisma.address.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
    if (!existing) return res.status(404).json({ success: false, message: "Address not found" });

    const address = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault === true) await tx.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
      return tx.address.update({
        where: { id: existing.id },
        data: {
          ...parsed.data,
          line2: parsed.data.line2 === "" ? null : parsed.data.line2,
          landmark: parsed.data.landmark === "" ? null : parsed.data.landmark,
        },
      });
    });

    res.json({ success: true, data: address });
  }),
);

router.delete(
  "/addresses/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.address.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
    if (!existing) return res.status(404).json({ success: false, message: "Address not found" });

    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id: existing.id } });
      if (existing.isDefault) {
        const next = await tx.address.findFirst({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });

    res.json({ success: true });
  }),
);


router.get(
  "/buy-again",
  asyncHandler(async (req, res) => {
    const rows = await prisma.orderItem.findMany({
      where: {
        isComplimentary: false,
        order: { userId: req.user!.id, status: "DELIVERED" },
        variant: { is: { isActive: true, product: { isActive: true } } },
      },
      include: {
        variant: {
          include: {
            product: {
              include: {
                category: true,
                images: { orderBy: { sortOrder: "asc" } },
                variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" } },
                reviews: { where: { isApproved: true }, select: { rating: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 120,
    });

    const seen = new Set<string>();
    const products: any[] = [];
    for (const row of rows) {
      const product = row.variant?.product;
      if (!product || seen.has(product.id)) continue;
      seen.add(product.id);
      const ratings = product.reviews || [];
      const ratingAverage = ratings.length ? ratings.reduce((sum, review) => sum + review.rating, 0) / ratings.length : 0;
      const { reviews: _reviews, ...rest } = product;
      products.push({ ...rest, ratingAverage: Number(ratingAverage.toFixed(1)), reviewCount: ratings.length });
      if (products.length >= 10) break;
    }
    res.json({ success: true, data: products });
  }),
);

router.post(
  "/reorder/:orderNumber",
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: { orderNumber: String(req.params.orderNumber), userId: req.user!.id },
      include: { items: true },
    });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.status !== "DELIVERED") return res.status(400).json({ success: false, message: "Buy Again is available after an order is delivered" });

    const sourceItems = order.items.filter((item) => !item.isComplimentary && item.variantId);
    const ids = [...new Set(sourceItems.map((item) => item.variantId!).filter(Boolean))];
    const variants = ids.length ? await prisma.productVariant.findMany({
      where: { id: { in: ids } },
      include: {
        product: {
          include: {
            category: true,
            images: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    }) : [];
    const variantMap = new Map<string, any>(variants.map((variant: any) => [variant.id, variant]));
    const usedByProduct = new Map<string, number>();
    const ready: any[] = [];
    const skipped: any[] = [];

    for (const item of sourceItems) {
      const variant = item.variantId ? variantMap.get(item.variantId) : null;
      if (!variant || !variant.isActive || !variant.product.isActive) {
        skipped.push({ sku: item.sku, productName: item.productName, reason: "No longer available" });
        continue;
      }
      const stock = Math.max(0, Number(variant.stockQuantity || 0));
      if (stock <= 0) {
        skipped.push({ sku: item.sku, productName: item.productName, reason: "Out of stock" });
        continue;
      }
      const limit = variant.product.maxPurchaseQuantity == null ? null : Number(variant.product.maxPurchaseQuantity);
      const already = usedByProduct.get(variant.productId) || 0;
      const room = limit == null ? stock : Math.max(0, limit - already);
      const quantity = Math.max(0, Math.min(Number(item.quantity || 1), stock, room));
      if (quantity <= 0) {
        skipped.push({ sku: item.sku, productName: item.productName, reason: "Current purchase limit reached" });
        continue;
      }
      usedByProduct.set(variant.productId, already + quantity);
      ready.push({
        product: variant.product,
        variant,
        quantity,
        previousUnitPrice: Number(item.unitPrice),
        currentUnitPrice: Number(variant.sellingPrice),
        priceChanged: Math.abs(Number(item.unitPrice) - Number(variant.sellingPrice)) >= 0.01,
      });
      if (quantity < Number(item.quantity || 1)) {
        skipped.push({ sku: item.sku, productName: item.productName, reason: `Quantity adjusted to ${quantity} for current stock/limits` });
      }
    }

    if (!ready.length) return res.status(409).json({ success: false, message: "None of the products from this order can currently be added again", data: { items: [], skipped } });
    res.json({
      success: true,
      data: {
        items: ready,
        skipped,
        priceChanged: ready.some((item) => item.priceChanged),
      },
      message: skipped.length ? "Available products are ready. Some items were adjusted or skipped." : "Order items refreshed using current prices and stock.",
    });
  }),
);


router.get(
  "/shopping-alerts",
  asyncHandler(async (req, res) => {
    const account = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true } });
    if (!account) return res.status(404).json({ success: false, message: "Account not found" });
    const [stock, price] = await Promise.all([
      prisma.stockAlert.findMany({
        where: { email: account.email },
        include: { variant: { include: { product: { select: { id: true, name: true, slug: true, images: { orderBy: { sortOrder: "asc" }, take: 1 } } } } } },
        orderBy: { subscribedAt: "desc" },
      }),
      prisma.priceAlert.findMany({
        where: { email: account.email },
        include: { variant: { include: { product: { select: { id: true, name: true, slug: true, images: { orderBy: { sortOrder: "asc" }, take: 1 } } } } } },
        orderBy: { subscribedAt: "desc" },
      }),
    ]);
    res.json({ success: true, data: { stock, price } });
  }),
);

router.delete(
  "/shopping-alerts/:kind/:id",
  asyncHandler(async (req, res) => {
    const account = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true } });
    if (!account) return res.status(404).json({ success: false, message: "Account not found" });
    const kind = String(req.params.kind);
    const id = String(req.params.id);
    if (kind === "stock") {
      const result = await prisma.stockAlert.updateMany({ where: { id, email: account.email, status: { not: "NOTIFIED" } }, data: { status: "CANCELLED" } });
      if (!result.count) return res.status(404).json({ success: false, message: "Active stock alert not found" });
    } else if (kind === "price") {
      const result = await prisma.priceAlert.updateMany({ where: { id, email: account.email, status: { not: "NOTIFIED" } }, data: { status: "CANCELLED" } });
      if (!result.count) return res.status(404).json({ success: false, message: "Active price alert not found" });
    } else {
      return res.status(400).json({ success: false, message: "Unknown alert type" });
    }
    res.json({ success: true, message: "Shopping alert cancelled." });
  }),
);

export default router;
