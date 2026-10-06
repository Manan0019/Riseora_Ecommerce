import { prisma } from "../config/prisma";
import { finalizeOnlineCheckout } from "./checkout.service";
import { findCapturedRazorpayPaymentForOrder } from "./payment.service";

type ConfirmationEvent =
  | "STATUS_CHECK"
  | "PROVIDER_LOOKUP"
  | "NO_CAPTURE"
  | "CAPTURE_RECOVERED"
  | "ALREADY_PAID"
  | "LOOKUP_FAILED"
  | "AMOUNT_MISMATCH"
  | "WEBHOOK_ACCEPTED"
  | "WEBHOOK_DUPLICATE"
  | "WEBHOOK_RETRYABLE_FAILURE"
  | "WEBHOOK_CAPTURE_RECOVERED";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_EVENTS = 4000;
const events: Array<{ at: number; type: ConfirmationEvent }> = [];

function record(type: ConfirmationEvent) {
  const now = Date.now();
  events.push({ at: now, type });
  while (events.length && events[0].at < now - WINDOW_MS) events.shift();
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

export function paymentConfirmationHealth() {
  const now = Date.now();
  const recent = events.filter((event) => event.at >= now - WINDOW_MS);
  const count = (type: ConfirmationEvent) => recent.filter((event) => event.type === type).length;
  return {
    windowMinutes: 60,
    statusChecks: count("STATUS_CHECK"),
    providerLookups: count("PROVIDER_LOOKUP"),
    noCapture: count("NO_CAPTURE"),
    capturesRecovered: count("CAPTURE_RECOVERED") + count("WEBHOOK_CAPTURE_RECOVERED"),
    browserCapturesRecovered: count("CAPTURE_RECOVERED"),
    webhookCapturesRecovered: count("WEBHOOK_CAPTURE_RECOVERED"),
    alreadyPaid: count("ALREADY_PAID"),
    providerLookupFailures: count("LOOKUP_FAILED"),
    amountMismatches: count("AMOUNT_MISMATCH"),
    webhookAccepted: count("WEBHOOK_ACCEPTED"),
    webhookDuplicates: count("WEBHOOK_DUPLICATE"),
    webhookRetryableFailures: count("WEBHOOK_RETRYABLE_FAILURE"),
    note: "Aggregate in-memory payment-confirmation counters only. Customer identity, addresses, cart contents, provider payment IDs and webhook payloads are not retained.",
  };
}

export type PaymentConfirmationResult = {
  state: "PAID" | "PENDING" | "CLOSED" | "NO_PROVIDER_ORDER" | "PROVIDER_UNAVAILABLE" | "AMOUNT_MISMATCH";
  recovered: boolean;
  message: string;
};

export async function reconcilePendingCheckoutPayment(sessionId: string): Promise<PaymentConfirmationResult> {
  record("STATUS_CHECK");
  const session = await prisma.checkoutSession.findUnique({ where: { id: sessionId }, include: { order: true } });
  if (!session) throw new Error("CHECKOUT_NOT_FOUND");
  if (session.status === "PAID") {
    record("ALREADY_PAID");
    return { state: "PAID", recovered: false, message: "Payment is already confirmed." };
  }
  if (session.status !== "PENDING") return { state: "CLOSED", recovered: false, message: "This checkout reservation is no longer active." };
  if (!session.providerOrderId) return { state: "NO_PROVIDER_ORDER", recovered: false, message: "Secure payment has not created a provider order yet." };

  record("PROVIDER_LOOKUP");
  let captured: Awaited<ReturnType<typeof findCapturedRazorpayPaymentForOrder>>;
  try {
    captured = await findCapturedRazorpayPaymentForOrder(session.providerOrderId);
  } catch {
    record("LOOKUP_FAILED");
    return { state: "PROVIDER_UNAVAILABLE", recovered: false, message: "Riseora could not confirm provider status right now. Your reservation remains protected; try Check status again shortly." };
  }
  if (!captured?.id) {
    record("NO_CAPTURE");
    return { state: "PENDING", recovered: false, message: "No captured payment is visible at the provider yet. If your bank shows a debit, wait briefly and check again before starting another payment." };
  }
  if (Number(captured.amount || 0) !== Number(session.amountPaise)) {
    record("AMOUNT_MISMATCH");
    await prisma.checkoutSession.updateMany({
      where: { id: session.id, status: "PENDING" },
      data: { lastPaymentStatus: "CAPTURE_AMOUNT_MISMATCH", lastPaymentError: "Captured provider amount does not match the reserved checkout amount", lastPaymentActivityAt: new Date() },
    });
    return { state: "AMOUNT_MISMATCH", recovered: false, message: "A provider payment was found, but its amount does not match this checkout. Do not retry payment; contact Riseora support so the payment can be reviewed safely." };
  }

  await finalizeOnlineCheckout({ sessionId: session.id, providerOrderId: session.providerOrderId, providerPaymentId: captured.id });
  record("CAPTURE_RECOVERED");
  return { state: "PAID", recovered: true, message: "Captured payment found at Razorpay and the Riseora order was finalized safely." };
}

function providerFields(payload: any) {
  const paymentEntity = payload?.payload?.payment?.entity;
  const orderEntity = payload?.payload?.order?.entity;
  return {
    paymentEntity,
    orderEntity,
    providerOrderId: String(paymentEntity?.order_id || orderEntity?.id || ""),
    providerPaymentId: String(paymentEntity?.id || ""),
    providerAmountPaise: Number(paymentEntity?.amount || 0),
  };
}

async function reserveWebhookEvent(input: { eventId: string; eventType: string; providerOrderId: string; providerPaymentId: string }) {
  try {
    await prisma.paymentWebhookEvent.create({
      data: {
        provider: "RAZORPAY",
        eventId: input.eventId,
        eventType: input.eventType,
        providerOrderId: input.providerOrderId || null,
        providerPaymentId: input.providerPaymentId || null,
      },
    });
    return true;
  } catch (error: any) {
    if (error?.code === "P2002") return false;
    throw error;
  }
}

export async function processRazorpayWebhook(input: { eventId: string | null; payload: any }) {
  const eventType = String(input.payload?.event || "unknown");
  let { paymentEntity, providerOrderId, providerPaymentId, providerAmountPaise } = providerFields(input.payload);
  let reservedEvent = false;
  let duplicateEvent = false;

  if (input.eventId) {
    reservedEvent = await reserveWebhookEvent({ eventId: input.eventId, eventType, providerOrderId, providerPaymentId });
    if (!reservedEvent) {
      // Duplicate webhook delivery is expected. Re-run the idempotent processing path
      // instead of returning immediately so a retry can recover from a process crash
      // that happened after the event marker was inserted but before finalization.
      duplicateEvent = true;
      record("WEBHOOK_DUPLICATE");
    }
  }

  try {
    if (["payment.captured", "order.paid"].includes(eventType) && providerOrderId) {
      if (!providerPaymentId) {
        record("PROVIDER_LOOKUP");
        const captured = await findCapturedRazorpayPaymentForOrder(providerOrderId);
        providerPaymentId = captured?.id || "";
        providerAmountPaise = Number(captured?.amount || 0);
      }
      if (!providerPaymentId) throw new Error("CAPTURED_PAYMENT_ID_MISSING");
      const session = await prisma.checkoutSession.findUnique({ where: { providerOrderId }, select: { id: true, amountPaise: true, status: true } });
      if (!session) throw new Error("CHECKOUT_NOT_FOUND");
      if (providerAmountPaise > 0 && Number(session.amountPaise) !== providerAmountPaise) {
        record("AMOUNT_MISMATCH");
        await prisma.checkoutSession.updateMany({
          where: { id: session.id, status: "PENDING" },
          data: { lastPaymentStatus: "CAPTURE_AMOUNT_MISMATCH", lastPaymentError: "Captured provider amount does not match the reserved checkout amount", lastPaymentActivityAt: new Date() },
        });
        record("WEBHOOK_ACCEPTED");
        return { duplicate: duplicateEvent, reviewRequired: true };
      }
      await finalizeOnlineCheckout({ sessionId: session.id, providerOrderId, providerPaymentId });
      record("WEBHOOK_CAPTURE_RECOVERED");
    } else if (eventType === "payment.failed" && providerOrderId) {
      await prisma.checkoutSession.updateMany({
        where: { providerOrderId, status: "PENDING" },
        data: {
          lastPaymentStatus: "FAILED",
          lastPaymentError: String(paymentEntity?.error_description || paymentEntity?.error_reason || "Payment attempt failed"),
          lastPaymentActivityAt: new Date(),
        },
      });
    }
    record("WEBHOOK_ACCEPTED");
    return { duplicate: duplicateEvent };
  } catch (error) {
    record("WEBHOOK_RETRYABLE_FAILURE");
    // If processing fails after reserving the provider event ID, remove the marker so
    // Razorpay's retry can attempt the event again. Successful events stay deduplicated.
    if (input.eventId && reservedEvent) {
      await prisma.paymentWebhookEvent.deleteMany({ where: { eventId: input.eventId } }).catch(() => {});
    }
    throw error;
  }
}
