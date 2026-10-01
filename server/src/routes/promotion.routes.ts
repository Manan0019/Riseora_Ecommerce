import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/async-handler";
import { optionalAuth } from "../middleware/auth";
import { evaluateCoupon } from "../utils/coupon";
import type { CouponLike } from "../utils/coupon";
import { prepareCheckout } from "../services/checkout.service";

const router = Router();

router.get(
  "/offers",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const offers = await prisma.offer.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    res.json({ success: true, data: offers });
  }),
);


router.get(
  "/banners",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const placement = req.query.placement === "HOME_STRIP" ? "HOME_STRIP" : "HOME_HERO";
    const banners = await prisma.banner.findMany({
      where: {
        placement,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    res.json({ success: true, data: banners });
  }),
);


const cartPreviewSchema = z.object({
  paymentMethod: z.enum(["COD", "ONLINE"]).default("COD"),
  couponCode: z.string().trim().max(40).optional().or(z.literal("")),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  customerPhone: z.string().trim().max(24).optional().or(z.literal("")),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1) })).min(1),
});

router.post(
  "/cart-preview",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = cartPreviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid cart" });
    try {
      const prepared = await prepareCheckout({
        customerName: "Preview", customerEmail: parsed.data.customerEmail || "", customerPhone: parsed.data.customerPhone || "", couponCode: parsed.data.couponCode || "",
        shippingAddress: { line1: "Preview", city: "Preview", state: "Gujarat", postalCode: "0000", country: "India" },
        items: parsed.data.items,
      }, parsed.data.paymentMethod, req.user?.id ?? null);
      res.json({
        success: true,
        data: {
          subtotal: prepared.subtotal, shippingFee: prepared.shippingFee, discountAmount: prepared.discountAmount,
          couponDiscountAmount: prepared.couponDiscountAmount, automaticDiscountAmount: prepared.automaticDiscountAmount,
          automaticPromotionName: prepared.automaticPromotionName, automaticPromotionType: prepared.automaticPromotionType,
          promotionValue: prepared.promotionValue, totalAmount: prepared.totalAmount,
          freeItems: prepared.items.filter((item) => item.isComplimentary),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "PREVIEW_FAILED";
      if (message === "PRODUCT_UNAVAILABLE") return res.status(400).json({ success: false, message: "One or more products are unavailable" });
      if (message.startsWith("PURCHASE_LIMIT:")) {
        const [, productName, limit] = message.split(":");
        return res.status(400).json({ success: false, message: `${productName} is limited to ${limit} per order.` });
      }
      if (message.startsWith("COD_UNAVAILABLE:")) return res.status(400).json({ success: false, message: message.slice("COD_UNAVAILABLE:".length) });
      if (message === "COUPON_NOT_FOUND") return res.status(400).json({ success: false, message: "Coupon code not found" });
      if (message.startsWith("COUPON_INVALID:")) return res.status(400).json({ success: false, message: message.slice("COUPON_INVALID:".length) });
      throw error;
    }
  }),
);

const validateCouponSchema = z.object({
  code: z.string().trim().min(3).max(40),
  subtotal: z.number().nonnegative(),
});

router.post(
  "/coupons/validate",
  asyncHandler(async (req, res) => {
    const parsed = validateCouponSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid coupon request" });

    const coupon = await prisma.coupon.findUnique({ where: { code: parsed.data.code.toUpperCase() } });
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon code not found" });

    if ((coupon as any).scope && (coupon as any).scope !== "ORDER") return res.status(400).json({ success: false, message: "Product/category coupons must be validated against the cart" });
    const result = evaluateCoupon(coupon as unknown as CouponLike, parsed.data.subtotal, parsed.data.subtotal);
    if (!result.valid) return res.status(400).json({ success: false, message: result.message });

    res.json({
      success: true,
      data: {
        code: coupon.code,
        discountAmount: result.discountAmount,
        totalAfterDiscount: Math.max(0, parsed.data.subtotal - result.discountAmount),
        description: coupon.description,
      },
    });
  }),
);

export default router;
