import { prisma } from "../config/prisma";
import { prepareCheckout } from "./checkout.service";
import { getShippingQuote, normalizePostalCode } from "./shipping-zone.service";
import { getStoreSettings } from "./store.service";

type DeliveryPreviewEvent = {
  at: number;
  serviceable: boolean;
  matched: boolean;
  codEligible: boolean;
  weightBlocked: boolean;
};

const PREVIEW_WINDOW_MS = 60 * 60 * 1000;
const previewEvents: DeliveryPreviewEvent[] = [];

function trimPreviewEvents(now = Date.now()) {
  const cutoff = now - PREVIEW_WINDOW_MS;
  while (previewEvents.length && previewEvents[0].at < cutoff) previewEvents.shift();
  if (previewEvents.length > 3000) previewEvents.splice(0, previewEvents.length - 3000);
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + Math.max(0, Math.round(days)));
  return date.toISOString().slice(0, 10);
}

function money(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round((parsed + Number.EPSILON) * 100) / 100) : 0;
}

function recordPreview(event: Omit<DeliveryPreviewEvent, "at">) {
  previewEvents.push({ ...event, at: Date.now() });
  trimPreviewEvents();
}

export async function getDeliveryPromisePreview(input: {
  postalCode: unknown;
  items: { variantId: string; quantity: number }[];
}, userId: string | null = null) {
  const postalCode = normalizePostalCode(input.postalCode);
  if (!/^\d{6}$/.test(postalCode)) throw new Error("INVALID_POSTAL_CODE");

  const items = Array.isArray(input.items)
    ? input.items.slice(0, 50).map((item) => ({
        variantId: String(item?.variantId || ""),
        quantity: Math.max(1, Math.min(99, Math.trunc(Number(item?.quantity || 1)))),
      })).filter((item) => item.variantId)
    : [];
  if (!items.length) throw new Error("EMPTY_CART");

  // Reuse the canonical checkout preparation path so automatic promotions, free-gift
  // parcel weight, product COD rules and delivery-zone resolution do not drift.
  const prepared = await prepareCheckout({
    customerName: "Delivery preview",
    customerEmail: "",
    customerPhone: "",
    shippingAddress: { line1: "Delivery preview", city: "Preview", state: "Gujarat", postalCode, country: "India" },
    items,
  }, "ONLINE", userId, { enforceServiceability: false });

  const delivery = prepared.delivery;
  const settings = await getStoreSettings();
  const merchandiseAfterDiscount = money(prepared.subtotal - prepared.discountAmount);
  const codQuote = await getShippingQuote({
    postalCode,
    merchandiseAfterDiscount,
    paymentMethod: "COD",
    totalWeightGrams: Number(delivery?.totalWeightGrams || 0),
    settings,
  });

  const freeShippingThreshold = delivery?.freeShippingThresholdOverride == null
    ? (settings.freeShippingThreshold == null ? null : Number(settings.freeShippingThreshold))
    : Number(delivery.freeShippingThresholdOverride);
  const freeShippingGap = freeShippingThreshold == null
    ? null
    : Math.max(0, money(freeShippingThreshold - merchandiseAfterDiscount));
  const dispatchWithinDays = Math.max(0, Number(delivery?.dispatchWithinDays ?? settings.dispatchWithinDays ?? 2));
  const deliveryMinDays = Math.max(1, Number(delivery?.deliveryMinDays ?? settings.deliveryMinDays ?? 3));
  const deliveryMaxDays = Math.max(deliveryMinDays, Number(delivery?.deliveryMaxDays ?? settings.deliveryMaxDays ?? 7));
  const deliveryReason = String(delivery?.reason || "");
  const weightBlocked = Boolean(
    (delivery?.maxWeightGrams != null && Number(delivery.totalWeightGrams || 0) > Number(delivery.maxWeightGrams))
    || /supports orders up to|cannot carry this order weight/i.test(deliveryReason),
  );
  const codEligible = Boolean(delivery?.serviceable && prepared.codEligibility?.eligible);

  recordPreview({
    serviceable: Boolean(delivery?.serviceable),
    matched: Boolean(delivery?.matched),
    codEligible,
    weightBlocked,
  });

  return {
    postalCode,
    serviceable: Boolean(delivery?.serviceable),
    matched: Boolean(delivery?.matched),
    strict: Boolean(delivery?.strict),
    reason: delivery?.reason || "Delivery rules are being evaluated for this PIN code.",
    zone: {
      name: delivery?.zoneName ?? null,
      city: delivery?.city ?? null,
      state: delivery?.state ?? null,
      preferredShippingPartnerName: delivery?.preferredShippingPartnerName ?? null,
    },
    parcel: {
      totalWeightGrams: Math.max(0, Number(delivery?.totalWeightGrams || 0)),
      maxWeightGrams: delivery?.maxWeightGrams == null ? null : Math.max(0, Number(delivery.maxWeightGrams)),
      weightBlocked,
    },
    promise: {
      dispatchWithinDays,
      deliveryMinDays,
      deliveryMaxDays,
      estimatedFrom: addDaysIso(dispatchWithinDays + deliveryMinDays),
      estimatedTo: addDaysIso(dispatchWithinDays + deliveryMaxDays),
    },
    pricing: {
      subtotal: money(prepared.subtotal),
      automaticDiscountAmount: money(prepared.automaticDiscountAmount),
      automaticPromotionName: prepared.automaticPromotionName || null,
      merchandiseAfterAutomaticDiscount: merchandiseAfterDiscount,
      onlineShippingEstimate: money(prepared.shippingFee),
      codShippingEstimate: money(codQuote.shippingFee),
      freeShippingThreshold: freeShippingThreshold == null ? null : money(freeShippingThreshold),
      freeShippingGap,
    },
    cod: {
      eligible: codEligible,
      reasons: Array.isArray(prepared.codEligibility?.reasons) ? prepared.codEligibility.reasons.slice(0, 5) : [],
      openCodOrders: Number(prepared.codEligibility?.openCodOrders || 0),
      openCodOrderLimit: prepared.codEligibility?.openCodOrderLimit == null ? null : Number(prepared.codEligibility.openCodOrderLimit),
    },
    policy: "Delivery estimates use the live Riseora shipping-zone, parcel-weight and automatic-promotion rules. Coupons, final shipping and payment eligibility are recalculated by Checkout before any order or payment mutation.",
  };
}

