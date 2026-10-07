import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/prisma";

type RtoDb = Prisma.TransactionClient | typeof prisma;
export type RtoRecoverySeverity = "BLOCK" | "REVIEW" | "ACTION";
export type RtoRecoveryIssue = { code: string; severity: RtoRecoverySeverity; message: string };
export type RtoRecoveryStatus = "NOT_APPLICABLE" | "IN_TRANSIT" | "READY_TO_CLOSE" | "REFUND_REQUIRED" | "ACTION_REQUIRED" | "RECONCILED" | "BLOCK";
export type RtoRecoveryResult = {
  orderId: string;
  orderNumber: string;
  status: RtoRecoveryStatus;
  rtoInitiatedAt: Date | null;
  rtoDeliveredAt: Date | null;
  canCloseCod: boolean;
  canRefundPrepaid: boolean;
  paymentMethod: string;
  paymentStatus: string | null;
  stockRecoveryEvidence: boolean | null;
  checks: {
    rtoSequence: boolean | null;
    physicalReturn: boolean | null;
    payment: boolean | null;
    inventory: boolean | null;
    orderClosure: boolean | null;
  };
  issues: RtoRecoveryIssue[];
};

const DAY = 24 * 60 * 60 * 1000;

function addIssue(list: RtoRecoveryIssue[], severity: RtoRecoverySeverity, code: string, message: string) {
  list.push({ severity, code, message });
}

async function loadOrder(db: RtoDb, orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payment: true,
      shipment: { include: { events: { orderBy: [{ eventAt: "asc" }, { createdAt: "asc" }] } } },
    },
  });
}

export async function getRtoRecoveryHealth(orderId: string, db: RtoDb = prisma): Promise<RtoRecoveryResult> {
  const order = await loadOrder(db, orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");

  const events = order.shipment?.events || [];
  const rtoInitiated = [...events].reverse().find((event) => event.type === "RTO_INITIATED") || null;
  const rtoDelivered = [...events].reverse().find((event) => event.type === "RTO_DELIVERED") || null;
  const issues: RtoRecoveryIssue[] = [];

  if (!rtoInitiated && !rtoDelivered) {
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: "NOT_APPLICABLE",
      rtoInitiatedAt: null,
      rtoDeliveredAt: null,
      canCloseCod: false,
      canRefundPrepaid: false,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.payment?.status || null,
      stockRecoveryEvidence: null,
      checks: { rtoSequence: null, physicalReturn: null, payment: null, inventory: null, orderClosure: null },
      issues: [],
    };
  }

  let rtoSequence: boolean | null = true;
  let physicalReturn: boolean | null = Boolean(rtoDelivered);
  let paymentReady: boolean | null = null;
  let inventoryReady: boolean | null = null;
  let orderClosure: boolean | null = order.status === "CANCELLED";

  if (rtoDelivered && !rtoInitiated) {
    rtoSequence = false;
    addIssue(issues, "BLOCK", "RTO_SEQUENCE_INVALID", "RTO_DELIVERED exists without earlier RTO_INITIATED evidence.");
  }
  if (rtoInitiated && rtoDelivered && rtoDelivered.eventAt.getTime() < rtoInitiated.eventAt.getTime()) {
    rtoSequence = false;
    addIssue(issues, "BLOCK", "RTO_TIME_INVALID", "RTO delivery timestamp is earlier than RTO initiation.");
  }
  if (order.status === "DELIVERED") {
    addIssue(issues, "BLOCK", "RTO_ORDER_ALREADY_DELIVERED", "Customer delivery and RTO recovery cannot both be active for the same order.");
  }

  if (!rtoDelivered) {
    physicalReturn = false;
    addIssue(issues, "ACTION", "RTO_IN_TRANSIT", "Return-to-origin is active. Wait for physical RTO_DELIVERED evidence before restoring stock or closing the order.");
    if (rtoInitiated && Date.now() - rtoInitiated.eventAt.getTime() > 10 * DAY) {
      addIssue(issues, "REVIEW", "RTO_STALE_10D", "RTO has been in progress for more than 10 days without return-to-origin delivery evidence.");
    }
  }

  const stockMovements = await db.inventoryMovement.findMany({
    where: {
      referenceType: "ORDER",
      referenceId: order.id,
      type: { in: ["ORDER_CANCELLATION", "REFUND_RESTOCK"] as any },
      quantityChange: { gt: 0 },
    } as any,
    select: { id: true, variantId: true, quantityChange: true, type: true },
  });
  const restoredByVariant = new Map<string, number>();
  for (const movement of stockMovements) {
    restoredByVariant.set(movement.variantId, (restoredByVariant.get(movement.variantId) || 0) + Number(movement.quantityChange || 0));
  }
  const expectedByVariant = new Map<string, number>();
  for (const item of order.items) {
    if (!item.variantId) continue;
    expectedByVariant.set(item.variantId, (expectedByVariant.get(item.variantId) || 0) + Number(item.quantity || 0));
  }
  const hasExpectedItems = expectedByVariant.size > 0;
  const stockRecovered = hasExpectedItems && [...expectedByVariant.entries()].every(([variantId, quantity]) => (restoredByVariant.get(variantId) || 0) >= quantity);
  inventoryReady = order.status === "CANCELLED" ? stockRecovered : false;

  if (rtoDelivered) {
    if (order.paymentMethod === "ONLINE") {
      paymentReady = order.payment?.status === "REFUNDED";
      if (!paymentReady) addIssue(issues, "ACTION", "RTO_PREPAID_REFUND_REQUIRED", "Parcel has returned to origin but the online payment is not refunded yet.");
    } else if (order.paymentMethod === "COD") {
      paymentReady = ["PENDING", "CANCELLED"].includes(order.payment?.status || "PENDING");
      if (order.payment?.status === "PAID") {
        paymentReady = false;
        addIssue(issues, "BLOCK", "RTO_COD_ALREADY_COLLECTED", "COD payment is marked PAID on an RTO order. Reconcile the collected money before closing the return.");
      }
    } else {
      paymentReady = true;
    }

    if (order.status === "CANCELLED") {
      if (!stockRecovered) addIssue(issues, "BLOCK", "RTO_STOCK_RECOVERY_MISSING", "RTO order is cancelled but full stock-restoration evidence is missing.");
      if (order.paymentMethod === "ONLINE" && order.payment?.status !== "REFUNDED") addIssue(issues, "BLOCK", "RTO_REFUND_EVIDENCE_MISSING", "Cancelled prepaid RTO order is not marked REFUNDED.");
      if (order.paymentMethod === "COD" && order.payment?.status === "PAID") addIssue(issues, "BLOCK", "RTO_COD_PAYMENT_CONTRADICTION", "Cancelled COD RTO order still shows payment as PAID.");
    } else {
      addIssue(issues, "ACTION", "RTO_ORDER_CLOSURE_REQUIRED", "Physical RTO is complete. Close the order only after payment handling and atomic stock restoration.");
    }
  }

  const hasBlock = issues.some((item) => item.severity === "BLOCK");
  const canCloseCod = Boolean(rtoDelivered && rtoSequence && order.status === "SHIPPED" && order.paymentMethod === "COD" && paymentReady && !hasBlock);
  const canRefundPrepaid = Boolean(rtoDelivered && rtoSequence && order.status === "SHIPPED" && order.paymentMethod === "ONLINE" && order.payment?.status === "PAID" && !hasBlock);

  let status: RtoRecoveryStatus;
  if (hasBlock) status = "BLOCK";
  else if (!rtoDelivered) status = "IN_TRANSIT";
  else if (order.status === "CANCELLED" && stockRecovered && paymentReady) status = "RECONCILED";
  else if (canCloseCod) status = "READY_TO_CLOSE";
  else if (canRefundPrepaid) status = "REFUND_REQUIRED";
  else status = "ACTION_REQUIRED";

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status,
    rtoInitiatedAt: rtoInitiated?.eventAt || null,
    rtoDeliveredAt: rtoDelivered?.eventAt || null,
    canCloseCod,
    canRefundPrepaid,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.payment?.status || null,
    stockRecoveryEvidence: order.status === "CANCELLED" ? stockRecovered : null,
    checks: { rtoSequence, physicalReturn, payment: paymentReady, inventory: inventoryReady, orderClosure },
    issues,
  };
}

