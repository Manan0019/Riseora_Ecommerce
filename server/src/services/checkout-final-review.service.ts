import type { CheckoutInput } from "./checkout.service";
import { prepareCheckout } from "./checkout.service";
import { buildCheckoutReviewDigest } from "./checkout-review-signature";

const REVIEW_WINDOW_MS = 60 * 60 * 1000;
const MAX_EVENTS = 3000;

type ReviewEventType = "PREVIEW" | "CONFIRMED" | "CHANGED";
type ReviewEvent = { at: number; type: ReviewEventType; paymentMethod: "COD" | "ONLINE" };
const reviewEvents: ReviewEvent[] = [];

function trimReviewEvents(now = Date.now()) {
  const cutoff = now - REVIEW_WINDOW_MS;
  while (reviewEvents.length && reviewEvents[0].at < cutoff) reviewEvents.shift();
  if (reviewEvents.length > MAX_EVENTS) reviewEvents.splice(0, reviewEvents.length - MAX_EVENTS);
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + Math.max(0, Math.round(days)));
  return date.toISOString().slice(0, 10);
}

function maskPhone(value: unknown) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return raw;
  return `${digits.length > 4 ? "•".repeat(Math.min(6, digits.length - 4)) : ""}${digits.slice(-4)}`;
}

export async function getCheckoutFinalReview(input: CheckoutInput, paymentMethod: "COD" | "ONLINE", userId: string | null = null) {
  const prepared = await prepareCheckout(input, paymentMethod, userId, { enforceServiceability: true });
  const dispatchWithinDays = Math.max(0, Number(prepared.delivery?.dispatchWithinDays || 0));
  const deliveryMinDays = Math.max(1, Number(prepared.delivery?.deliveryMinDays || 1));
  const deliveryMaxDays = Math.max(deliveryMinDays, Number(prepared.delivery?.deliveryMaxDays || deliveryMinDays));
  const digest = buildCheckoutReviewDigest(input, paymentMethod, prepared);
  const paidItems = prepared.items.filter((item: any) => !item.isComplimentary);
  const freeItems = prepared.items.filter((item: any) => item.isComplimentary);

  reviewEvents.push({ at: Date.now(), type: "PREVIEW", paymentMethod });
  trimReviewEvents();

  return {
    ready: true,
    digest,
    generatedAt: new Date().toISOString(),
    itemSummary: {
      paidLines: paidItems.length,
      paidUnits: paidItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
      freeLines: freeItems.length,
      freeUnits: freeItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
      items: prepared.items.map((item: any) => ({
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice || 0),
        lineTotal: Number(item.lineTotal || 0),
        discountAmount: Number(item.discountAmount || 0),
        isComplimentary: Boolean(item.isComplimentary),
        promotionLabel: item.promotionLabel || null,
      })),
    },
    delivery: {
      recipient: String(input.customerName || "").trim(),
      phoneMasked: maskPhone(input.customerPhone),
      city: String(input.shippingAddress.city || "").trim(),
      state: String(input.shippingAddress.state || "").trim(),
      postalCode: String(prepared.delivery?.postalCode || input.shippingAddress.postalCode || "").trim(),
      zoneName: prepared.delivery?.zoneName ?? null,
      shippingPartnerName: prepared.delivery?.preferredShippingPartnerName ?? null,
      estimatedFrom: addDaysIso(dispatchWithinDays + deliveryMinDays),
      estimatedTo: addDaysIso(dispatchWithinDays + deliveryMaxDays),
    },
    payment: {
      method: paymentMethod,
      label: paymentMethod === "ONLINE" ? "Secure online payment" : "Cash on Delivery",
    },
    pricing: {
      subtotal: Number(prepared.subtotal || 0),
      automaticDiscountAmount: Number(prepared.automaticDiscountAmount || 0),
      couponDiscountAmount: Number(prepared.couponDiscountAmount || 0),
      discountAmount: Number(prepared.discountAmount || 0),
      shippingFee: Number(prepared.shippingFee || 0),
      totalAmount: Number(prepared.totalAmount || 0),
      couponCode: prepared.coupon?.code ?? null,
      automaticPromotionName: prepared.automaticPromotionName ?? null,
    },
    policy: "This final review is a read-only server snapshot. Riseora rechecks the same digest again before COD order creation or online-payment reservation; stock, price, promotion, delivery or payment changes require a fresh customer confirmation.",
  };
}

export function recordCheckoutFinalReviewEvent(type: Exclude<ReviewEventType, "PREVIEW">, paymentMethod: "COD" | "ONLINE") {
  reviewEvents.push({ at: Date.now(), type, paymentMethod });
  trimReviewEvents();
}

export function checkoutFinalReviewHealth() {
  trimReviewEvents();
  const previews = reviewEvents.filter((event) => event.type === "PREVIEW").length;
  const confirmations = reviewEvents.filter((event) => event.type === "CONFIRMED").length;
  const changes = reviewEvents.filter((event) => event.type === "CHANGED").length;
  const onlineConfirmations = reviewEvents.filter((event) => event.type === "CONFIRMED" && event.paymentMethod === "ONLINE").length;
  const codConfirmations = reviewEvents.filter((event) => event.type === "CONFIRMED" && event.paymentMethod === "COD").length;
  return {
    windowMinutes: Math.round(REVIEW_WINDOW_MS / 60000),
    previews,
    confirmations,
    changes,
    confirmationRatePercent: previews ? Number(((confirmations / previews) * 100).toFixed(1)) : 0,
    changedAfterReviewRatePercent: confirmations ? Number(((changes / confirmations) * 100).toFixed(1)) : 0,
    paymentMix: { onlineConfirmations, codConfirmations },
    privacy: "Final-review telemetry stores only aggregate event type and payment-method counters. Customer identity, address, cart contents and review digests are not retained in telemetry.",
  };
}
