import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/prisma";

type IntegrityDb = Prisma.TransactionClient | typeof prisma;
export type OrderIntegritySeverity = "BLOCK" | "REVIEW";
export type OrderIntegrityIssue = { code: string; severity: OrderIntegritySeverity; message: string };
export type OrderIntegrityResult = {
  orderId: string;
  orderNumber: string;
  status: "PASS" | "REVIEW" | "BLOCK";
  canFulfil: boolean;
  blockCount: number;
  reviewCount: number;
  checks: {
    items: boolean;
    totals: boolean;
    payment: boolean;
    coupon: boolean;
    inventoryReservation: boolean | null;
    statusHistory: boolean;
  };
  issues: OrderIntegrityIssue[];
};

function money(value: unknown) {
  return Math.round(Number(value || 0) * 100) / 100;
}
function sameMoney(a: unknown, b: unknown) {
  return Math.abs(money(a) - money(b)) < 0.005;
}
function issue(list: OrderIntegrityIssue[], severity: OrderIntegritySeverity, code: string, message: string) {
  list.push({ severity, code, message });
}

async function loadOrder(db: IntegrityDb, orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payment: true,
      couponRedemption: { include: { coupon: { select: { code: true } } } },
      checkoutSession: { select: { id: true, status: true, orderId: true, providerOrderId: true, providerPaymentId: true } },
      statusHistory: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function getOrderIntegrity(orderId: string, db: IntegrityDb = prisma): Promise<OrderIntegrityResult> {
  const order = await loadOrder(db, orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const issues: OrderIntegrityIssue[] = [];

  if (!order.items.length) issue(issues, "BLOCK", "ORDER_ITEMS_MISSING", "Order has no line items.");
  let itemStructureOk = order.items.length > 0;
  let calculatedSubtotal = 0;
  let calculatedDiscount = 0;
  const expectedReservedByVariant = new Map<string, number>();
  for (const item of order.items) {
    const quantity = Number(item.quantity || 0);
    const unitPrice = money(item.unitPrice);
    const lineTotal = money(item.lineTotal);
    const discount = money(item.discountAmount);
    if (quantity <= 0) {
      itemStructureOk = false;
      issue(issues, "BLOCK", "ORDER_ITEM_QUANTITY_INVALID", `${item.sku} has an invalid quantity.`);
    }
    if (item.isComplimentary) {
      if (!sameMoney(unitPrice, 0) || !sameMoney(lineTotal, 0)) {
        itemStructureOk = false;
        issue(issues, "BLOCK", "COMPLIMENTARY_ITEM_VALUE_INVALID", `${item.sku} is complimentary but has a non-zero selling value.`);
      }
    } else {
      const expectedLine = money(unitPrice * quantity);
      if (!sameMoney(lineTotal, expectedLine)) {
        itemStructureOk = false;
        issue(issues, "BLOCK", "ORDER_LINE_TOTAL_MISMATCH", `${item.sku} line total does not match unit price × quantity.`);
      }
      calculatedSubtotal = money(calculatedSubtotal + lineTotal);
    }
    if (discount < 0 || discount - lineTotal > 0.005) {
      itemStructureOk = false;
      issue(issues, "BLOCK", "ORDER_LINE_DISCOUNT_INVALID", `${item.sku} has an invalid line discount.`);
    }
    calculatedDiscount = money(calculatedDiscount + discount);
    if (item.variantId && quantity > 0) expectedReservedByVariant.set(item.variantId, (expectedReservedByVariant.get(item.variantId) || 0) + quantity);
  }

  let totalsOk = true;
  if (!sameMoney(calculatedSubtotal, order.subtotal)) {
    totalsOk = false;
    issue(issues, "BLOCK", "ORDER_SUBTOTAL_MISMATCH", "Order subtotal does not match the stored paid line totals.");
  }
  if (!sameMoney(calculatedDiscount, order.discountAmount)) {
    totalsOk = false;
    issue(issues, "BLOCK", "ORDER_DISCOUNT_MISMATCH", "Order discount does not match the stored line discounts.");
  }
  const expectedTotal = money(money(order.subtotal) + money(order.shippingFee) - money(order.discountAmount));
  if (!sameMoney(expectedTotal, order.totalAmount)) {
    totalsOk = false;
    issue(issues, "BLOCK", "ORDER_TOTAL_MISMATCH", "Order total does not match subtotal + shipping − discount.");
  }
  if (money(order.totalAmount) < 0) {
    totalsOk = false;
    issue(issues, "BLOCK", "ORDER_TOTAL_NEGATIVE", "Order total cannot be negative.");
  }

  let paymentOk = true;
  if (!order.payment) {
    paymentOk = false;
    issue(issues, "BLOCK", "PAYMENT_RECORD_MISSING", "Order has no payment record.");
  } else {
    if (order.payment.method !== order.paymentMethod) {
      paymentOk = false;
      issue(issues, "BLOCK", "PAYMENT_METHOD_MISMATCH", "Payment method does not match the order payment method.");
    }
    if (!sameMoney(order.payment.amount, order.totalAmount)) {
      paymentOk = false;
      issue(issues, "BLOCK", "PAYMENT_AMOUNT_MISMATCH", "Payment amount does not match the order total.");
    }
    if (order.paymentMethod === "ONLINE" && !["CANCELLED"].includes(order.status)) {
      if (order.payment.status !== "PAID") {
        paymentOk = false;
        issue(issues, "BLOCK", "ONLINE_PAYMENT_NOT_PAID", "Online order is not backed by a paid payment record.");
      }
      if (!order.payment.providerOrderId || !order.payment.providerPaymentId || !order.payment.paidAt) {
        paymentOk = false;
        issue(issues, "BLOCK", "ONLINE_PAYMENT_REFERENCE_MISSING", "Online payment confirmation is incomplete.");
      }
    }
    if (order.paymentMethod === "COD" && order.status === "DELIVERED" && order.payment.status !== "PAID") {
      paymentOk = false;
      issue(issues, "BLOCK", "COD_COLLECTION_MISSING", "Delivered COD order is not marked collected.");
    }
    if (order.payment.status === "PAID" && !order.payment.paidAt) {
      paymentOk = false;
      issue(issues, "BLOCK", "PAYMENT_TIMESTAMP_MISSING", "Paid payment record has no payment timestamp.");
    }
  }

  let couponOk = true;
  if (order.status !== "CANCELLED") {
    if (order.couponCode && !order.couponRedemption) {
      couponOk = false;
      issue(issues, "BLOCK", "COUPON_REDEMPTION_MISSING", "Order has a coupon code but no redemption record.");
    } else if (order.couponCode && order.couponRedemption?.coupon?.code !== order.couponCode) {
      couponOk = false;
      issue(issues, "BLOCK", "COUPON_REDEMPTION_MISMATCH", "Coupon redemption does not match the order coupon code.");
    } else if (!order.couponCode && order.couponRedemption) {
      couponOk = false;
      issue(issues, "BLOCK", "UNEXPECTED_COUPON_REDEMPTION", "Order has a coupon redemption without a coupon code.");
    }
  }

  let inventoryReservationOk: boolean | null = null;
  if (!order.checkoutRequestKey) {
    issue(issues, "REVIEW", "CHECKOUT_KEY_LEGACY", "Order has no checkout request key; reservation trace cannot be verified automatically.");
  } else {
    const movements = await db.inventoryMovement.findMany({
      where: {
        type: "ORDER_RESERVATION",
        referenceType: "CHECKOUT_REQUEST",
        referenceId: order.checkoutRequestKey,
      },
      select: { variantId: true, quantityChange: true },
    });
    if (!movements.length) {
      issue(issues, "REVIEW", "RESERVATION_TRACE_MISSING", "No checkout inventory-reservation trace was found for this order.");
    } else {
      inventoryReservationOk = true;
      const actual = new Map<string, number>();
      for (const movement of movements) actual.set(movement.variantId, (actual.get(movement.variantId) || 0) + Math.abs(Number(movement.quantityChange || 0)));
      const variantIds = new Set([...expectedReservedByVariant.keys(), ...actual.keys()]);
      for (const variantId of variantIds) {
        if ((expectedReservedByVariant.get(variantId) || 0) !== (actual.get(variantId) || 0)) {
          inventoryReservationOk = false;
          issue(issues, "BLOCK", "INVENTORY_RESERVATION_MISMATCH", "Reserved stock trace does not match the order quantities.");
          break;
        }
      }
    }
  }

  let statusHistoryOk = true;
  const latestHistory = order.statusHistory.at(-1);
  if (!latestHistory || latestHistory.status !== order.status) {
    statusHistoryOk = false;
    issue(issues, "REVIEW", "STATUS_HISTORY_OUT_OF_SYNC", "Latest status-history entry does not match the current order status.");
  }
  if (order.paymentMethod === "ONLINE" && !order.checkoutSession) {
    issue(issues, "REVIEW", "ONLINE_SESSION_TRACE_MISSING", "Online order has no linked checkout-session trace.");
  }

  const blockCount = issues.filter((item) => item.severity === "BLOCK").length;
  const reviewCount = issues.filter((item) => item.severity === "REVIEW").length;
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: blockCount ? "BLOCK" : reviewCount ? "REVIEW" : "PASS",
    canFulfil: blockCount === 0,
    blockCount,
    reviewCount,
    checks: { items: itemStructureOk, totals: totalsOk, payment: paymentOk, coupon: couponOk, inventoryReservation: inventoryReservationOk, statusHistory: statusHistoryOk },
    issues,
  };
}

export async function assertOrderIntegrityForFulfilment(orderId: string, db: IntegrityDb = prisma) {
  const result = await getOrderIntegrity(orderId, db);
  if (!result.canFulfil) throw new Error(`ORDER_INTEGRITY_BLOCKED:${result.issues.filter((item) => item.severity === "BLOCK").map((item) => item.code).join(",")}`);
  return result;
}

export async function fulfilmentIntegrityHealth() {
  const rows = await prisma.order.findMany({
    where: { status: { in: ["PENDING", "CONFIRMED", "PROCESSING"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  const results = await Promise.all(rows.map((row) => getOrderIntegrity(row.id)));
  const byOrderId = Object.fromEntries(results.map((result) => [result.orderId, result]));
  return {
    checkedOrders: results.length,
    pass: results.filter((item) => item.status === "PASS").length,
    review: results.filter((item) => item.status === "REVIEW").length,
    blocked: results.filter((item) => item.status === "BLOCK").length,
    blockingIssues: results.reduce((sum, item) => sum + item.blockCount, 0),
    reviewIssues: results.reduce((sum, item) => sum + item.reviewCount, 0),
    byOrderId,
    note: "Derived read-only integrity checks. Review warnings do not block fulfilment; critical mismatches do.",
  };
}
