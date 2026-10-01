export type CouponLike = {
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: unknown;
  minOrderAmount: unknown | null;
  maxDiscountAmount: unknown | null;
  usageLimit: number | null;
  usageCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
};

export function evaluateCoupon(coupon: CouponLike, orderSubtotal: number, discountBase = orderSubtotal, now = new Date()) {
  if (!coupon.isActive) return { valid: false as const, message: "This coupon is inactive" };
  if (coupon.startsAt && coupon.startsAt > now) return { valid: false as const, message: "This coupon is not active yet" };
  if (coupon.endsAt && coupon.endsAt < now) return { valid: false as const, message: "This coupon has expired" };
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) return { valid: false as const, message: "This coupon has reached its usage limit" };

  const minimum = coupon.minOrderAmount === null ? 0 : Number(coupon.minOrderAmount);
  if (orderSubtotal < minimum) return { valid: false as const, message: `Minimum order value is ₹${minimum.toFixed(0)}` };
  if (discountBase <= 0) return { valid: false as const, message: "This coupon does not apply to the products in your cart" };

  const value = Number(coupon.discountValue);
  let discount = coupon.discountType === "PERCENTAGE" ? discountBase * (value / 100) : value;
  if (coupon.maxDiscountAmount !== null) discount = Math.min(discount, Number(coupon.maxDiscountAmount));
  discount = Math.max(0, Math.min(discount, discountBase));

  return { valid: true as const, discountAmount: Math.round(discount * 100) / 100, discountBase };
}
