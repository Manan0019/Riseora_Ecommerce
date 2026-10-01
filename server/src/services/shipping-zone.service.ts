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

export async function resolveShippingZone(postalCodeInput: unknown, suppliedSettings?: any) {
  const postalCode = normalizePostalCode(postalCodeInput);
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
    dispatchWithinDays: Math.max(0, Number(settings.dispatchWithinDays ?? 2)),
    deliveryMinDays: Math.max(1, Number(settings.deliveryMinDays ?? 3)),
    deliveryMaxDays: Math.max(Number(settings.deliveryMinDays ?? 3), Number(settings.deliveryMaxDays ?? 7)),
    shippingFeeOverride: null as number | null,
    freeShippingThresholdOverride: null as number | null,
    reason: strict ? "Delivery is not enabled for this PIN code yet." : "Using the store-wide delivery settings for this PIN code.",
  };

  if (!/^\d{6}$/.test(postalCode)) {
    return { ...fallback, serviceable: false, reason: "Enter a valid 6-digit PIN code." };
  }

  const zones = await prisma.shippingZone.findMany({
    where: { isActive: true },
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
  return {
    postalCode,
    serviceable: true,
    matched: true,
    strict,
    zoneId: match.zone.id,
    zoneName: match.zone.name,
    city: match.zone.city || null,
    state: match.zone.state || null,
    codAllowed: match.zone.codAllowed,
    dispatchWithinDays: fallback.dispatchWithinDays,
    deliveryMinDays: minDays,
    deliveryMaxDays: maxDays,
    shippingFeeOverride: match.zone.shippingFee == null ? null : Number(match.zone.shippingFee),
    freeShippingThresholdOverride: match.zone.freeShippingThreshold == null ? null : Number(match.zone.freeShippingThreshold),
    reason: `Delivery available in ${match.zone.name}.`,
  };
}

export async function getShippingQuote(input: {
  postalCode: unknown;
  merchandiseAfterDiscount: number;
  paymentMethod: "COD" | "ONLINE";
  settings?: any;
}) {
  const settings = input.settings ?? await getStoreSettings();
  const delivery = await resolveShippingZone(input.postalCode, settings);
  const shippingFee = calculateShippingFee({
    merchandiseAfterDiscount: input.merchandiseAfterDiscount,
    paymentMethod: input.paymentMethod,
    settings,
    shippingOverride: delivery.shippingFeeOverride,
    freeShippingThresholdOverride: delivery.freeShippingThresholdOverride,
  });
  return { ...delivery, shippingFee };
}
