import { randomBytes } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/prisma";
import { evaluateCoupon } from "../utils/coupon";
import type { CouponLike } from "../utils/coupon";
import { sendOrderPlacedNotifications } from "./notification.service";
import { calculateShippingFee, getStoreSettings } from "./store.service";
import { evaluateBestMerchandisingDeal } from "./merchandising.service";

export type CheckoutInput = {
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  couponCode?: string;
  shippingAddress: { line1: string; line2?: string; landmark?: string; city: string; state: string; postalCode: string; country: string };
  items: { variantId: string; quantity: number }[];
};

type SnapshotItem = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  hsnCode: string | null;
  gstRate: number;
  promotionLabel?: string | null;
  isComplimentary?: boolean;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function makeOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `RISE-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function prepareCheckout(input: CheckoutInput, paymentMethod: "COD" | "ONLINE") {
  const requestedIds = [...new Set(input.items.map((item) => item.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: requestedIds }, isActive: true, product: { isActive: true } },
    include: { product: true },
  });
  if (variants.length !== requestedIds.length) throw new Error("PRODUCT_UNAVAILABLE");
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));

  const requestedByProduct = new Map<string, { quantity: number; name: string; limit: number | null }>();
  for (const item of input.items) {
    const variant = variantMap.get(item.variantId)!;
    const current = requestedByProduct.get(variant.productId);
    const limit = variant.product.maxPurchaseQuantity == null ? null : Number(variant.product.maxPurchaseQuantity);
    requestedByProduct.set(variant.productId, {
      quantity: (current?.quantity || 0) + item.quantity,
      name: variant.product.name,
      limit,
    });
  }
  for (const request of requestedByProduct.values()) {
    if (request.limit !== null && request.quantity > request.limit) {
      throw new Error(`PURCHASE_LIMIT:${request.name}:${request.limit}`);
    }
  }

  const paidItems: SnapshotItem[] = input.items.map((item) => {
    const variant = variantMap.get(item.variantId)!;
    const unitPrice = Number(variant.sellingPrice);
    return {
      variantId: variant.id,
      productName: variant.product.name,
      variantName: variant.name,
      sku: variant.sku,
      quantity: item.quantity,
      unitPrice,
      lineTotal: round2(unitPrice * item.quantity),
      hsnCode: variant.hsnCode ?? null,
      gstRate: Number(variant.gstRate || 0),
      promotionLabel: null,
      isComplimentary: false,
    };
  });

  const subtotal = round2(paidItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const merchandising = await evaluateBestMerchandisingDeal(input.items, subtotal);
  const freeItems: SnapshotItem[] = merchandising.freeItems.map((item: any) => ({
    variantId: item.variant.id,
    productName: item.variant.product.name,
    variantName: item.variant.name,
    sku: item.variant.sku,
    quantity: item.quantity,
    unitPrice: 0,
    lineTotal: 0,
    hsnCode: item.variant.hsnCode ?? null,
    gstRate: Number(item.variant.gstRate || 0),
    promotionLabel: item.promotionLabel || merchandising.deal?.name || "Riseora offer",
    isComplimentary: true,
  }));

  const automaticDiscountAmount = round2(merchandising.automaticDiscountAmount || 0);
  const couponBase = Math.max(0, round2(subtotal - automaticDiscountAmount));
  let coupon = null;
  let couponDiscountAmount = 0;
  if (input.couponCode) {
    coupon = await prisma.coupon.findUnique({ where: { code: input.couponCode.toUpperCase() } });
    if (!coupon) throw new Error("COUPON_NOT_FOUND");
    const evaluation = evaluateCoupon(coupon as unknown as CouponLike, couponBase);
    if (!evaluation.valid) throw new Error(`COUPON_INVALID:${evaluation.message}`);
    couponDiscountAmount = evaluation.discountAmount;
  }
  const discountAmount = round2(automaticDiscountAmount + couponDiscountAmount);
  const settings = await getStoreSettings();
  const merchandiseAfterDiscount = Math.max(0, round2(subtotal - discountAmount));
  const shippingFee = calculateShippingFee({ merchandiseAfterDiscount, paymentMethod, settings });

  return {
    items: [...paidItems, ...freeItems],
    subtotal,
    shippingFee,
    discountAmount,
    couponDiscountAmount,
    automaticDiscountAmount,
    automaticPromotionName: merchandising.deal?.name ?? null,
    automaticPromotionType: merchandising.deal?.type ?? null,
    promotionValue: Number(merchandising.promotionValue || 0),
    totalAmount: Math.max(0, round2(subtotal + shippingFee - discountAmount)),
    coupon,
  };
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

  const quantities = new Map<string, { quantity: number; sku: string }>();
  for (const item of input.items) {
    const current = quantities.get(item.variantId);
    quantities.set(item.variantId, { quantity: (current?.quantity || 0) + item.quantity, sku: item.sku });
  }
  for (const [variantId, request] of quantities) {
    const updated = await tx.productVariant.updateMany({
      where: { id: variantId, isActive: true, stockQuantity: { gte: request.quantity } },
      data: { stockQuantity: { decrement: request.quantity } },
    });
    if (updated.count !== 1) throw new Error(`OUT_OF_STOCK:${request.sku}`);
  }
}

function orderItemCreate(item: SnapshotItem) {
  return {
    variantId: item.variantId,
    productName: item.productName,
    variantName: item.variantName,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    hsnCode: item.hsnCode ?? null,
    gstRate: item.gstRate ?? 0,
    promotionLabel: item.promotionLabel || null,
    isComplimentary: Boolean(item.isComplimentary),
  };
}

export async function createCodOrder(input: CheckoutInput, userId: string | null) {
  const prepared = await prepareCheckout(input, "COD");
  const order = await prisma.$transaction(async (tx) => {
    await reserveCouponAndStock(tx, prepared);
    return tx.order.create({
      data: {
        orderNumber: makeOrderNumber(), userId, customerName: input.customerName, customerEmail: input.customerEmail || null,
        customerPhone: input.customerPhone, shippingAddress: input.shippingAddress, paymentMethod: "COD", couponCode: prepared.coupon?.code ?? null,
        automaticPromotionName: prepared.automaticPromotionName, automaticDiscountAmount: prepared.automaticDiscountAmount,
        subtotal: prepared.subtotal, shippingFee: prepared.shippingFee, discountAmount: prepared.discountAmount, totalAmount: prepared.totalAmount,
        items: { create: prepared.items.map(orderItemCreate) },
        payment: { create: { method: "COD", status: "PENDING", amount: prepared.totalAmount } },
        statusHistory: { create: { status: "PENDING", note: prepared.automaticPromotionName ? `Order placed • ${prepared.automaticPromotionName} applied` : "Order placed", source: userId ? "CUSTOMER" : "GUEST" } },
      },
      include: { items: true, payment: true, shipment: true, statusHistory: { orderBy: { createdAt: "asc" } } },
    });
  });
  void sendOrderPlacedNotifications(order).catch((error) => console.error("Order notification failed", error));
  return order;
}

export async function createOnlineCheckoutReservation(input: CheckoutInput, userId: string | null) {
  const prepared = await prepareCheckout(input, "ONLINE");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    await reserveCouponAndStock(tx, prepared);
    return tx.checkoutSession.create({
      data: {
        userId, customerName: input.customerName, customerEmail: input.customerEmail || null, customerPhone: input.customerPhone,
        shippingAddress: input.shippingAddress, couponCode: prepared.coupon?.code ?? null,
        automaticPromotionName: prepared.automaticPromotionName, automaticDiscountAmount: prepared.automaticDiscountAmount,
        subtotal: prepared.subtotal, shippingFee: prepared.shippingFee, discountAmount: prepared.discountAmount, totalAmount: prepared.totalAmount,
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
      const quantities = new Map<string, number>();
      for (const item of parseItems(session.items)) quantities.set(item.variantId, (quantities.get(item.variantId) || 0) + item.quantity);
      for (const [variantId, quantity] of quantities) await tx.productVariant.updateMany({ where: { id: variantId }, data: { stockQuantity: { increment: quantity } } });
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
        paymentMethod: "ONLINE", couponCode: existing.couponCode,
        automaticPromotionName: existing.automaticPromotionName, automaticDiscountAmount: existing.automaticDiscountAmount,
        subtotal: existing.subtotal, shippingFee: existing.shippingFee, discountAmount: existing.discountAmount, totalAmount: existing.totalAmount, status: "CONFIRMED",
        items: { create: items.map(orderItemCreate) },
        payment: { create: { method: "ONLINE", status: "PAID", provider: "RAZORPAY", providerOrderId: input.providerOrderId, providerPaymentId: input.providerPaymentId, transactionId: input.providerPaymentId, amount: existing.totalAmount, paidAt: new Date() } },
        statusHistory: { create: [{ status: "PENDING", note: existing.automaticPromotionName ? `Online payment initiated • ${existing.automaticPromotionName} applied` : "Online payment initiated", source: "PAYMENT" }, { status: "CONFIRMED", note: "Online payment received", source: "PAYMENT" }] },
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
