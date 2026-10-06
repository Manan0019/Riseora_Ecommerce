import { prisma } from "../config/prisma";
import { createRazorpayOrder } from "./payment.service";

type SubmissionSafetyEvent =
  | "COD_REPLAY"
  | "ONLINE_RESUME"
  | "PAYLOAD_MISMATCH"
  | "REQUEST_KEY_MISSING"
  | "PROVIDER_ORDER_CREATED"
  | "PROVIDER_ORDER_REUSED"
  | "FINALIZATION_REPLAY";

const events: Array<{ at: number; type: SubmissionSafetyEvent }> = [];
const WINDOW_MS = 60 * 60 * 1000;

export function recordCheckoutSubmissionSafety(type: SubmissionSafetyEvent) {
  const now = Date.now();
  events.push({ at: now, type });
  while (events.length && events[0].at < now - WINDOW_MS) events.shift();
}

export function checkoutSubmissionSafetyHealth() {
  const now = Date.now();
  const recent = events.filter((entry) => entry.at >= now - WINDOW_MS);
  const count = (type: SubmissionSafetyEvent) => recent.filter((entry) => entry.type === type).length;
  return {
    windowMinutes: 60,
    codReplays: count("COD_REPLAY"),
    onlineResumes: count("ONLINE_RESUME"),
    payloadMismatches: count("PAYLOAD_MISMATCH"),
    missingRequestKeys: count("REQUEST_KEY_MISSING"),
    providerOrdersCreated: count("PROVIDER_ORDER_CREATED"),
    providerOrdersReused: count("PROVIDER_ORDER_REUSED"),
    finalizationReplays: count("FINALIZATION_REPLAY"),
    note: "Aggregate in-memory checkout-submission counters only. Customer identity, address, cart contents and request keys are not retained.",
  };
}

type CheckoutIntent = {
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  couponCode?: string;
  shippingAddress: { line1: string; line2?: string; landmark?: string; city: string; state: string; postalCode: string; country: string };
  items: Array<{ variantId: string; quantity: number }>;
};

function text(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}
function coupon(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}
function address(value: unknown) {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    line1: text(row.line1), line2: text(row.line2), landmark: text(row.landmark), city: text(row.city), state: text(row.state),
    postalCode: String(row.postalCode ?? "").trim(), country: text(row.country || "India"),
  };
}
function requestedItems(items: Array<{ variantId: string; quantity: number }>) {
  return items.map((item) => ({ variantId: String(item.variantId), quantity: Number(item.quantity) })).sort((a, b) => a.variantId.localeCompare(b.variantId));
}
function storedPaidItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item) && !(item as Record<string, unknown>).isComplimentary)
    .map((item) => ({ variantId: String((item as Record<string, unknown>).variantId || ""), quantity: Number((item as Record<string, unknown>).quantity || 0) }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId));
}

export function checkoutIntentMatchesSnapshot(input: CheckoutIntent, userId: string | null, snapshot: {
  userId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone: string;
  shippingAddress: unknown;
  couponCode?: string | null;
  items: unknown;
}) {
  const left = {
    userId: userId || null,
    customerName: text(input.customerName),
    customerEmail: text(input.customerEmail),
    customerPhone: text(input.customerPhone),
    shippingAddress: address(input.shippingAddress),
    couponCode: coupon(input.couponCode),
    items: requestedItems(input.items),
  };
  const right = {
    userId: snapshot.userId || null,
    customerName: text(snapshot.customerName),
    customerEmail: text(snapshot.customerEmail),
    customerPhone: text(snapshot.customerPhone),
    shippingAddress: address(snapshot.shippingAddress),
    couponCode: coupon(snapshot.couponCode),
    items: storedPaidItems(snapshot.items),
  };
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function ensureRazorpayProviderOrder(sessionId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`riseora-provider-order:${sessionId}`}))`;
    const session = await tx.checkoutSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error("CHECKOUT_NOT_FOUND");
    if (session.status !== "PENDING") throw new Error("CHECKOUT_REQUEST_CLOSED");
    if (session.providerOrderId) {
      recordCheckoutSubmissionSafety("PROVIDER_ORDER_REUSED");
      return { providerOrderId: session.providerOrderId, created: false };
    }
    const providerOrder = await createRazorpayOrder({ amountPaise: session.amountPaise, receipt: session.id, notes: { checkoutSessionId: session.id } });
    await tx.checkoutSession.update({ where: { id: session.id }, data: { providerOrderId: providerOrder.id } });
    recordCheckoutSubmissionSafety("PROVIDER_ORDER_CREATED");
    return { providerOrderId: providerOrder.id, created: true };
  }, { maxWait: 5000, timeout: 20000 });
}
