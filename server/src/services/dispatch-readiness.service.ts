import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/prisma";

type DispatchDb = Prisma.TransactionClient | typeof prisma;
export type DispatchReadinessSeverity = "BLOCK" | "REVIEW";
export type DispatchReadinessIssue = { code: string; severity: DispatchReadinessSeverity; message: string };
export type DispatchCandidate = { carrier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null };
export type DispatchReadinessResult = {
  orderId: string;
  orderNumber: string;
  status: "READY" | "REVIEW" | "BLOCK";
  canDispatch: boolean;
  canDeliver: boolean;
  blockCount: number;
  reviewCount: number;
  checks: {
    address: boolean;
    parcelWeight: boolean | null;
    courier: boolean | null;
    tracking: boolean | null;
    shipmentEvidence: boolean | null;
    deliveryEvidence: boolean | null;
  };
  issues: DispatchReadinessIssue[];
};

function issue(list: DispatchReadinessIssue[], severity: DispatchReadinessSeverity, code: string, message: string) {
  list.push({ severity, code, message });
}
function text(value: unknown) { return String(value || "").trim(); }
function addressObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function estimateObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function loadOrder(db: DispatchDb, orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { variant: { select: { weightGrams: true } } } },
      shipment: { include: { events: { orderBy: { eventAt: "asc" } } } },
      cancellationRequest: true,
    },
  });
}

export async function getDispatchReadiness(orderId: string, candidate: DispatchCandidate = {}, db: DispatchDb = prisma): Promise<DispatchReadinessResult> {
  const order = await loadOrder(db, orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const issues: DispatchReadinessIssue[] = [];
  const address = addressObject(order.shippingAddress);
  const estimate = estimateObject(order.deliveryEstimate);
  const carrier = text(candidate.carrier ?? order.shipment?.carrier);
  const trackingNumber = text(candidate.trackingNumber ?? order.shipment?.trackingNumber);
  const trackingUrl = text(candidate.trackingUrl ?? order.shipment?.trackingUrl);
  const totalWeightGrams = Number(estimate?.totalWeightGrams || order.items.reduce((sum, item) => sum + Math.max(0, Number(item.variant?.weightGrams || 0)) * item.quantity, 0));

  const addressReady = ["line1", "city", "state", "postalCode", "country"].every((key) => text(address[key]));
  if (!addressReady) issue(issues, "BLOCK", "DISPATCH_ADDRESS_INCOMPLETE", "Shipping address is incomplete for physical dispatch.");

  let parcelWeightReady: boolean | null = totalWeightGrams > 0 ? true : null;
  if (!totalWeightGrams) issue(issues, "REVIEW", "PARCEL_WEIGHT_MISSING", "Parcel weight is unavailable; verify courier acceptance before dispatch.");

  if (order.cancellationRequest && ["REQUESTED", "APPROVED"].includes(order.cancellationRequest.status)) {
    issue(issues, "BLOCK", "CANCELLATION_REQUEST_PENDING", "A customer cancellation request must be resolved before dispatch.");
  }
  if (order.dispatchDueAt && new Date(order.dispatchDueAt).getTime() < Date.now() && !["SHIPPED", "DELIVERED", "CANCELLED"].includes(order.status)) {
    issue(issues, "REVIEW", "DISPATCH_SLA_OVERDUE", "Promised dispatch time has passed; prioritise this order and update the customer if needed.");
  }

  let courierReady: boolean | null = null;
  let trackingReady: boolean | null = null;
  const shouldHaveShipmentDetails = ["SHIPPED", "DELIVERED"].includes(order.status) || Boolean(carrier || trackingNumber || trackingUrl);
  if (shouldHaveShipmentDetails) {
    courierReady = Boolean(carrier);
    trackingReady = Boolean(trackingNumber);
    if (!carrier) issue(issues, "BLOCK", "COURIER_MISSING", "Courier / carrier is required before shipment handoff.");
    if (!trackingNumber) issue(issues, "BLOCK", "TRACKING_NUMBER_MISSING", "Tracking number is required before shipment handoff.");
    if (trackingNumber && trackingNumber.length < 4) issue(issues, "BLOCK", "TRACKING_NUMBER_INVALID", "Tracking number is too short to be a valid shipment reference.");

    if (trackingNumber) {
      const duplicate = await db.shipment.findFirst({ where: { trackingNumber, NOT: { orderId: order.id } }, select: { orderId: true } });
      if (duplicate) {
        trackingReady = false;
        issue(issues, "BLOCK", "TRACKING_NUMBER_DUPLICATE", "Tracking number is already assigned to another order.");
      }
    }

    if (trackingUrl) {
      try {
        const url = new URL(trackingUrl);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
      } catch {
        trackingReady = false;
        issue(issues, "BLOCK", "TRACKING_URL_INVALID", "Tracking URL must be a valid HTTP(S) URL.");
      }
    } else if (trackingNumber) {
      issue(issues, "REVIEW", "TRACKING_URL_MISSING", "Tracking number exists without a tracking URL; customer self-service tracking may be limited.");
    }

    if (carrier) {
      const partner = await db.shippingPartner.findFirst({ where: { name: carrier } });
      if (partner) {
        if (!partner.isActive) {
          courierReady = false;
          issue(issues, "BLOCK", "COURIER_INACTIVE", "Selected courier is inactive in shipping settings.");
        }
        if (order.paymentMethod === "COD" && !partner.supportsCod) {
          courierReady = false;
          issue(issues, "BLOCK", "COURIER_COD_UNAVAILABLE", "Selected courier does not support COD for this order.");
        }
        if (partner.maxWeightGrams != null && totalWeightGrams > Number(partner.maxWeightGrams)) {
          parcelWeightReady = false;
          issue(issues, "BLOCK", "COURIER_WEIGHT_EXCEEDED", "Parcel weight exceeds the selected courier limit.");
        }
      } else {
        issue(issues, "REVIEW", "COURIER_NOT_REGISTERED", "Carrier is not registered in Riseora shipping settings; verify tracking and serviceability manually.");
      }
    }
  }

  let shipmentEvidence: boolean | null = null;
  let deliveryEvidence: boolean | null = null;
  if (["SHIPPED", "DELIVERED"].includes(order.status)) {
    shipmentEvidence = true;
    if (!order.shipment) {
      shipmentEvidence = false;
      issue(issues, "BLOCK", "SHIPMENT_RECORD_MISSING", "Order is marked shipped but has no shipment record.");
    } else {
      if (!order.shipment.shippedAt) {
        shipmentEvidence = false;
        issue(issues, "BLOCK", "SHIPPED_AT_MISSING", "Shipment has no shipped timestamp.");
      }
      if (!order.shipment.events.some((event) => event.type === "PICKED_UP")) {
        shipmentEvidence = false;
        issue(issues, "BLOCK", "PICKUP_EVENT_MISSING", "Shipment handoff has no PICKED_UP evidence.");
      }
      if (!order.shipment.estimatedDeliveryAt) issue(issues, "REVIEW", "DELIVERY_ESTIMATE_MISSING", "Shipment has no estimated delivery date.");
    }
  }

  if (order.status === "DELIVERED") {
    deliveryEvidence = true;
    const shipment = order.shipment;
    if (!shipment?.deliveredAt) {
      deliveryEvidence = false;
      issue(issues, "BLOCK", "DELIVERED_AT_MISSING", "Delivered order has no delivered timestamp.");
    }
    if (!shipment?.events.some((event) => event.type === "DELIVERED")) {
      deliveryEvidence = false;
      issue(issues, "BLOCK", "DELIVERED_EVENT_MISSING", "Delivered order has no DELIVERED shipment event.");
    }
    if (shipment?.shippedAt && shipment.deliveredAt && shipment.deliveredAt.getTime() < shipment.shippedAt.getTime()) {
      deliveryEvidence = false;
      issue(issues, "BLOCK", "DELIVERY_TIME_INVALID", "Delivered timestamp is earlier than the shipped timestamp.");
    }
  }

  const blockCount = issues.filter((item) => item.severity === "BLOCK").length;
  const reviewCount = issues.filter((item) => item.severity === "REVIEW").length;
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: blockCount ? "BLOCK" : reviewCount ? "REVIEW" : "READY",
    canDispatch: blockCount === 0,
    canDeliver: blockCount === 0 && (["SHIPPED", "DELIVERED"].includes(order.status) ? shipmentEvidence !== false : true),
    blockCount,
    reviewCount,
    checks: { address: addressReady, parcelWeight: parcelWeightReady, courier: courierReady, tracking: trackingReady, shipmentEvidence, deliveryEvidence },
    issues,
  };
}

