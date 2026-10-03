import { prisma } from "../config/prisma";
import { refundRazorpayPayment } from "./payment.service";
import { adjustInventory } from "./inventory.service";

async function restoreOrderInventoryAndCoupon(tx: any, order: any) {
  for (const item of order.items) {
    if (item.variantId) {
      await adjustInventory(tx, {
        variantId: item.variantId,
        delta: item.quantity,
        type: "ORDER_CANCELLATION",
        source: "ORDER",
        reason: "Cancelled order stock restored",
        referenceType: "ORDER",
        referenceId: order.id,
      });
    }
  }
  if (order.couponCode) {
    await tx.coupon.updateMany({
      where: { code: order.couponCode, usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    });
    await tx.couponRedemption.deleteMany({ where: { orderId: order.id } });
  }
}

export async function approveOrderCancellationRequest(requestId: string, adminNote?: string | null) {
  const request = await prisma.orderCancellationRequest.findUnique({
    where: { id: requestId },
    include: {
      order: { include: { items: true, payment: true, shipment: true } },
      user: true,
    },
  });
  if (!request) throw new Error("CANCELLATION_NOT_FOUND");
  if (request.status !== "REQUESTED") throw new Error("CANCELLATION_NOT_PENDING");
  if (!["PENDING", "CONFIRMED"].includes(request.order.status)) throw new Error("ORDER_TOO_FAR_ALONG");

  const order = request.order;
  let providerRefundId: string | null = null;

  if (order.paymentMethod === "ONLINE" && order.payment?.status === "PAID") {
    if (!order.payment.providerPaymentId) throw new Error("PAYMENT_NOT_REFUNDABLE");

    const prepared = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${order.id}))`;
      const freshRequest = await tx.orderCancellationRequest.findUnique({ where: { id: request.id }, include: { order: { include: { payment: true } } } });
      if (!freshRequest || freshRequest.status !== "REQUESTED") throw new Error("CANCELLATION_NOT_PENDING");
      if (!["PENDING", "CONFIRMED"].includes(freshRequest.order.status)) throw new Error("ORDER_TOO_FAR_ALONG");
      const paymentLock = await tx.payment.updateMany({ where: { orderId: order.id, status: "PAID" }, data: { status: "REFUNDING", reconciliationStatus: "UNCHECKED", reconciledAt: null, reconciliationNote: null } });
      if (paymentLock.count !== 1) throw new Error("PAYMENT_NOT_REFUNDABLE");
      await tx.orderCancellationRequest.update({ where: { id: request.id }, data: { status: "APPROVED", adminNote: adminNote || null } });
      return true;
    });
    if (!prepared) throw new Error("CANCELLATION_FAILED");

    try {
      const refund = await refundRazorpayPayment(order.payment.providerPaymentId, Math.round(Number(order.totalAmount) * 100));
      providerRefundId = refund.id;
    } catch (error) {
      await prisma.$transaction(async (tx) => {
        await tx.payment.updateMany({ where: { orderId: order.id, status: "REFUNDING" }, data: { status: "PAID", reconciliationStatus: "UNCHECKED", reconciledAt: null, reconciliationNote: null } });
        await tx.orderCancellationRequest.updateMany({ where: { id: request.id, status: "APPROVED" }, data: { status: "REQUESTED", adminNote: adminNote || null } });
      });
      throw error;
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${order.id}))`;
    const fresh = await tx.order.findUnique({ where: { id: order.id }, include: { items: true, payment: true } });
    if (!fresh) throw new Error("ORDER_NOT_FOUND");
    if (!["PENDING", "CONFIRMED"].includes(fresh.status)) throw new Error("ORDER_TOO_FAR_ALONG");

    const freshRequest = await tx.orderCancellationRequest.findUnique({ where: { id: request.id } });
    if (!freshRequest || !["REQUESTED", "APPROVED"].includes(freshRequest.status)) throw new Error("CANCELLATION_NOT_PENDING");

    await restoreOrderInventoryAndCoupon(tx, fresh);

    if (fresh.payment) {
      if (fresh.paymentMethod === "ONLINE" && fresh.payment.status === "REFUNDING") {
        await tx.payment.update({
          where: { orderId: fresh.id },
          data: {
            status: "REFUNDED",
            refundId: providerRefundId,
            refundedAmount: fresh.totalAmount,
            refundedAt: new Date(),
            reconciliationStatus: "UNCHECKED", reconciledAt: null, reconciliationNote: null,
          },
        });
      } else if (fresh.payment.status === "PENDING") {
        await tx.payment.update({ where: { orderId: fresh.id }, data: { status: "CANCELLED" } });
      }
    }

    await tx.order.update({ where: { id: fresh.id }, data: { status: "CANCELLED" } });
    await tx.orderStatusHistory.create({
      data: {
        orderId: fresh.id,
        status: "CANCELLED",
        note: fresh.paymentMethod === "ONLINE" && providerRefundId
          ? "Customer cancellation approved; online payment refunded"
          : "Customer cancellation approved",
        source: "ADMIN",
      },
    });
    await tx.orderCancellationRequest.update({
      where: { id: request.id },
      data: { status: "COMPLETED", adminNote: adminNote || null, resolvedAt: new Date() },
    });

    return tx.order.findUnique({
      where: { id: fresh.id },
      include: {
        items: true,
        payment: true,
        cancellationRequest: true,
        shipment: { include: { events: { orderBy: { eventAt: "asc" } } } },
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
    });
  });
}
