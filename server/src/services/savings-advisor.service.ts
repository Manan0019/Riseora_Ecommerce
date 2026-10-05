import { prisma } from "../config/prisma";
import { prepareCheckout } from "./checkout.service";

export type SavingsAdvisorInput = {
  items: { variantId: string; quantity: number }[];
  paymentMethod?: "COD" | "ONLINE";
  customerEmail?: string;
  customerPhone?: string;
  postalCode?: string;
  currentCouponCode?: string;
};

type CouponPreview = {
  code: string;
  description: string | null;
  eligible: boolean;
  saving: number;
  totalAfterDiscount: number | null;
  minOrderAmount: number | null;
  endsAt: Date | null;
  privateReward: boolean;
  reason: string | null;
};

type SavingsTelemetry = {
  windowStartedAt: number;
  views: number;
  signedInViews: number;
  privateVoucherSuggestions: number;
  applyEvents: number;
  appliedSaving: number;
};

const WINDOW_MS = 60 * 60 * 1000;
let telemetry: SavingsTelemetry = {
  windowStartedAt: Date.now(),
  views: 0,
  signedInViews: 0,
  privateVoucherSuggestions: 0,
  applyEvents: 0,
  appliedSaving: 0,
};

function resetTelemetryIfNeeded() {
  if (Date.now() - telemetry.windowStartedAt < WINDOW_MS) return;
  telemetry = { windowStartedAt: Date.now(), views: 0, signedInViews: 0, privateVoucherSuggestions: 0, applyEvents: 0, appliedSaving: 0 };
}

function safeCouponReason(error: unknown) {
  const message = error instanceof Error ? error.message : "COUPON_INVALID";
  if (message === "COUPON_NOT_FOUND") return "Coupon code not found";
  if (message.startsWith("COUPON_INVALID:")) return message.slice("COUPON_INVALID:".length);
  if (message.startsWith("PURCHASE_LIMIT:")) return "Your cart needs an adjustment before this voucher can be checked";
  if (message.startsWith("PIN_UNSERVICEABLE:")) return "Delivery must be available before the final total can be confirmed";
  if (message.startsWith("COD_UNAVAILABLE:")) return "This saving can still be reviewed with online payment";
  if (message === "PRODUCT_UNAVAILABLE") return "One or more cart products are unavailable";
  return "This saving could not be checked right now";
}

function checkoutInput(input: SavingsAdvisorInput, couponCode = "") {
  return {
    customerName: "Savings preview",
    customerEmail: String(input.customerEmail || "").trim(),
    customerPhone: String(input.customerPhone || "").trim(),
    couponCode,
    shippingAddress: {
      line1: "Savings preview",
      city: "Preview",
      state: "Gujarat",
      postalCode: /^\d{6}$/.test(String(input.postalCode || "")) ? String(input.postalCode) : "",
      country: "India",
    },
    items: input.items,
  };
}

async function previewCoupon(input: SavingsAdvisorInput, userId: string | null, coupon: { code: string; description: string | null; minOrderAmount: unknown | null; endsAt: Date | null; rewardOwnerUserId: string | null }): Promise<CouponPreview> {
  try {
    // Savings guidance intentionally uses ONLINE for comparison so COD restrictions do not hide
    // an otherwise-valid coupon. Final checkout still revalidates the customer's chosen payment.
    const prepared = await prepareCheckout(checkoutInput(input, coupon.code), "ONLINE", userId, { enforceServiceability: false });
    return {
      code: coupon.code,
      description: coupon.description,
      eligible: Number(prepared.couponDiscountAmount || 0) > 0,
      saving: Number(prepared.couponDiscountAmount || 0),
      totalAfterDiscount: Number(prepared.totalAmount || 0),
      minOrderAmount: coupon.minOrderAmount == null ? null : Number(coupon.minOrderAmount),
      endsAt: coupon.endsAt,
      privateReward: Boolean(coupon.rewardOwnerUserId),
      reason: null,
    };
  } catch (error) {
    return {
      code: coupon.code,
      description: coupon.description,
      eligible: false,
      saving: 0,
      totalAfterDiscount: null,
      minOrderAmount: coupon.minOrderAmount == null ? null : Number(coupon.minOrderAmount),
      endsAt: coupon.endsAt,
      privateReward: Boolean(coupon.rewardOwnerUserId),
      reason: safeCouponReason(error),
    };
  }
}

