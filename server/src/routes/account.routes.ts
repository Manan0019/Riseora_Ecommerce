import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { createAuthSession, recordSecurityEvent, revokeAllAuthSessions } from "../services/auth-security.service";
import { buildReorderPreview, getOrderCare } from "../services/post-purchase.service";
import { getAccountLifecycleHub } from "../services/account-lifecycle.service";
import { AccountCartRevisionConflictError, getAccountCart, mergeAccountCart, resolveAccountCart, saveAccountCart } from "../services/account-cart.service";

const router = Router();
router.use(requireAuth);

const profileSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().min(8).max(20).optional().or(z.literal("")),
});

router.get(
  "/lifecycle",
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getAccountLifecycleHub(req.user!.id) });
  }),
);

const accountCartItemsSchema = z.array(z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
})).max(50);

const accountCartSchema = z.object({
  items: accountCartItemsSchema,
  savedForLater: accountCartItemsSchema.optional(),
  expectedRevision: z.number().int().min(0).optional(),
});

const accountCartResolveSchema = z.object({
  strategy: z.enum(["ACCOUNT", "BROWSER"]),
  items: accountCartItemsSchema.default([]),
  savedForLater: accountCartItemsSchema.default([]),
  expectedRevision: z.number().int().min(0),
});

router.get(
  "/cart",
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getAccountCart(req.user!.id) });
  }),
);

router.post(
  "/cart/merge",
  asyncHandler(async (req, res) => {
    const parsed = accountCartSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid saved bag contents" });
    res.json({ success: true, data: await mergeAccountCart(req.user!.id, parsed.data.items, parsed.data.savedForLater || []) });
  }),
);

router.put(
  "/cart",
  asyncHandler(async (req, res) => {
    const parsed = accountCartSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid saved bag contents" });
    try {
      res.json({ success: true, data: await saveAccountCart(req.user!.id, parsed.data.items, parsed.data.expectedRevision, parsed.data.savedForLater) });
    } catch (error) {
      if (error instanceof AccountCartRevisionConflictError) {
        return res.status(409).json({ success: false, code: error.code, message: error.message, data: error.current });
      }
      throw error;
    }
  }),
);

router.post(
  "/cart/resolve",
  asyncHandler(async (req, res) => {
    const parsed = accountCartResolveSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid Saved Bag resolution" });
    try {
      const data = await resolveAccountCart(req.user!.id, parsed.data.strategy, parsed.data.items, parsed.data.savedForLater, parsed.data.expectedRevision);
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof AccountCartRevisionConflictError) {
        return res.status(409).json({ success: false, code: error.code, message: error.message, data: error.current });
      }
      throw error;
    }
  }),
);

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
      data: { passwordHash, tokenVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null, lastPasswordChangedAt: new Date() },
      select: { id: true, email: true, role: true, tokenVersion: true },
    });
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await revokeAllAuthSessions(user.id, "PASSWORD_CHANGED");
    const { session, token } = await createAuthSession(updated, req);
    await recordSecurityEvent({ req, type: "PASSWORD_CHANGED", userId: user.id, sessionId: session.id, identity: user.email });
    res.json({ success: true, data: { token }, message: "Password changed successfully. Other sessions were signed out." });
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

router.get(
  "/reorder/:orderNumber/preview",
  asyncHandler(async (req, res) => {
    try {
      const data = await buildReorderPreview(req.user!.id, String(req.params.orderNumber), "reorder_preview");
      res.json({ success: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "REORDER_FAILED";
      if (message === "ORDER_NOT_FOUND") return res.status(404).json({ success: false, message: "Order not found" });
      if (message === "REORDER_NOT_AVAILABLE") return res.status(400).json({ success: false, message: "Buy Again is available after an order is delivered" });
      throw error;
    }
  }),
);

router.post(
  "/reorder/:orderNumber",
  asyncHandler(async (req, res) => {
    try {
      const data = await buildReorderPreview(req.user!.id, String(req.params.orderNumber), "reorder_add");
      if (!data.items.length) return res.status(409).json({ success: false, message: "None of the products from this order can currently be added again", data });
      res.json({
        success: true,
        data,
        message: data.skipped.length ? "Available products are ready. Some items were adjusted or skipped." : "Order items refreshed using current prices and stock.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "REORDER_FAILED";
      if (message === "ORDER_NOT_FOUND") return res.status(404).json({ success: false, message: "Order not found" });
      if (message === "REORDER_NOT_AVAILABLE") return res.status(400).json({ success: false, message: "Buy Again is available after an order is delivered" });
      throw error;
    }
  }),
);

router.get(
  "/order-care/:orderNumber",
  asyncHandler(async (req, res) => {
    try {
      const data = await getOrderCare(req.user!.id, String(req.params.orderNumber));
      res.json({ success: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ORDER_CARE_FAILED";
      if (message === "ORDER_NOT_FOUND") return res.status(404).json({ success: false, message: "Order not found" });
      throw error;
    }
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


router.post(
  "/addresses/from-checkout",
  asyncHandler(async (req, res) => {
    const parsed = addressSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid checkout address", errors: parsed.error.flatten() });
    const normalizedPostal = parsed.data.postalCode.replace(/\D/g, "");
    const existing = await prisma.address.findFirst({
      where: {
        userId: req.user!.id,
        line1: { equals: parsed.data.line1, mode: "insensitive" },
        city: { equals: parsed.data.city, mode: "insensitive" },
        postalCode: normalizedPostal,
      },
    });
    if (existing) return res.json({ success: true, data: existing, duplicate: true });

    const count = await prisma.address.count({ where: { userId: req.user!.id } });
    const makeDefault = parsed.data.isDefault || count === 0;
    const address = await prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
      return tx.address.create({ data: { userId: req.user!.id, ...parsed.data, postalCode: normalizedPostal, isDefault: makeDefault } });
    });
    res.status(201).json({ success: true, data: address });
  }),
);

export default router;
