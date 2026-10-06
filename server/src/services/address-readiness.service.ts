import { prisma } from "../config/prisma";
import { resolveShippingZone } from "./shipping-zone.service";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_EVENTS = 3000;

type AddressSource = "MANUAL" | "SAVED";
type AddressIssue = { code: string; field: string; severity: "BLOCK" | "REVIEW"; message: string };
type AddressReadinessEvent = { at: number; ready: boolean; review: boolean; zoneMismatch: boolean; source: AddressSource };

const readinessEvents: AddressReadinessEvent[] = [];

function compact(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function compareText(value: unknown) {
  return compact(value).toLocaleLowerCase("en-IN").replace(/[^a-z0-9]/g, "");
}

function phoneDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 15);
}

function localPhoneDigits(value: unknown) {
  const digits = phoneDigits(value);
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

function trimEvents(now = Date.now()) {
  const cutoff = now - WINDOW_MS;
  while (readinessEvents.length && readinessEvents[0].at < cutoff) readinessEvents.shift();
  if (readinessEvents.length > MAX_EVENTS) readinessEvents.splice(0, readinessEvents.length - MAX_EVENTS);
}

function recordReadiness(input: { ready: boolean; quality: string; zoneMismatch: boolean; source: AddressSource }) {
  readinessEvents.push({ at: Date.now(), ready: input.ready, review: input.quality === "REVIEW", zoneMismatch: input.zoneMismatch, source: input.source });
  trimEvents();
}

export type AddressReadinessInput = {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  source?: AddressSource;
  shippingAddress?: {
    line1?: string;
    line2?: string;
    landmark?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
};

export async function getAddressReadiness(input: AddressReadinessInput) {
  const source: AddressSource = input.source === "SAVED" ? "SAVED" : "MANUAL";
  const address = input.shippingAddress || {};
  const customerName = compact(input.customerName);
  const customerEmail = compact(input.customerEmail);
  const customerPhone = compact(input.customerPhone);
  const line1 = compact(address.line1);
  const line2 = compact(address.line2);
  const landmark = compact(address.landmark);
  const city = compact(address.city);
  const state = compact(address.state);
  const postalCode = String(address.postalCode ?? "").replace(/\D/g, "").slice(0, 6);
  const country = compact(address.country || "India");
  const digits = phoneDigits(customerPhone);
  const localDigits = localPhoneDigits(customerPhone);

  const blockers: AddressIssue[] = [];
  const warnings: AddressIssue[] = [];
  const addBlock = (code: string, field: string, message: string) => blockers.push({ code, field, severity: "BLOCK", message });
  const addWarning = (code: string, field: string, message: string) => warnings.push({ code, field, severity: "REVIEW", message });

  if (customerName.length < 2) addBlock("NAME_REQUIRED", "customerName", "Add the recipient name for this delivery.");
  if (customerPhone.length < 8 || customerPhone.length > 20 || digits.length < 8) addBlock("PHONE_REQUIRED", "customerPhone", "Add a complete delivery contact number.");
  if (customerEmail && !/^\S+@\S+\.\S+$/.test(customerEmail)) addBlock("EMAIL_INVALID", "customerEmail", "Check the email address format or leave it blank.");
  if (line1.length < 3) addBlock("ADDRESS_REQUIRED", "line1", "Add the house, flat, building or street address.");
  if (city.length < 2) addBlock("CITY_REQUIRED", "city", "Add the delivery city.");
  if (state.length < 2) addBlock("STATE_REQUIRED", "state", "Add the delivery state.");
  if (!/^\d{6}$/.test(postalCode)) addBlock("PIN_INVALID", "postalCode", "Enter a valid 6-digit Indian PIN code.");
  if (compareText(country) !== "india") addBlock("COUNTRY_UNSUPPORTED", "country", "Riseora checkout currently supports delivery addresses in India.");

  if (blockers.length === 0) {
    if (localDigits.length < 10) addWarning("PHONE_REVIEW", "customerPhone", "Consider adding a full 10-digit delivery contact number so the courier can reach you easily.");
    if (line1.length < 8) addWarning("ADDRESS_DETAIL_REVIEW", "line1", "Consider adding house/flat/building or street detail to make the address easier for the courier to locate.");
  }

  const zone = /^\d{6}$/.test(postalCode) ? await resolveShippingZone(postalCode) : null;
  const suggestedCity = zone?.matched && zone.city && compareText(zone.city) !== compareText(city) ? zone.city : null;
  const suggestedState = zone?.matched && zone.state && compareText(zone.state) !== compareText(state) ? zone.state : null;
  const zoneMismatch = Boolean(suggestedCity || suggestedState);
  if (suggestedCity) addWarning("CITY_ZONE_REVIEW", "city", `This PIN is configured under ${suggestedCity}. Confirm the city before ordering.`);
  if (suggestedState) addWarning("STATE_ZONE_REVIEW", "state", `This PIN is configured under ${suggestedState}. Confirm the state before ordering.`);

  const ready = blockers.length === 0;
  const quality = ready ? (warnings.length ? "REVIEW" : "READY") : "BLOCKED";
  const result = {
    ready,
    quality,
    message: !ready
      ? "Complete the required delivery details before continuing."
      : warnings.length
        ? "Your delivery details can continue, but one or more details are worth reviewing."
        : "Contact and address details are ready for final checkout verification.",
    checks: {
      contact: { ready: customerName.length >= 2 && customerPhone.length >= 8 && customerPhone.length <= 20 && digits.length >= 8 && (!customerEmail || /^\S+@\S+\.\S+$/.test(customerEmail)) },
      address: { ready: line1.length >= 3 && city.length >= 2 && state.length >= 2 && compareText(country) === "india" },
      pin: { ready: /^\d{6}$/.test(postalCode) },
      deliveryArea: { checked: Boolean(zone), serviceable: zone?.serviceable ?? null, matched: zone?.matched ?? false, zoneName: zone?.zoneName ?? null },
    },
    issues: [...blockers, ...warnings],
    suggestion: zoneMismatch ? { city: suggestedCity, state: suggestedState, label: "Use verified city/state" } : null,
    normalized: { postalCode, line2, landmark, country: country || "India" },
    policy: "Address readiness checks format and configured delivery-area consistency only. Final serviceability, stock, pricing and payment are rechecked by Checkout.",
  };

  recordReadiness({ ready, quality, zoneMismatch, source });
  return result;
}

export async function addressReadinessHealth() {
  trimEvents();
  const rows = await prisma.address.findMany({ select: { postalCode: true, phone: true, isDefault: true, updatedAt: true } });
  const now = Date.now();
  const validPin = rows.filter((row) => /^\d{6}$/.test(String(row.postalCode || "").replace(/\D/g, ""))).length;
  const contactReady = rows.filter((row) => {
    const digits = phoneDigits(row.phone);
    return digits.length >= 8 && digits.length <= 15;
  }).length;
  const defaults = rows.filter((row) => row.isDefault).length;
  const recent30d = rows.filter((row) => now - new Date(row.updatedAt).getTime() <= 30 * 24 * 60 * 60 * 1000).length;
  const checks = readinessEvents.length;
  const readyChecks = readinessEvents.filter((event) => event.ready).length;
  const reviewChecks = readinessEvents.filter((event) => event.review).length;
  const mismatchChecks = readinessEvents.filter((event) => event.zoneMismatch).length;
  const savedSourceChecks = readinessEvents.filter((event) => event.source === "SAVED").length;
  const percent = (value: number, base: number) => base ? Number(((value / base) * 100).toFixed(1)) : 0;

  return {
    savedAddresses: rows.length,
    defaultAddresses: defaults,
    updated30d: recent30d,
    sixDigitPinPercent: percent(validPin, rows.length),
    contactReadyPercent: percent(contactReady, rows.length),
    engagement: {
      windowMinutes: Math.round(WINDOW_MS / 60000),
      checks,
      readyChecks,
      reviewChecks,
      zoneMismatchChecks: mismatchChecks,
      savedSourceChecks,
      readyRatePercent: percent(readyChecks, checks),
      reviewRatePercent: percent(reviewChecks, checks),
    },
    privacy: "Aggregate address-readiness counters only. Customer identity, phone numbers, PIN codes and address text are not retained in telemetry.",
  };
}
