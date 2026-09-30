import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/async-handler";
import { evaluateCoupon } from "../utils/coupon";
import type { CouponLike } from "../utils/coupon";

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

    const result = evaluateCoupon(coupon as unknown as CouponLike, parsed.data.subtotal);
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
