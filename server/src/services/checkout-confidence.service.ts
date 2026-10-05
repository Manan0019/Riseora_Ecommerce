import { prisma } from "../config/prisma";
import type { CheckoutInput } from "./checkout.service";
import { prepareCheckout } from "./checkout.service";

export type CheckoutPaymentMethod = "COD" | "ONLINE";

const CHECKOUT_WINDOW_MS = 60 * 60 * 1000;
const MAX_EVENTS = 3000;

export type CheckoutFunnelStage =
  | "view"
  | "delivery_ready"
  | "payment_selected"
  | "preflight_pass"
  | "preflight_fail"
  | "submit"
  | "success"
  | "payment_recovery";

type CheckoutFunnelEvent = {
  at: number;
  sessionId: string;
  stage: CheckoutFunnelStage;
  mode: "cart" | "buy-now";
  paymentMethod: CheckoutPaymentMethod | null;
  reasonCode: string | null;
};

const funnelEvents: CheckoutFunnelEvent[] = [];

function trimFunnelEvents(now = Date.now()) {
  const cutoff = now - CHECKOUT_WINDOW_MS;
  while (funnelEvents.length && funnelEvents[0].at < cutoff) funnelEvents.shift();
  if (funnelEvents.length > MAX_EVENTS) funnelEvents.splice(0, funnelEvents.length - MAX_EVENTS);
}

function sanitizeReasonCode(value: unknown) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 60) || null;
}

export function recordCheckoutFunnelEvent(input: {
  sessionId: string;
  stage: CheckoutFunnelStage;
  mode?: "cart" | "buy-now";
  paymentMethod?: CheckoutPaymentMethod;
  reasonCode?: string;
}) {
  funnelEvents.push({
    at: Date.now(),
    sessionId: String(input.sessionId || "").slice(0, 80),
    stage: input.stage,
    mode: input.mode === "buy-now" ? "buy-now" : "cart",
    paymentMethod: input.paymentMethod === "ONLINE" ? "ONLINE" : input.paymentMethod === "COD" ? "COD" : null,
    reasonCode: sanitizeReasonCode(input.reasonCode),
  });
  trimFunnelEvents();
}

function uniqueSessions(stage: CheckoutFunnelStage) {
  return new Set(funnelEvents.filter((event) => event.stage === stage).map((event) => event.sessionId)).size;
}

export function checkoutConfidenceSnapshot() {
  trimFunnelEvents();
  const views = uniqueSessions("view");
  const deliveryReady = uniqueSessions("delivery_ready");
  const preflightPass = uniqueSessions("preflight_pass");
  const preflightFail = uniqueSessions("preflight_fail");
  const submits = uniqueSessions("submit");
  const successes = uniqueSessions("success");
  const paymentRecovery = uniqueSessions("payment_recovery");

  const reasons = new Map<string, number>();
  for (const event of funnelEvents.filter((row) => row.stage === "preflight_fail" && row.reasonCode)) {
    reasons.set(event.reasonCode!, (reasons.get(event.reasonCode!) || 0) + 1);
  }

  const paymentSessions = new Map<string, CheckoutPaymentMethod>();
  for (const event of funnelEvents.filter((row) => row.stage === "submit" && row.paymentMethod)) {
    paymentSessions.set(event.sessionId, event.paymentMethod!);
  }
  const codSubmits = [...paymentSessions.values()].filter((value) => value === "COD").length;
  const onlineSubmits = [...paymentSessions.values()].filter((value) => value === "ONLINE").length;

  const rate = (value: number, base = views) => base ? Number(((value / base) * 100).toFixed(1)) : 0;
  return {
    windowMinutes: Math.round(CHECKOUT_WINDOW_MS / 60000),
    sessions: views,
    deliveryReady,
    preflightPass,
    preflightFail,
    submits,
    successes,
    paymentRecovery,
    deliveryReadyRatePercent: rate(deliveryReady),
    preflightPassRatePercent: rate(preflightPass),
    submitRatePercent: rate(submits),
    completionRatePercent: rate(successes),
    paymentMix: {
      cod: codSubmits,
      online: onlineSubmits,
      codPercent: paymentSessions.size ? Number(((codSubmits / paymentSessions.size) * 100).toFixed(1)) : 0,
      onlinePercent: paymentSessions.size ? Number(((onlineSubmits / paymentSessions.size) * 100).toFixed(1)) : 0,
    },
    failureReasons: [...reasons.entries()]
      .map(([reasonCode, count]) => ({ reasonCode, count }))
      .sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode))
      .slice(0, 8),
  };
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + Math.max(0, Math.round(days)));
  return date.toISOString().slice(0, 10);
}

