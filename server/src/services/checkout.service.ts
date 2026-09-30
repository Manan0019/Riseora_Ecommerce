import { randomBytes } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/prisma";
import { evaluateCoupon } from "../utils/coupon";
import type { CouponLike } from "../utils/coupon";
import { sendOrderPlacedNotifications } from "./notification.service";

export type CheckoutInput = {
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  couponCode?: string;
  shippingAddress: { line1: string; line2?: string; landmark?: string; city: string; state: string; postalCode: string; country: string };
  items: { variantId: string; quantity: number }[];
};

type SnapshotItem = { variantId: string; productName: string; variantName: string; sku: string; quantity: number; unitPrice: number; lineTotal: number };

function makeOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `RISE-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function prepareCheckout(input: CheckoutInput) {
  const requestedIds = [...new Set(input.items.map((item) => item.variantId))];
  const variants = await prisma.productVariant.findMany({ where: { id: { in: requestedIds }, isActive: true, product: { isActive: true } }, include: { product: true } });
  if (variants.length !== requestedIds.length) throw new Error("PRODUCT_UNAVAILABLE");
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
  const items: SnapshotItem[] = input.items.map((item) => {
    const variant = variantMap.get(item.variantId)!;
    const unitPrice = Number(variant.sellingPrice);
    return { variantId: variant.id, productName: variant.product.name, variantName: variant.name, sku: variant.sku, quantity: item.quantity, unitPrice, lineTotal: unitPrice * item.quantity };
  });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const shippingFee = 0;
  let coupon = null;
  let discountAmount = 0;
  if (input.couponCode) {
    coupon = await prisma.coupon.findUnique({ where: { code: input.couponCode.toUpperCase() } });
    if (!coupon) throw new Error("COUPON_NOT_FOUND");
    const evaluation = evaluateCoupon(coupon as unknown as CouponLike, subtotal);
    if (!evaluation.valid) throw new Error(`COUPON_INVALID:${evaluation.message}`);
    discountAmount = evaluation.discountAmount;
  }
  return { items, subtotal, shippingFee, discountAmount, totalAmount: Math.max(0, subtotal + shippingFee - discountAmount), coupon };
}

async function reserveCouponAndStock(tx: Prisma.TransactionClient, input: { items: SnapshotItem[]; coupon: Awaited<ReturnType<typeof prisma.coupon.findUnique>> }) {
  if (input.coupon) {
    if (input.coupon.usageLimit !== null) {
      const updated = await tx.coupon.updateMany({ where: { id: input.coupon.id, isActive: true, usageCount: { lt: input.coupon.usageLimit } }, data: { usageCount: { increment: 1 } } });
      if (updated.count !== 1) throw new Error("COUPON_LIMIT_REACHED");
    } else {
      await tx.coupon.update({ where: { id: input.coupon.id }, data: { usageCount: { increment: 1 } } });
    }
  }
  for (const item of input.items) {
    const updated = await tx.productVariant.updateMany({ where: { id: item.variantId, isActive: true, stockQuantity: { gte: item.quantity } }, data: { stockQuantity: { decrement: item.quantity } } });
    if (updated.count !== 1) throw new Error(`OUT_OF_STOCK:${item.sku}`);
  }
}

export async function createCodOrder(input: CheckoutInput, userId: string | null) {
  const prepared = await prepareCheckout(input);
  const order = await prisma.$transaction(async (tx) => {
    await reserveCouponAndStock(tx, prepared);
    return tx.order.create({
      data: {
        orderNumber: makeOrderNumber(), userId, customerName: input.customerName, customerEmail: input.customerEmail || null,
        customerPhone: input.customerPhone, shippingAddress: input.shippingAddress, paymentMethod: "COD", couponCode: prepared.coupon?.code ?? null,
        subtotal: prepared.subtotal, shippingFee: prepared.shippingFee, discountAmount: prepared.discountAmount, totalAmount: prepared.totalAmount,
        items: { create: prepared.items.map((item) => ({ variantId: item.variantId, productName: item.productName, variantName: item.variantName, sku: item.sku, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })) },
        payment: { create: { method: "COD", status: "PENDING", amount: prepared.totalAmount } },
        statusHistory: { create: { status: "PENDING", note: "Order placed", source: userId ? "CUSTOMER" : "GUEST" } },
      },
      include: { items: true, payment: true, shipment: true, statusHistory: { orderBy: { createdAt: "asc" } } },
    });
  });
  void sendOrderPlacedNotifications(order).catch((error) => console.error("Order notification failed", error));
  return order;
}

export async function createOnlineCheckoutReservation(input: CheckoutInput, userId: string | null) {
  const prepared = await prepareCheckout(input);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    await reserveCouponAndStock(tx, prepared);
    return tx.checkoutSession.create({
      data: {
        userId, customerName: input.customerName, customerEmail: input.customerEmail || null, customerPhone: input.customerPhone,
        shippingAddress: input.shippingAddress, couponCode: prepared.coupon?.code ?? null, subtotal: prepared.subtotal,
        shippingFee: prepared.shippingFee, discountAmount: prepared.discountAmount, totalAmount: prepared.totalAmount,
        amountPaise: Math.round(prepared.totalAmount * 100), items: prepared.items as unknown as Prisma.InputJsonValue,
        expiresAt, stockReserved: true,
      },
    });
  });
}

function parseItems(value: Prisma.JsonValue): SnapshotItem[] {
  if (!Array.isArray(value)) throw new Error("INVALID_CHECKOUT_ITEMS");
  return value as unknown as SnapshotItem[];
}

export async function releaseCheckoutSession(sessionId: string) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.checkoutSession.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== "PENDING") return session;
    const changed = await tx.checkoutSession.updateMany({ where: { id: session.id, status: "PENDING" }, data: { status: "CANCELLED", stockReserved: false } });
    if (changed.count !== 1) return tx.checkoutSession.findUnique({ where: { id: session.id } });
    if (session.stockReserved) {
      for (const item of parseItems(session.items)) await tx.productVariant.updateMany({ where: { id: item.variantId }, data: { stockQuantity: { increment: item.quantity } } });
      if (session.couponCode) await tx.coupon.updateMany({ where: { code: session.couponCode, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } });
    }
    return tx.checkoutSession.findUnique({ where: { id: session.id } });
  });
}

export async function releaseExpiredCheckoutSessions() {
  const expired = await prisma.checkoutSession.findMany({ where: { status: "PENDING", expiresAt: { lt: new Date() } }, select: { id: true }, take: 30 });
  for (const session of expired) await releaseCheckoutSession(session.id).catch((error) => console.error("Failed to release expired checkout", session.id, error));
}

export async function finalizeOnlineCheckout(input: { sessionId: string; providerOrderId: string; providerPaymentId: string }) {
  const existing = await prisma.checkoutSession.findUnique({ where: { id: input.sessionId }, include: { order: true } });
  if (!existing) throw new Error("CHECKOUT_NOT_FOUND");
  if (existing.status === "PAID" && existing.order) return existing.order;
  if (existing.status !== "PENDING") throw new Error("CHECKOUT_NOT_PENDING");
  if (existing.providerOrderId !== input.providerOrderId) throw new Error("PAYMENT_ORDER_MISMATCH");

  const order = await prisma.$transaction(async (tx) => {
    const locked = await tx.checkoutSession.updateMany({ where: { id: existing.id, status: "PENDING" }, data: { status: "PAID", providerPaymentId: input.providerPaymentId, stockReserved: false } });
    if (locked.count !== 1) {
      const processed = await tx.checkoutSession.findUnique({ where: { id: existing.id }, include: { order: { include: { items: true, payment: true, shipment: true, statusHistory: { orderBy: { createdAt: "asc" } } } } } });
      if (processed?.status === "PAID" && processed.order) return processed.order;
      throw new Error("CHECKOUT_ALREADY_PROCESSED");
    }
    const items = parseItems(existing.items);
    const created = await tx.order.create({
      data: {
        orderNumber: makeOrderNumber(), userId: existing.userId, customerName: existing.customerName, customerEmail: existing.customerEmail,
        customerPhone: existing.customerPhone, shippingAddress: existing.shippingAddress as Prisma.InputJsonValue,
        paymentMethod: "ONLINE", couponCode: existing.couponCode, subtotal: existing.subtotal, shippingFee: existing.shippingFee,
        discountAmount: existing.discountAmount, totalAmount: existing.totalAmount, status: "CONFIRMED",
        items: { create: items.map((item) => ({ variantId: item.variantId, productName: item.productName, variantName: item.variantName, sku: item.sku, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })) },
        payment: { create: { method: "ONLINE", status: "PAID", provider: "RAZORPAY", providerOrderId: input.providerOrderId, providerPaymentId: input.providerPaymentId, transactionId: input.providerPaymentId, amount: existing.totalAmount, paidAt: new Date() } },
        statusHistory: { create: [{ status: "PENDING", note: "Online payment initiated", source: "PAYMENT" }, { status: "CONFIRMED", note: "Online payment received", source: "PAYMENT" }] },
      },
      include: { items: true, payment: true, shipment: true, statusHistory: { orderBy: { createdAt: "asc" } } },
    });
    await tx.checkoutSession.update({ where: { id: existing.id }, data: { orderId: created.id } });
    return created;
  });
  void sendOrderPlacedNotifications(order).catch((error) => console.error("Order notification failed", error));
  return order;
}

export async function finalizeOnlineCheckoutByProviderOrder(input: { providerOrderId: string; providerPaymentId: string }) {
  const session = await prisma.checkoutSession.findUnique({ where: { providerOrderId: input.providerOrderId } });
  if (!session) throw new Error("CHECKOUT_NOT_FOUND");
  return finalizeOnlineCheckout({ sessionId: session.id, ...input });
}
