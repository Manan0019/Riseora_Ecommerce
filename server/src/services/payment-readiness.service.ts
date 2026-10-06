import { onlinePaymentsEnabled } from "./payment.service";
import { prepareCheckout, type CheckoutInput } from "./checkout.service";

const PAYMENT_READINESS_WINDOW_MS = 60 * 60 * 1000;
const MAX_PAYMENT_READINESS_EVENTS = 3000;

type PaymentReadinessEvent = {
  at: number;
  onlineAvailable: boolean;
  codAvailable: boolean;
  prepaidOnly: boolean;
  noMethod: boolean;
};

const paymentReadinessEvents: PaymentReadinessEvent[] = [];

function trimPaymentReadinessEvents(now = Date.now()) {
  const cutoff = now - PAYMENT_READINESS_WINDOW_MS;
  while (paymentReadinessEvents.length && paymentReadinessEvents[0].at < cutoff) paymentReadinessEvents.shift();
  if (paymentReadinessEvents.length > MAX_PAYMENT_READINESS_EVENTS) {
    paymentReadinessEvents.splice(0, paymentReadinessEvents.length - MAX_PAYMENT_READINESS_EVENTS);
  }
}

function money(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round((parsed + Number.EPSILON) * 100) / 100) : 0;
}

function recordPaymentReadiness(event: Omit<PaymentReadinessEvent, "at">) {
  paymentReadinessEvents.push({ ...event, at: Date.now() });
  trimPaymentReadinessEvents();
}

export async function getPaymentMethodReadiness(input: CheckoutInput, userId: string | null = null) {
  // ONLINE preparation is the canonical neutral pricing/delivery baseline. It does not
  // create a provider order, reserve stock or mutate checkout state.
  const onlinePrepared = await prepareCheckout(input, "ONLINE", userId, { enforceServiceability: true });
  const codAvailable = Boolean(onlinePrepared.codEligibility?.eligible);

  let codPrepared: Awaited<ReturnType<typeof prepareCheckout>> | null = null;
  if (codAvailable) {
    codPrepared = await prepareCheckout(input, "COD", userId, { enforceServiceability: true });
  }

  const online = {
    available: onlinePaymentsEnabled,
    provider: onlinePaymentsEnabled ? "RAZORPAY" : null,
    totalAmount: onlinePaymentsEnabled ? money(onlinePrepared.totalAmount) : null,
    shippingFee: onlinePaymentsEnabled ? money(onlinePrepared.shippingFee) : null,
    reasons: onlinePaymentsEnabled
      ? []
      : ["Secure online payment is not configured on this Riseora environment."],
    note: onlinePaymentsEnabled
      ? "Secure payment is configured. Provider availability is confirmed only when the payment session is created."
      : "Online payment remains unavailable until the payment provider credentials are configured.",
  };

  const codReasons = Array.isArray(onlinePrepared.codEligibility?.reasons)
    ? onlinePrepared.codEligibility.reasons.slice(0, 6)
    : [];
  const cod = {
    available: codAvailable,
    totalAmount: codPrepared ? money(codPrepared.totalAmount) : null,
    shippingFee: codPrepared ? money(codPrepared.shippingFee) : null,
    reasons: codReasons,
    openCodOrders: Number(onlinePrepared.codEligibility?.openCodOrders || 0),
    openCodOrderLimit: onlinePrepared.codEligibility?.openCodOrderLimit == null
      ? null
      : Number(onlinePrepared.codEligibility.openCodOrderLimit),
    prepaidOnlyProducts: Array.isArray(onlinePrepared.codEligibility?.prepaidOnlyProducts)
      ? onlinePrepared.codEligibility.prepaidOnlyProducts.slice(0, 6)
      : [],
  };

  const bothAvailable = online.available && cod.available;
  const prepaidOnly = online.available && !cod.available;
  const codOnly = !online.available && cod.available;
  const noMethod = !online.available && !cod.available;

  const onlineTotal = online.totalAmount == null ? null : Number(online.totalAmount);
  const codTotal = cod.totalAmount == null ? null : Number(cod.totalAmount);
  const lowerTotalMethod = bothAvailable && onlineTotal != null && codTotal != null && onlineTotal !== codTotal
    ? (onlineTotal < codTotal ? "ONLINE" : "COD")
    : null;
  const differenceAmount = bothAvailable && onlineTotal != null && codTotal != null
    ? money(Math.abs(onlineTotal - codTotal))
    : 0;

  recordPaymentReadiness({ onlineAvailable: online.available, codAvailable: cod.available, prepaidOnly, noMethod });

  return {
    ready: !noMethod,
    summary: noMethod
      ? "No payment method is currently available for this checkout."
      : bothAvailable
        ? "Both secure online payment and Cash on Delivery are available."
        : prepaidOnly
          ? "This checkout currently requires secure online payment."
          : "Cash on Delivery is available; secure online payment is not configured here.",
    recommendedMethod: lowerTotalMethod,
    recommendationReason: lowerTotalMethod
      ? `${lowerTotalMethod === "ONLINE" ? "Secure online payment" : "Cash on Delivery"} has the lower current checkout total by ₹${differenceAmount.toFixed(0)}.`
      : bothAvailable
        ? "Both methods currently have the same payable total. Choose the method you prefer."
        : prepaidOnly
          ? "Cash on Delivery is unavailable for one or more current checkout rules."
          : codOnly
            ? "Secure online payment is not configured on this Riseora environment."
            : "Review the payment restrictions below.",
    methods: { online, cod },
    context: {
      automaticPromotionName: onlinePrepared.automaticPromotionName || null,
      couponCode: onlinePrepared.coupon?.code ?? null,
      subtotal: money(onlinePrepared.subtotal),
      discountAmount: money(onlinePrepared.discountAmount),
      zoneName: onlinePrepared.delivery?.zoneName ?? null,
      postalCode: onlinePrepared.delivery?.postalCode || input.shippingAddress.postalCode,
    },
    policy: "Payment readiness is a read-only checkout preview. COD rules and totals are recalculated before order creation, and secure-online provider availability is confirmed only when a Razorpay payment session is created.",
  };
}

export function paymentReadinessHealth() {
  trimPaymentReadinessEvents();
  const checks = paymentReadinessEvents.length;
  const bothAvailable = paymentReadinessEvents.filter((event) => event.onlineAvailable && event.codAvailable).length;
  const prepaidOnly = paymentReadinessEvents.filter((event) => event.prepaidOnly).length;
  const codOnly = paymentReadinessEvents.filter((event) => !event.onlineAvailable && event.codAvailable).length;
  const noMethod = paymentReadinessEvents.filter((event) => event.noMethod).length;
  const codBlocked = paymentReadinessEvents.filter((event) => !event.codAvailable).length;

  return {
    windowMinutes: Math.round(PAYMENT_READINESS_WINDOW_MS / 60000),
    onlineConfigured: onlinePaymentsEnabled,
    provider: onlinePaymentsEnabled ? "RAZORPAY" : null,
    checks,
    bothAvailable,
    prepaidOnly,
    codOnly,
    noMethod,
    codBlocked,
    bothAvailableRatePercent: checks ? Number(((bothAvailable / checks) * 100).toFixed(1)) : 0,
    prepaidOnlyRatePercent: checks ? Number(((prepaidOnly / checks) * 100).toFixed(1)) : 0,
    note: "Rolling payment-readiness counters are aggregate in-memory signals. Customer identity, PIN codes, cart contents and payment credentials are not retained in these counters.",
  };
}