function failureInfo(error: unknown) {
  const raw = error instanceof Error ? error.message : "CHECKOUT_UNAVAILABLE";
  if (raw === "PRODUCT_UNAVAILABLE") return { code: "PRODUCT_UNAVAILABLE", message: "One or more products are no longer available." };
  if (raw.startsWith("PURCHASE_LIMIT:")) {
    const [, productName, limit] = raw.split(":");
    return { code: "PURCHASE_LIMIT", message: `${productName || "A product"} is limited to ${limit || "the allowed quantity"} per order.` };
  }
  if (raw.startsWith("PIN_UNSERVICEABLE:")) return { code: "PIN_UNSERVICEABLE", message: raw.slice("PIN_UNSERVICEABLE:".length) };
  if (raw.startsWith("COD_UNAVAILABLE:")) return { code: "COD_UNAVAILABLE", message: raw.slice("COD_UNAVAILABLE:".length) };
  if (raw === "COUPON_NOT_FOUND") return { code: "COUPON_NOT_FOUND", message: "Coupon code not found." };
  if (raw.startsWith("COUPON_INVALID:")) return { code: "COUPON_INVALID", message: raw.slice("COUPON_INVALID:".length) };
  if (raw === "COUPON_LIMIT_REACHED") return { code: "COUPON_LIMIT_REACHED", message: "This coupon has reached its usage limit." };
  if (raw.startsWith("OUT_OF_STOCK:")) return { code: "OUT_OF_STOCK", message: `Not enough stock for ${raw.slice("OUT_OF_STOCK:".length)}.` };
  return { code: "CHECKOUT_UNAVAILABLE", message: "Checkout readiness could not be verified right now. Please review your details and try again." };
}

export async function getCheckoutReadiness(input: CheckoutInput, paymentMethod: CheckoutPaymentMethod, userId: string | null = null) {
  try {
    const prepared = await prepareCheckout(input, paymentMethod, userId, { enforceServiceability: true });
    const requested = new Map<string, number>();
    for (const item of input.items) requested.set(item.variantId, (requested.get(item.variantId) || 0) + Math.max(1, Number(item.quantity || 1)));

    const variants = await prisma.productVariant.findMany({
      where: { id: { in: [...requested.keys()] }, isActive: true, product: { isActive: true } },
      select: {
        id: true,
        sku: true,
        stockQuantity: true,
        safetyStock: true,
        product: { select: { name: true } },
      },
    });

    const stockIssues = variants
      .map((variant) => {
        const requestedQuantity = requested.get(variant.id) || 0;
        const availableQuantity = Math.max(0, Number(variant.stockQuantity || 0) - Math.max(0, Number(variant.safetyStock || 0)));
        return requestedQuantity > availableQuantity
          ? { variantId: variant.id, sku: variant.sku, productName: variant.product.name, requestedQuantity, availableQuantity }
          : null;
      })
      .filter(Boolean);

    if (variants.length !== requested.size) {
      return {
        ready: false,
        code: "PRODUCT_UNAVAILABLE",
        message: "One or more products are no longer available.",
        checks: { catalog: false, stock: false, delivery: Boolean(prepared.delivery?.serviceable), payment: false, pricing: true },
        stockIssues,
      };
    }

    const stockReady = stockIssues.length === 0;
    const paymentReady = paymentMethod === "COD" ? Boolean(prepared.codEligibility?.eligible) : true;
    const deliveryReady = Boolean(prepared.delivery?.serviceable);
    const ready = stockReady && paymentReady && deliveryReady;
    const dispatchWithinDays = Math.max(0, Number(prepared.delivery?.dispatchWithinDays || 0));
    const deliveryMinDays = Math.max(1, Number(prepared.delivery?.deliveryMinDays || 1));
    const deliveryMaxDays = Math.max(deliveryMinDays, Number(prepared.delivery?.deliveryMaxDays || deliveryMinDays));

    return {
      ready,
      code: ready ? "READY" : !stockReady ? "OUT_OF_STOCK" : !deliveryReady ? "PIN_UNSERVICEABLE" : "PAYMENT_UNAVAILABLE",
      message: ready
        ? "Your products, delivery area, payment option and final total are ready."
        : !stockReady
          ? "One or more products no longer have enough available stock."
          : !deliveryReady
            ? prepared.delivery?.reason || "Delivery is unavailable for this PIN code."
            : prepared.codEligibility?.reasons?.[0] || "The selected payment option is unavailable.",
      checks: {
        catalog: true,
        stock: stockReady,
        delivery: deliveryReady,
        payment: paymentReady,
        pricing: true,
      },
      stockIssues,
      pricing: {
        subtotal: prepared.subtotal,
        discountAmount: prepared.discountAmount,
        shippingFee: prepared.shippingFee,
        totalAmount: prepared.totalAmount,
        couponCode: prepared.coupon?.code ?? null,
        automaticPromotionName: prepared.automaticPromotionName,
      },
      delivery: {
        postalCode: prepared.delivery?.postalCode || input.shippingAddress.postalCode,
        zoneName: prepared.delivery?.zoneName ?? null,
        shippingPartnerName: prepared.delivery?.preferredShippingPartnerName ?? null,
        dispatchWithinDays,
        deliveryMinDays,
        deliveryMaxDays,
        estimatedFrom: addDaysIso(dispatchWithinDays + deliveryMinDays),
        estimatedTo: addDaysIso(dispatchWithinDays + deliveryMaxDays),
        codAllowed: Boolean(prepared.delivery?.codAllowed),
      },
    };
  } catch (error) {
    const failure = failureInfo(error);
    return {
      ready: false,
      ...failure,
      checks: {
        catalog: failure.code !== "PRODUCT_UNAVAILABLE",
        stock: !["PRODUCT_UNAVAILABLE", "OUT_OF_STOCK"].includes(failure.code),
        delivery: failure.code !== "PIN_UNSERVICEABLE",
        payment: failure.code !== "COD_UNAVAILABLE",
        pricing: !["COUPON_NOT_FOUND", "COUPON_INVALID", "COUPON_LIMIT_REACHED"].includes(failure.code),
      },
      stockIssues: [],
    };
  }
}
