import { createHash } from "node:crypto";
import type { CheckoutInput } from "./checkout.service";

function compact(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function money(value: unknown) {
  return Number(Number(value || 0).toFixed(2));
}

export function buildCheckoutReviewDigest(input: CheckoutInput, paymentMethod: "COD" | "ONLINE", prepared: any) {
  const address = input.shippingAddress || ({} as CheckoutInput["shippingAddress"]);
  const items = Array.isArray(prepared?.items) ? prepared.items : [];
  const snapshot = {
    version: 1,
    customer: {
      name: compact(input.customerName),
      email: compact(input.customerEmail).toLocaleLowerCase("en-IN"),
      phone: compact(input.customerPhone),
    },
    address: {
      line1: compact(address.line1),
      line2: compact(address.line2),
      landmark: compact(address.landmark),
      city: compact(address.city),
      state: compact(address.state),
      postalCode: compact(address.postalCode),
      country: compact(address.country || "India"),
    },
    paymentMethod,
    items: items
      .map((item: any) => ({
        variantId: String(item.variantId || ""),
        productId: String(item.productId || ""),
        productName: compact(item.productName),
        variantName: compact(item.variantName),
        sku: compact(item.sku),
        quantity: Number(item.quantity || 0),
        unitPrice: money(item.unitPrice),
        lineTotal: money(item.lineTotal),
        discountAmount: money(item.discountAmount),
        hsnCode: compact(item.hsnCode),
        gstRate: money(item.gstRate),
        complimentary: Boolean(item.isComplimentary),
        promotionLabel: compact(item.promotionLabel),
      }))
      .sort((a: any, b: any) => `${a.variantId}:${a.complimentary}`.localeCompare(`${b.variantId}:${b.complimentary}`)),
    pricing: {
      subtotal: money(prepared?.subtotal),
      automaticDiscountAmount: money(prepared?.automaticDiscountAmount),
      couponDiscountAmount: money(prepared?.couponDiscountAmount),
      discountAmount: money(prepared?.discountAmount),
      shippingFee: money(prepared?.shippingFee),
      totalAmount: money(prepared?.totalAmount),
      couponCode: compact(prepared?.coupon?.code).toUpperCase(),
      automaticPromotionName: compact(prepared?.automaticPromotionName),
    },
    delivery: {
      postalCode: compact(prepared?.delivery?.postalCode || address.postalCode),
      zoneId: compact(prepared?.delivery?.zoneId),
      zoneName: compact(prepared?.delivery?.zoneName),
      shippingPartnerId: compact(prepared?.delivery?.preferredShippingPartnerId),
      dispatchWithinDays: Number(prepared?.delivery?.dispatchWithinDays || 0),
      deliveryMinDays: Number(prepared?.delivery?.deliveryMinDays || 0),
      deliveryMaxDays: Number(prepared?.delivery?.deliveryMaxDays || 0),
      totalWeightGrams: Number(prepared?.delivery?.totalWeightGrams || 0),
      codAllowed: Boolean(prepared?.delivery?.codAllowed),
    },
  };

  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