export async function getSavingsAdvisor(input: SavingsAdvisorInput, userId: string | null) {
  resetTelemetryIfNeeded();
  telemetry.views += 1;
  if (userId) telemetry.signedInViews += 1;

  const now = new Date();
  const base = await prepareCheckout(checkoutInput(input), "ONLINE", userId, { enforceServiceability: false });
  const automatic = {
    name: base.automaticPromotionName || null,
    type: base.automaticPromotionType || null,
    saving: Number(base.automaticDiscountAmount || 0),
    freeItems: base.items.filter((item) => item.isComplimentary).map((item) => ({ productName: item.productName, variantName: item.variantName, quantity: item.quantity })),
  };

  const privateCoupons = userId ? await prisma.coupon.findMany({
    where: {
      rewardOwnerUserId: userId,
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { code: true, description: true, minOrderAmount: true, endsAt: true, rewardOwnerUserId: true, usageLimit: true, usageCount: true },
  }) : [];

  const activePrivateCoupons = privateCoupons.filter((coupon) => coupon.usageLimit == null || coupon.usageCount < coupon.usageLimit);
  const vouchers = await Promise.all(activePrivateCoupons.map((coupon) => previewCoupon(input, userId, coupon)));
  telemetry.privateVoucherSuggestions += vouchers.filter((voucher) => voucher.eligible).length;

  let currentCoupon: CouponPreview | null = null;
  const normalizedCurrent = String(input.currentCouponCode || "").trim().toUpperCase();
  if (normalizedCurrent) {
    const existingPrivate = activePrivateCoupons.find((coupon) => coupon.code === normalizedCurrent);
    if (existingPrivate) currentCoupon = vouchers.find((voucher) => voucher.code === normalizedCurrent) || null;
    else {
      // Only evaluate a non-private code that the customer already supplied. Never discover or expose
      // unrelated admin coupon codes through the advisor.
      const coupon = await prisma.coupon.findUnique({
        where: { code: normalizedCurrent },
        select: { code: true, description: true, minOrderAmount: true, endsAt: true, rewardOwnerUserId: true },
      });
      if (coupon && (!coupon.rewardOwnerUserId || coupon.rewardOwnerUserId === userId)) currentCoupon = await previewCoupon(input, userId, coupon);
      else if (coupon?.rewardOwnerUserId) currentCoupon = { code: normalizedCurrent, description: null, eligible: false, saving: 0, totalAfterDiscount: null, minOrderAmount: null, endsAt: null, privateReward: true, reason: "This private rewards voucher belongs to another Riseora account" };
      else currentCoupon = { code: normalizedCurrent, description: null, eligible: false, saving: 0, totalAfterDiscount: null, minOrderAmount: null, endsAt: null, privateReward: false, reason: "Coupon code not found" };
    }
  }

  const candidates = [...vouchers, ...(currentCoupon ? [currentCoupon] : [])].filter((item) => item.eligible);
  const bestCoupon = candidates.sort((a, b) => b.saving - a.saving || a.code.localeCompare(b.code))[0] || null;
  const storeOffers = await prisma.offer.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 4,
    select: { id: true, title: true, description: true, badge: true, ctaText: true, ctaLink: true, endsAt: true },
  });

  return {
    signedIn: Boolean(userId),
    automatic,
    vouchers,
    currentCoupon,
    bestCoupon,
    bestPotentialSaving: Number(automatic.saving || 0) + Number(bestCoupon?.saving || 0),
    baselineTotal: Number(base.totalAmount || 0),
    storeOffers,
    policy: "Riseora automatically surfaces only automatic deals and your own private reward vouchers. Other coupon codes remain manual and are always revalidated at checkout.",
  };
}

export function recordSavingsAdvisorEvent(input: { type: "APPLY"; saving?: number }) {
  resetTelemetryIfNeeded();
  if (input.type === "APPLY") {
    telemetry.applyEvents += 1;
    telemetry.appliedSaving += Math.max(0, Math.min(100000, Number(input.saving || 0)));
  }
}

export function adminSavingsAdvisorHealth() {
  resetTelemetryIfNeeded();
  return {
    windowMinutes: 60,
    views: telemetry.views,
    signedInViews: telemetry.signedInViews,
    privateVoucherSuggestions: telemetry.privateVoucherSuggestions,
    applyEvents: telemetry.applyEvents,
    averageAppliedSaving: telemetry.applyEvents ? Math.round((telemetry.appliedSaving / telemetry.applyEvents) * 100) / 100 : 0,
    privacy: "Aggregated in-memory operational counters only; no cart contents or customer identity are retained here.",
  };
}