export async function deliveryPromiseHealth() {
  trimPreviewEvents();
  const [zones, activePartners, settings] = await Promise.all([
    prisma.shippingZone.findMany({
      where: { isActive: true },
      select: { postalPrefixes: true, preferredShippingPartnerId: true, maxWeightGrams: true, codAllowed: true },
    }),
    prisma.shippingPartner.count({ where: { isActive: true } }),
    getStoreSettings(),
  ]);

  const configuredPostalPrefixes = zones.reduce((sum, zone) => sum + (Array.isArray(zone.postalPrefixes) ? zone.postalPrefixes.length : 0), 0);
  const serviceablePreviews = previewEvents.filter((event) => event.serviceable).length;
  const codBlockedPreviews = previewEvents.filter((event) => !event.codEligible).length;
  const fallbackPreviews = previewEvents.filter((event) => !event.matched).length;
  const weightBlockedPreviews = previewEvents.filter((event) => event.weightBlocked).length;

  return {
    strictServiceability: Boolean(settings.requireServiceablePostalCode),
    activeZones: zones.length,
    configuredPostalPrefixes,
    activePartners,
    zonesWithPreferredPartner: zones.filter((zone) => Boolean(zone.preferredShippingPartnerId)).length,
    zonesWithWeightLimit: zones.filter((zone) => zone.maxWeightGrams != null).length,
    prepaidOnlyZones: zones.filter((zone) => zone.codAllowed === false).length,
    engagement: {
      previewChecks: previewEvents.length,
      serviceablePreviews,
      serviceableRatePercent: previewEvents.length ? Number(((serviceablePreviews / previewEvents.length) * 100).toFixed(1)) : 0,
      codBlockedPreviews,
      fallbackPreviews,
      weightBlockedPreviews,
    },
    note: "Rolling 60-minute delivery-preview counters are aggregate in-memory signals. PIN codes, customer identity and cart contents are not retained in these counters.",
  };
}