export async function assertCodRtoCanClose(orderId: string, db: RtoDb = prisma) {
  const health = await getRtoRecoveryHealth(orderId, db);
  if (!health.canCloseCod) {
    throw new Error(`RTO_RECOVERY_BLOCKED:${health.issues.map((item) => item.code).join(",") || health.status}`);
  }
  return health;
}

export async function assertPrepaidRtoCanRefund(orderId: string, db: RtoDb = prisma) {
  const health = await getRtoRecoveryHealth(orderId, db);
  if (!health.canRefundPrepaid) {
    throw new Error(`RTO_REFUND_BLOCKED:${health.issues.map((item) => item.code).join(",") || health.status}`);
  }
  return health;
}

export async function fulfilmentRtoRecoveryHealth() {
  const rows = await prisma.order.findMany({
    where: {
      shipment: { events: { some: { type: { in: ["RTO_INITIATED", "RTO_DELIVERED"] } } } },
      createdAt: { gte: new Date(Date.now() - 120 * DAY) },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const results = await Promise.all(rows.map((row) => getRtoRecoveryHealth(row.id)));
  return {
    checkedOrders: results.length,
    inTransit: results.filter((item) => item.status === "IN_TRANSIT").length,
    readyToClose: results.filter((item) => item.status === "READY_TO_CLOSE").length,
    refundRequired: results.filter((item) => item.status === "REFUND_REQUIRED").length,
    actionRequired: results.filter((item) => item.status === "ACTION_REQUIRED").length,
    reconciled: results.filter((item) => item.status === "RECONCILED").length,
    blocked: results.filter((item) => item.status === "BLOCK").length,
    byOrderId: Object.fromEntries(results.map((item) => [item.orderId, item])),
    note: "Phase 82 keeps RTO recovery explicit: stock is restored only after RTO_DELIVERED evidence, COD closure is atomic, and prepaid returns require provider refund before final cancellation.",
  };
}