export async function assertDispatchReadinessForTransition(orderId: string, nextStatus: string, candidate: DispatchCandidate, db: DispatchDb = prisma) {
  if (!['SHIPPED', 'DELIVERED'].includes(nextStatus)) return null;
  const result = await getDispatchReadiness(orderId, candidate, db);
  if (nextStatus === "SHIPPED" && !result.canDispatch) {
    throw new Error(`DISPATCH_READINESS_BLOCKED:${result.issues.filter((item) => item.severity === "BLOCK").map((item) => item.code).join(",")}`);
  }
  if (nextStatus === "DELIVERED" && !result.canDeliver) {
    throw new Error(`DELIVERY_EVIDENCE_BLOCKED:${result.issues.filter((item) => item.severity === "BLOCK").map((item) => item.code).join(",")}`);
  }
  return result;
}

export async function fulfilmentDispatchReadinessHealth() {
  const rows = await prisma.order.findMany({
    where: { status: { in: ["PROCESSING", "SHIPPED"] } },
    select: { id: true, status: true },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  const results = await Promise.all(rows.map((row) => getDispatchReadiness(row.id)));
  const byOrderId = Object.fromEntries(results.map((result) => [result.orderId, result]));
  const processing = rows.filter((row) => row.status === "PROCESSING").map((row) => byOrderId[row.id]).filter(Boolean);
  return {
    checkedOrders: processing.length,
    ready: processing.filter((item) => item.status === "READY").length,
    review: processing.filter((item) => item.status === "REVIEW").length,
    blocked: processing.filter((item) => item.status === "BLOCK").length,
    blockingIssues: processing.reduce((sum, item) => sum + item.blockCount, 0),
    reviewIssues: processing.reduce((sum, item) => sum + item.reviewCount, 0),
    shippedEvidenceBlocks: results.filter((item) => item.status === "BLOCK" && rows.find((row) => row.id === item.orderId)?.status === "SHIPPED").length,
    byOrderId,
    note: "Phase 80 checks dispatch address, parcel/courier constraints, tracking uniqueness and persisted shipment evidence without silently repairing operational data.",
  };
}
