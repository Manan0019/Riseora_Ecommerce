import { prisma } from "../config/prisma";
import { calculateShippingFee, getStoreSettings } from "./store.service";

export function normalizePostalCode(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

export function normalizePostalPrefixes(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source
    .map((item) => String(item ?? "").replace(/\D/g, "").slice(0, 6))
    .filter((item) => item.length >= 2 && item.length <= 6))]
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function prefixesFromJson(value: unknown) {
  return normalizePostalPrefixes(Array.isArray(value) ? value : []);
}

export async function resolveShippingZone(postalCodeInput: unknown, suppliedSettings?: any, totalWeightGramsInput: unknown = 0) {
  const postalCode = normalizePostalCode(postalCodeInput);
  const totalWeightGrams = Math.max(0, Math.round(Number(totalWeightGramsInput || 0)));
  const settings = suppliedSettings ?? await getStoreSettings();
  const strict = Boolean(settings.requireServiceablePostalCode);
  const fallback = {
    postalCode,
    serviceable: !strict,
    matched: false,
    strict,
    zoneId: null as string | null,
    zoneName: null as string | null,
    city: null as string | null,
    state: null as string | null,
    codAllowed: true,
    codFeeOverride: null as number | null,
    codMaxOrderAmountOverride: null as number | null,
    dispatchWithinDays: Math.max(0, Number(settings.dispatchWithinDays ?? 2)),
    deliveryMinDays: Math.max(1, Number(settings.deliveryMinDays ?? 3)),
    deliveryMaxDays: Math.max(Number(settings.deliveryMinDays ?? 3), Number(settings.deliveryMaxDays ?? 7)),
    shippingFeeOverride: null as number | null,
    freeShippingThresholdOverride: null as number | null,
    maxWeightGrams: null as number | null,
    totalWeightGrams,
    preferredShippingPartnerId: null as string | null,
    preferredShippingPartnerName: null as string | null,
    preferredShippingPartnerCode: null as string | null,
    reason: strict ? "Delivery is not enabled for this PIN code yet." : "Using the store-wide delivery settings for this PIN code.",
  };

  if (!/^\d{6}$/.test(postalCode)) {
    return { ...fallback, serviceable: false, reason: "Enter a valid 6-digit PIN code." };
  }

  const zones = await prisma.shippingZone.findMany({
    where: { isActive: true },
    include: { preferredShippingPartner: true },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  const candidates = zones.flatMap((zone) => prefixesFromJson(zone.postalPrefixes)
    .filter((prefix) => postalCode.startsWith(prefix))
    .map((prefix) => ({ zone, prefix })));
  candidates.sort((a, b) => b.prefix.length - a.prefix.length || b.zone.priority - a.zone.priority || a.zone.name.localeCompare(b.zone.name));
  const match = candidates[0];
  if (!match) return fallback;

  const minDays = match.zone.deliveryMinDays == null ? fallback.deliveryMinDays : Math.max(1, Number(match.zone.deliveryMinDays));
  const maxDaysRaw = match.zone.deliveryMaxDays == null ? fallback.deliveryMaxDays : Number(match.zone.deliveryMaxDays);
  const maxDays = Math.max(minDays, maxDaysRaw);
  const dispatchWithinDays = match.zone.dispatchWithinDays == null ? fallback.dispatchWithinDays : Math.max(0, Number(match.zone.dispatchWithinDays));
  const maxWeightGrams = match.zone.maxWeightGrams == null ? null : Math.max(1, Number(match.zone.maxWeightGrams));
  const weightBlocked = maxWeightGrams != null && totalWeightGrams > 0 && totalWeightGrams > maxWeightGrams;
  const partner = match.zone.preferredShippingPartner?.isActive ? match.zone.preferredShippingPartner : null;
  const partnerWeightBlocked = partner?.maxWeightGrams != null && totalWeightGrams > 0 && totalWeightGrams > Number(partner.maxWeightGrams);
  const codAllowed = Boolean(match.zone.codAllowed && (partner?.supportsCod ?? true));

  return {
    postalCode,
    serviceable: !weightBlocked && !partnerWeightBlocked,
    matched: true,
    strict,
    zoneId: match.zone.id,
    zoneName: match.zone.name,
    city: match.zone.city || null,
    state: match.zone.state || null,
    codAllowed,
    codFeeOverride: match.zone.codFee == null ? null : Number(match.zone.codFee),
    codMaxOrderAmountOverride: match.zone.codMaxOrderAmount == null ? null : Number(match.zone.codMaxOrderAmount),
    dispatchWithinDays,
    deliveryMinDays: minDays,
    deliveryMaxDays: maxDays,
    shippingFeeOverride: match.zone.shippingFee == null ? null : Number(match.zone.shippingFee),
    freeShippingThresholdOverride: match.zone.freeShippingThreshold == null ? null : Number(match.zone.freeShippingThreshold),
    maxWeightGrams,
    totalWeightGrams,
    preferredShippingPartnerId: partner?.id ?? null,
    preferredShippingPartnerName: partner?.name ?? null,
    preferredShippingPartnerCode: partner?.code ?? null,
    reason: weightBlocked
      ? `${match.zone.name} supports orders up to ${(maxWeightGrams! / 1000).toFixed(maxWeightGrams! % 1000 === 0 ? 0 : 1)} kg. Please reduce the cart or contact Riseora Support.`
      : partnerWeightBlocked
        ? `${partner?.name || "The preferred courier"} cannot carry this order weight for ${match.zone.name}. Please contact Riseora Support.`
        : `Delivery available in ${match.zone.name}.`,
  };
}

export async function getShippingQuote(input: {
  postalCode: unknown;
  merchandiseAfterDiscount: number;
  paymentMethod: "COD" | "ONLINE";
  totalWeightGrams?: number;
  settings?: any;
}) {
  const settings = input.settings ?? await getStoreSettings();
  const delivery = await resolveShippingZone(input.postalCode, settings, input.totalWeightGrams ?? 0);
  const feeSettings = delivery.codFeeOverride == null
    ? settings
    : { ...settings, codFee: delivery.codFeeOverride };
  const shippingFee = calculateShippingFee({
    merchandiseAfterDiscount: input.merchandiseAfterDiscount,
    paymentMethod: input.paymentMethod,
    settings: feeSettings,
    shippingOverride: delivery.shippingFeeOverride,
    freeShippingThresholdOverride: delivery.freeShippingThresholdOverride,
  });
  return { ...delivery, shippingFee };
}
