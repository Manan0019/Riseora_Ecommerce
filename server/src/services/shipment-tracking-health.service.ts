import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/prisma";

type TrackingDb = Prisma.TransactionClient | typeof prisma;
export type TrackingSeverity = "BLOCK" | "REVIEW";
export type TrackingIssue = { code: string; severity: TrackingSeverity; message: string };
export type ShipmentTrackingHealthResult = {
  orderId: string;
  orderNumber: string;
  status: "HEALTHY" | "REVIEW" | "BLOCK";
  canDeliver: boolean;
  blockCount: number;
  reviewCount: number;
  latestEventType: string | null;
  latestEventAt: Date | null;
  checks: {
    chronology: boolean;
    freshness: boolean | null;
    deliveryPromise: boolean | null;
    exceptionState: boolean | null;
    customerVisibility: boolean | null;
  };
  issues: TrackingIssue[];
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function issue(list: TrackingIssue[], severity: TrackingSeverity, code: string, message: string) {
  list.push({ severity, code, message });
}

async function loadOrder(db: TrackingDb, orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    include: { shipment: { include: { events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] } } } },
  });
}

export async function getShipmentTrackingHealth(orderId: string, db: TrackingDb = prisma): Promise<ShipmentTrackingHealthResult> {
  const order = await loadOrder(db, orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const issues: TrackingIssue[] = [];
  const shipment = order.shipment;
  const events = shipment?.events || [];
  const latest = events.at(-1) || null;
  const now = Date.now();

  let chronology = true;
  let freshness: boolean | null = null;
  let deliveryPromise: boolean | null = null;
  let exceptionState: boolean | null = null;
  let customerVisibility: boolean | null = null;

  if (["SHIPPED", "DELIVERED"].includes(order.status)) {
    if (!shipment) {
      chronology = false;
      issue(issues, "BLOCK", "TRACKING_SHIPMENT_MISSING", "Shipped order has no shipment record to track.");
    } else {
      if (!shipment.shippedAt) {
        chronology = false;
        issue(issues, "BLOCK", "TRACKING_SHIPPED_AT_MISSING", "Shipment tracking cannot be trusted because shippedAt is missing.");
      }

      let previousAt = shipment.shippedAt?.getTime() || 0;
      for (const event of events) {
        const eventAt = event.eventAt.getTime();
        if (shipment.shippedAt && eventAt < shipment.shippedAt.getTime()) {
          chronology = false;
          issue(issues, "BLOCK", "TRACKING_EVENT_BEFORE_SHIPMENT", `${event.type} is timestamped before courier handoff.`);
          break;
        }
        if (previousAt && eventAt < previousAt) {
          chronology = false;
          issue(issues, "BLOCK", "TRACKING_EVENT_ORDER_INVALID", "Shipment events are not in chronological order.");
          break;
        }
        previousAt = eventAt;
      }

      if (order.status === "SHIPPED") {
        freshness = latest ? true : null;
        if (!latest) {
          issue(issues, "REVIEW", "TRACKING_EVENTS_EMPTY", "Shipment has no courier movement events after handoff.");
        } else {
          const age = now - latest.eventAt.getTime();
          if (age > 72 * HOUR) {
            freshness = false;
            issue(issues, "REVIEW", "TRACKING_STALE_72H", "No shipment movement has been recorded for more than 72 hours.");
          }
          if (latest.type === "OUT_FOR_DELIVERY" && age > 24 * HOUR) {
            freshness = false;
            issue(issues, "REVIEW", "OUT_FOR_DELIVERY_STALE", "Shipment has remained out for delivery for more than 24 hours.");
          }
        }

        deliveryPromise = true;
        if (!shipment.estimatedDeliveryAt) {
          deliveryPromise = null;
          issue(issues, "REVIEW", "TRACKING_ETA_MISSING", "Shipment has no estimated delivery date.");
        } else if (shipment.estimatedDeliveryAt.getTime() < now) {
          deliveryPromise = false;
          issue(issues, "REVIEW", "TRACKING_ETA_OVERDUE", "Estimated delivery date has passed while the order is still shipped.");
        }

        const lastRto = [...events].reverse().find((event) => ["RTO_INITIATED", "RTO_DELIVERED"].includes(event.type));
        const lastException = [...events].reverse().find((event) => event.type === "EXCEPTION");
        const lastRecovery = [...events].reverse().find((event) => ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"].includes(event.type));
        exceptionState = true;
        if (lastRto?.type === "RTO_INITIATED") {
          exceptionState = false;
          issue(issues, "BLOCK", "TRACKING_RTO_ACTIVE", "Return-to-origin has been initiated. Do not mark this order delivered.");
        }
        if (lastRto?.type === "RTO_DELIVERED") {
          exceptionState = false;
          issue(issues, "BLOCK", "TRACKING_RTO_COMPLETED", "Parcel has returned to origin and cannot be marked delivered to the customer.");
        }
        if (lastException && (!lastRecovery || lastRecovery.eventAt.getTime() <= lastException.eventAt.getTime())) {
          exceptionState = exceptionState === false ? false : null;
          issue(issues, "REVIEW", "TRACKING_EXCEPTION_ACTIVE", "Latest courier exception has no later recovery movement.");
        }
      }

      const visibleEvents = events.filter((event) => event.customerVisible);
      customerVisibility = visibleEvents.length > 0;
      if (!visibleEvents.length) issue(issues, "REVIEW", "TRACKING_CUSTOMER_VISIBILITY_EMPTY", "No shipment movement is currently visible to the customer.");

      if (order.status === "DELIVERED") {
        const deliveredEvents = events.filter((event) => event.type === "DELIVERED");
        if (!shipment.deliveredAt || deliveredEvents.length === 0) {
          chronology = false;
          issue(issues, "BLOCK", "TRACKING_DELIVERY_EVIDENCE_MISSING", "Delivered order is missing persisted delivery evidence.");
        }
        const laterRto = shipment.deliveredAt
          ? events.find((event) => ["RTO_INITIATED", "RTO_DELIVERED"].includes(event.type) && event.eventAt.getTime() > shipment.deliveredAt!.getTime())
          : null;
        if (laterRto) {
          chronology = false;
          issue(issues, "BLOCK", "TRACKING_POST_DELIVERY_RTO", "RTO evidence occurs after the stored delivery timestamp.");
        }
      }
    }
  }

  const blockCount = issues.filter((item) => item.severity === "BLOCK").length;
  const reviewCount = issues.filter((item) => item.severity === "REVIEW").length;
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: blockCount ? "BLOCK" : reviewCount ? "REVIEW" : "HEALTHY",
    canDeliver: blockCount === 0,
    blockCount,
    reviewCount,
    latestEventType: latest?.type || null,
    latestEventAt: latest?.eventAt || null,
    checks: { chronology, freshness, deliveryPromise, exceptionState, customerVisibility },
    issues,
  };
}

export async function assertShipmentTrackingCanDeliver(orderId: string, db: TrackingDb = prisma) {
  const result = await getShipmentTrackingHealth(orderId, db);
  if (!result.canDeliver) {
    throw new Error(`SHIPMENT_TRACKING_BLOCKED:${result.issues.filter((item) => item.severity === "BLOCK").map((item) => item.code).join(",")}`);
  }
  return result;
}

export async function assertShipmentEventTransition(orderId: string, event: { type: string; eventAt?: Date | null }, db: TrackingDb = prisma) {
  const order = await loadOrder(db, orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (!order.shipment) throw new Error("SHIPMENT_NOT_FOUND");
  const at = event.eventAt || new Date();
  if (at.getTime() > Date.now() + 15 * 60 * 1000) throw new Error("SHIPMENT_EVENT_FUTURE");
  if (order.shipment.shippedAt && at.getTime() < order.shipment.shippedAt.getTime()) throw new Error("SHIPMENT_EVENT_BEFORE_SHIPMENT");
  if (event.type === "DELIVERED") throw new Error("SHIPMENT_DELIVERED_USE_FULFILMENT");
  if (["RTO_INITIATED", "RTO_DELIVERED"].includes(event.type) && order.status === "DELIVERED") throw new Error("SHIPMENT_EVENT_AFTER_DELIVERY");
  if (event.type === "RTO_DELIVERED" && !order.shipment.events.some((item) => item.type === "RTO_INITIATED")) throw new Error("RTO_INITIATION_REQUIRED");
  return true;
}

export async function fulfilmentShipmentTrackingHealth() {
  const rows = await prisma.order.findMany({
    where: { status: { in: ["SHIPPED", "DELIVERED"] }, createdAt: { gte: new Date(Date.now() - 90 * DAY) } },
    select: { id: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const results = await Promise.all(rows.map((row) => getShipmentTrackingHealth(row.id)));
  return {
    checkedOrders: results.length,
    healthy: results.filter((item) => item.status === "HEALTHY").length,
    review: results.filter((item) => item.status === "REVIEW").length,
    blocked: results.filter((item) => item.status === "BLOCK").length,
    stale: results.filter((item) => item.issues.some((issue) => ["TRACKING_STALE_72H", "OUT_FOR_DELIVERY_STALE"].includes(issue.code))).length,
    overdue: results.filter((item) => item.issues.some((issue) => issue.code === "TRACKING_ETA_OVERDUE")).length,
    activeExceptions: results.filter((item) => item.issues.some((issue) => ["TRACKING_EXCEPTION_ACTIVE", "TRACKING_RTO_ACTIVE", "TRACKING_RTO_COMPLETED"].includes(issue.code))).length,
    blockingIssues: results.reduce((sum, item) => sum + item.blockCount, 0),
    reviewIssues: results.reduce((sum, item) => sum + item.reviewCount, 0),
    note: "Read-only Phase 81 tracking health. Courier-event writes remain explicit admin actions and are validated before persistence.",
  };
}
