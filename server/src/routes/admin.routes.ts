import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { slugify } from "../utils/slugify";
import { sendOrderStatusNotification } from "../services/notification.service";
import { refundRazorpayPayment } from "../services/payment.service";
import { notifyStockAlertsForVariant } from "../services/stock-alert.service";
import { notifyPriceAlertsForVariant } from "../services/price-alert.service";
import { createOrderStatusInAppNotification, createUserNotification } from "../services/notification-center.service";
import { awardDeliveredOrderRewards, awardApprovedReviewReward, reverseReviewReward } from "../services/rewards.service";
import { rescheduleRefillsAfterDeliveredOrder } from "../services/refill-reminder.service";
import { availableToSell, inventoryState, setInventoryQuantity, adjustInventory } from "../services/inventory.service";
import { ensureCreditNoteForCancelledOrder } from "../services/credit-note.service";
import { adminSavingsAdvisorHealth } from "../services/savings-advisor.service";
import { communityTrustHealth } from "../services/product-trust.service";
import { productComparisonHealth } from "../services/product-comparison.service";
import { ingredientCatalogHealth } from "../services/ingredient-library.service";
import { shopDiscoveryHealth } from "../services/shop-discovery.service";
import { savedShoppingHealth } from "../services/saved-shopping.service";
import { cartQuantityHealth } from "../services/cart-quantity-intelligence.service";
import { assertOrderIntegrityForFulfilment, getOrderIntegrity } from "../services/order-integrity.service";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    res.json({ success: true, data: categories });
  }),
);

const defaultSuitabilityOptions = ["Men", "Women", "Unisex", "All"];

router.get(
  "/suitability-options",
  asyncHandler(async (_req, res) => {
    const count = await prisma.suitabilityOption.count();
    if (count === 0) {
      await prisma.suitabilityOption.createMany({
        data: defaultSuitabilityOptions.map((name, index) => ({ name, sortOrder: (index + 1) * 10 })),
        skipDuplicates: true,
      });
    }
    const items = await prisma.suitabilityOption.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    res.json({ success: true, data: items });
  }),
);

router.post(
  "/suitability-options",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid suitability value" });
    const existing = await prisma.suitabilityOption.findFirst({ where: { name: { equals: parsed.data.name, mode: "insensitive" } } });
    if (existing) {
      if (!existing.isActive) await prisma.suitabilityOption.update({ where: { id: existing.id }, data: { isActive: true } });
      return res.json({ success: true, data: { ...existing, isActive: true }, existing: true });
    }
    const last = await prisma.suitabilityOption.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const item = await prisma.suitabilityOption.create({ data: { name: parsed.data.name, sortOrder: (last?.sortOrder ?? 0) + 10 } });
    res.status(201).json({ success: true, data: item });
  }),
);

const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().optional(),
  description: z.string().trim().max(12000).optional().or(z.literal("")),
  imageUrl: z.string().trim().optional().or(z.literal("")).refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid category image URL"),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

router.post(
  "/categories",
  asyncHandler(async (req, res) => {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid category", errors: parsed.error.flatten() });
    }

    const lastCategory = await prisma.category.findFirst({ orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }], select: { sortOrder: true } });
    const category = await prisma.category.create({
      data: {
        name: parsed.data.name,
        slug: slugify(parsed.data.slug || parsed.data.name),
        description: parsed.data.description || null,
        imageUrl: parsed.data.imageUrl || null,
        sortOrder: parsed.data.sortOrder ?? ((lastCategory?.sortOrder ?? 0) + 10),
      },
    });

    res.status(201).json({ success: true, data: category });
  }),
);

const productSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().optional(),
  shortDescription: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().optional().or(z.literal("")),
  benefits: z.string().trim().max(20000).optional().or(z.literal("")),
  ingredients: z.string().trim().max(24000).optional().or(z.literal("")),
  howToUse: z.string().trim().max(20000).optional().or(z.literal("")),
  suitableFor: z.string().trim().max(2000).optional().or(z.literal("")),
  faq: z.array(z.object({ question: z.string().trim().min(2).max(300), answer: z.string().trim().min(2).max(12000) })).max(20).default([]),
  isFeatured: z.boolean().default(false),
  badge: z.string().trim().max(40).optional().or(z.literal("")),
  maxPurchaseQuantity: z.number().int().min(1).max(10000).nullable().optional(),
  codAllowed: z.boolean().default(true),
  replenishmentEnabled: z.boolean().default(false),
  replenishmentDays: z.number().int().min(7).max(180).nullable().optional(),
  replenishmentLabel: z.string().trim().max(80).optional().or(z.literal("")),
  images: z
    .array(
      z.object({
        url: z.string().trim().min(1).refine((value) => value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid image URL"),
        altText: z.string().trim().optional().or(z.literal("")),
        isPrimary: z.boolean().default(false),
      }),
    )
    .default([]),
  variants: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1),
        sku: z.string().trim().min(2).max(80),
        size: z.string().trim().optional().or(z.literal("")),
        unit: z.string().trim().optional().or(z.literal("")),
        mrp: z.number().positive(),
        sellingPrice: z.number().positive(),
        costPrice: z.number().nonnegative().optional(),
        stockQuantity: z.number().int().nonnegative().default(0),
        lowStockThreshold: z.number().int().nonnegative().default(5),
        safetyStock: z.number().int().nonnegative().default(0),
        weightGrams: z.number().positive().optional(),
        hsnCode: z.string().trim().max(30).optional().or(z.literal("")),
        gstRate: z.number().min(0).max(100).default(0),
        isActive: z.boolean().default(true),
      }),
    )
    .min(1),
});

function normalizedProductImages(images: Array<{ url: string; altText?: string; isPrimary?: boolean }>, productName: string) {
  const requestedPrimary = images.findIndex((image) => image.isPrimary);
  const primaryIndex = requestedPrimary >= 0 ? requestedPrimary : 0;
  return images.map((image, index) => ({
    url: image.url,
    altText: image.altText || productName,
    isPrimary: index === primaryIndex,
    sortOrder: index,
  }));
}

router.get(
  "/products",
  asyncHandler(async (_req, res) => {
    const products = await prisma.product.findMany({
      include: { category: true, images: { orderBy: { sortOrder: "asc" } }, variants: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: products });
  }),
);

router.post(
  "/products",
  asyncHandler(async (req, res) => {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid product", errors: parsed.error.flatten() });
    }

    const product = await prisma.product.create({
      data: {
        categoryId: parsed.data.categoryId,
        name: parsed.data.name,
        slug: slugify(parsed.data.slug || parsed.data.name),
        shortDescription: parsed.data.shortDescription || null,
        description: parsed.data.description || null,
        benefits: parsed.data.benefits || null,
        ingredients: parsed.data.ingredients || null,
        howToUse: parsed.data.howToUse || null,
        suitableFor: parsed.data.suitableFor || null,
        faq: parsed.data.faq as any,
        isFeatured: parsed.data.isFeatured,
        badge: parsed.data.badge || null,
        maxPurchaseQuantity: parsed.data.maxPurchaseQuantity ?? null,
        codAllowed: parsed.data.codAllowed,
        replenishmentEnabled: parsed.data.replenishmentEnabled,
        replenishmentDays: parsed.data.replenishmentEnabled ? (parsed.data.replenishmentDays ?? 30) : null,
        replenishmentLabel: parsed.data.replenishmentEnabled ? (parsed.data.replenishmentLabel || null) : null,
        images: {
          create: normalizedProductImages(parsed.data.images, parsed.data.name),
        },
        variants: {
          create: parsed.data.variants.map((variant) => ({
            name: variant.name,
            sku: variant.sku,
            size: variant.size || null,
            unit: variant.unit || null,
            mrp: variant.mrp,
            sellingPrice: variant.sellingPrice,
            costPrice: variant.costPrice ?? null,
            stockQuantity: variant.stockQuantity,
            lowStockThreshold: variant.lowStockThreshold,
            safetyStock: variant.safetyStock,
            weightGrams: variant.weightGrams ?? null,
            hsnCode: variant.hsnCode || null,
            gstRate: variant.gstRate,
            isActive: variant.isActive,
          })),
        },
      },
      include: { category: true, images: true, variants: true },
    });

    const openingMovements = product.variants
      .filter((variant) => Number(variant.stockQuantity || 0) !== 0)
      .map((variant) => ({
        variantId: variant.id,
        type: "OPENING_STOCK" as any,
        source: "ADMIN" as any,
        quantityChange: Number(variant.stockQuantity || 0),
        stockBefore: 0,
        stockAfter: Number(variant.stockQuantity || 0),
        safetyStockSnapshot: Math.max(0, Number(variant.safetyStock || 0)),
        reason: "Initial stock entered when product was created",
        referenceType: "PRODUCT",
        referenceId: product.id,
        actorUserId: req.user!.id,
      }));
    if (openingMovements.length) await prisma.inventoryMovement.createMany({ data: openingMovements });

    res.status(201).json({ success: true, data: product });
  }),
);


router.patch(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      isActive: z.boolean().optional(),
      isFeatured: z.boolean().optional(),
      badge: z.string().trim().max(40).nullable().optional(),
      codAllowed: z.boolean().optional(),
      replenishmentEnabled: z.boolean().optional(),
      replenishmentDays: z.number().int().min(7).max(180).nullable().optional(),
      replenishmentLabel: z.string().trim().max(80).nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid product update" });
    const existingProduct = await prisma.product.findUnique({ where: { id: String(req.params.id) }, select: { erpManaged: true } });
    if (!existingProduct) return res.status(404).json({ success: false, message: "Product not found" });
    if (existingProduct.erpManaged && parsed.data.isActive !== undefined) {
      return res.status(409).json({ success: false, message: "This product is managed by Riseora ERP. Change its active state in ERP." });
    }
    const product = await prisma.product.update({ where: { id: String(req.params.id) }, data: parsed.data });
    res.json({ success: true, data: product });
  }),
);

router.get(
  "/orders",
  asyncHandler(async (_req, res) => {
    const orders = await prisma.order.findMany({
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        items: true,
        payment: true,
        cancellationRequest: true,
        shipment: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: orders });
  }),
);

router.get(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: String(req.params.id) },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        items: true,
        payment: true,
        shipment: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    const integrity = await getOrderIntegrity(order.id);
    res.json({ success: true, data: { ...order, integrity } });
  }),
);

const orderStatuses = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
const fulfilmentSchema = z.object({
  status: z.enum(orderStatuses),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  carrier: z.string().trim().max(80).optional().or(z.literal("")),
  trackingNumber: z.string().trim().max(120).optional().or(z.literal("")),
  trackingUrl: z.string().trim().url().optional().or(z.literal("")),
});

const allowedTransitions: Record<(typeof orderStatuses)[number], (typeof orderStatuses)[number][]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

async function updateFulfilment(orderId: string, payload: z.infer<typeof fulfilmentSchema>) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { variant: { select: { weightGrams: true } } } }, payment: true, cancellationRequest: true, shipment: { include: { events: true } } },
    });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.cancellationRequest && ["REQUESTED", "APPROVED"].includes(order.cancellationRequest.status) && payload.status !== "CANCELLED") {
      throw new Error("CANCELLATION_REQUEST_PENDING");
    }

    const isSameStatus = order.status === payload.status;
    if (!isSameStatus && payload.status !== "CANCELLED") {
      await assertOrderIntegrityForFulfilment(order.id, tx);
    }
    if (!isSameStatus && !allowedTransitions[order.status].includes(payload.status)) {
      throw new Error(`INVALID_TRANSITION:${order.status}:${payload.status}`);
    }

    if (payload.status === "SHIPPED" && (!payload.carrier || !payload.trackingNumber)) {
      throw new Error("SHIPMENT_DETAILS_REQUIRED");
    }

    let resolvedTrackingUrl = payload.trackingUrl || "";
    let resolvedPartnerId: string | null = null;
    if (payload.carrier) {
      const partner = await tx.shippingPartner.findFirst({ where: { name: payload.carrier, isActive: true } });
      if (partner) {
        resolvedPartnerId = partner.id;
        const totalWeightGrams = order.items.reduce((sum, item) => sum + Math.max(0, Number(item.variant?.weightGrams || 0)) * item.quantity, 0);
        if (order.paymentMethod === "COD" && !partner.supportsCod) throw new Error("COURIER_COD_UNAVAILABLE");
        if (partner.maxWeightGrams != null && totalWeightGrams > Number(partner.maxWeightGrams)) throw new Error("COURIER_WEIGHT_EXCEEDED");
        if (payload.trackingNumber && !resolvedTrackingUrl && partner.trackingUrlTemplate) resolvedTrackingUrl = partner.trackingUrlTemplate.replaceAll("{trackingNumber}", encodeURIComponent(payload.trackingNumber));
      }
    }

    if (!isSameStatus && payload.status === "CANCELLED") {
      if (order.paymentMethod === "ONLINE" && order.payment?.status === "PAID") throw new Error("PREPAID_REFUND_REQUIRED");
      for (const item of order.items) {
        if (item.variantId) {
          await adjustInventory(tx, {
            variantId: item.variantId,
            delta: item.quantity,
            type: "ORDER_CANCELLATION",
            source: "ORDER",
            reason: "Admin order cancellation restored stock",
            referenceType: "ORDER",
            referenceId: order.id,
            actorUserId: null,
          });
        }
      }
      if (order.couponCode) {
        await tx.coupon.updateMany({ where: { code: order.couponCode, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } });
        await tx.couponRedemption.deleteMany({ where: { orderId: order.id } });
      }
      if (order.payment?.status === "PENDING") {
        await tx.payment.update({ where: { orderId: order.id }, data: { status: "CANCELLED" } });
      }
      if (order.cancellationRequest && ["REQUESTED", "APPROVED"].includes(order.cancellationRequest.status)) {
        await tx.orderCancellationRequest.update({ where: { id: order.cancellationRequest.id }, data: { status: "COMPLETED", resolvedAt: new Date(), adminNote: payload.note || order.cancellationRequest.adminNote || null } });
      }
    }

    if (payload.status === "SHIPPED") {
      const estimate = order.deliveryEstimate && typeof order.deliveryEstimate === "object" && !Array.isArray(order.deliveryEstimate)
        ? order.deliveryEstimate as Record<string, unknown>
        : null;
      const deliveryMaxDays = Math.max(1, Number(estimate?.deliveryMaxDays || 5));
      const defaultEstimatedDeliveryAt = new Date(Date.now() + deliveryMaxDays * 24 * 60 * 60 * 1000);
      const shipment = await tx.shipment.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          shippingPartnerId: resolvedPartnerId,
          carrier: payload.carrier || null,
          trackingNumber: payload.trackingNumber || null,
          trackingUrl: resolvedTrackingUrl || null,
          shippedAt: new Date(),
          estimatedDeliveryAt: defaultEstimatedDeliveryAt,
        },
        update: {
          shippingPartnerId: resolvedPartnerId,
          carrier: payload.carrier || null,
          trackingNumber: payload.trackingNumber || null,
          trackingUrl: resolvedTrackingUrl || null,
          shippedAt: order.shipment?.shippedAt ?? new Date(),
          estimatedDeliveryAt: order.shipment?.estimatedDeliveryAt ?? defaultEstimatedDeliveryAt,
        },
      });
      if (!isSameStatus) {
        await tx.shipmentEvent.create({
          data: { shipmentId: shipment.id, type: "PICKED_UP", title: "Shipment handed to courier", note: payload.note || null, customerVisible: true },
        });
      }
    } else if (order.shipment && (payload.carrier || payload.trackingNumber || payload.trackingUrl)) {
      await tx.shipment.update({
        where: { orderId: order.id },
        data: {
          ...(payload.carrier ? { carrier: payload.carrier, shippingPartnerId: resolvedPartnerId } : {}),
          ...(payload.trackingNumber ? { trackingNumber: payload.trackingNumber } : {}),
          ...(resolvedTrackingUrl ? { trackingUrl: resolvedTrackingUrl } : {}),
        },
      });
    }

    if (!isSameStatus && payload.status === "DELIVERED") {
      const shipment = await tx.shipment.upsert({
        where: { orderId: order.id },
        create: { orderId: order.id, deliveredAt: new Date() },
        update: { deliveredAt: new Date() },
      });
      await tx.shipmentEvent.create({
        data: { shipmentId: shipment.id, type: "DELIVERED", title: "Delivered", note: payload.note || "Your Riseora order was delivered.", customerVisible: true },
      });
      if (order.paymentMethod === "COD" && order.payment) {
        await tx.payment.update({ where: { orderId: order.id }, data: { status: "PAID", paidAt: new Date(), collectionReference: `COD-${order.orderNumber}`, reconciliationStatus: "MATCHED", reconciledAt: new Date(), reconciliationNote: "COD collected on delivery" } });
      }
    }

    if (!isSameStatus) {
      await tx.order.update({ where: { id: order.id }, data: { status: payload.status } });
    }

    if (!isSameStatus || payload.note) {
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: payload.status, note: payload.note || null, source: "ADMIN" },
      });
    }

    return tx.order.findUnique({
      where: { id: order.id },
      include: { items: true, payment: true, cancellationRequest: true, shipment: { include: { events: { orderBy: { eventAt: "asc" } } } }, statusHistory: { orderBy: { createdAt: "asc" } } },
    });
  });
}

const shipmentEventTypes = ["LABEL_CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION", "RTO_INITIATED", "RTO_DELIVERED", "NOTE"] as const;

router.patch(
  "/orders/:id/shipment-estimate",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ estimatedDeliveryAt: z.string().datetime().nullable() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid delivery estimate" });
    const order = await prisma.order.findUnique({ where: { id: String(req.params.id) }, include: { shipment: true } });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (!["SHIPPED", "DELIVERED"].includes(order.status) && !order.shipment) return res.status(409).json({ success: false, message: "Add shipment details before setting a delivery estimate" });
    const shipment = await prisma.shipment.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, estimatedDeliveryAt: parsed.data.estimatedDeliveryAt ? new Date(parsed.data.estimatedDeliveryAt) : null },
      update: { estimatedDeliveryAt: parsed.data.estimatedDeliveryAt ? new Date(parsed.data.estimatedDeliveryAt) : null },
      include: { events: { orderBy: { eventAt: "asc" } } },
    });
    res.json({ success: true, data: shipment });
  }),
);

router.post(
  "/orders/:id/shipment-events",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      type: z.enum(shipmentEventTypes),
      title: z.string().trim().min(2).max(140),
      note: z.string().trim().max(1000).optional().or(z.literal("")),
      location: z.string().trim().max(160).optional().or(z.literal("")),
      customerVisible: z.boolean().default(true),
      eventAt: z.string().datetime().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid shipment event", errors: parsed.error.flatten() });

    const order = await prisma.order.findUnique({ where: { id: String(req.params.id) }, include: { shipment: true } });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (!order.shipment) return res.status(409).json({ success: false, message: "Create shipment details before adding courier events" });

    const event = await prisma.shipmentEvent.create({
      data: {
        shipmentId: order.shipment.id,
        type: parsed.data.type,
        title: parsed.data.title,
        note: parsed.data.note || null,
        location: parsed.data.location || null,
        customerVisible: parsed.data.customerVisible,
        eventAt: parsed.data.eventAt ? new Date(parsed.data.eventAt) : new Date(),
      },
    });

    if (parsed.data.customerVisible && order.userId && ["OUT_FOR_DELIVERY", "EXCEPTION", "RTO_INITIATED"].includes(parsed.data.type)) {
      await createUserNotification({
        userId: order.userId,
        title: parsed.data.title,
        message: parsed.data.note || `Shipment update for order ${order.orderNumber}.`,
        type: "ORDER",
        ctaLabel: "Track order",
        ctaUrl: `/orders/${order.orderNumber}`,
        metadata: { orderId: order.id, shipmentEventId: event.id, type: parsed.data.type },
        dedupeKey: `shipment-event/${event.id}`,
      });
    }

    res.status(201).json({ success: true, data: event });
  }),
);

router.post(
  "/orders/:id/refund",
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: String(req.params.id) }, include: { items: true, payment: true, shipment: true } });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (["SHIPPED", "DELIVERED", "CANCELLED"].includes(order.status)) return res.status(400).json({ success: false, message: "This order can no longer be refunded from the dashboard" });
    if (order.paymentMethod !== "ONLINE" || !order.payment?.providerPaymentId || order.payment.status !== "PAID") return res.status(400).json({ success: false, message: "This order does not have a refundable online payment" });

    const locked = await prisma.payment.updateMany({ where: { orderId: order.id, status: "PAID" }, data: { status: "REFUNDING", reconciliationStatus: "UNCHECKED", reconciledAt: null, reconciliationNote: null } });
    if (locked.count !== 1) return res.status(409).json({ success: false, message: "This payment is already being refunded or is no longer refundable" });

    let refund;
    try {
      refund = await refundRazorpayPayment(order.payment.providerPaymentId, Math.round(Number(order.totalAmount) * 100));
    } catch (error) {
      await prisma.payment.updateMany({ where: { orderId: order.id, status: "REFUNDING" }, data: { status: "PAID", reconciliationStatus: "UNCHECKED", reconciledAt: null, reconciliationNote: null } });
      if (error instanceof Error && error.message === "PAYMENT_REFUND_FAILED") return res.status(502).json({ success: false, message: "Refund could not be completed by the payment provider. No order data was changed." });
      throw error;
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of order.items) if (item.variantId) await adjustInventory(tx, {
        variantId: item.variantId,
        delta: item.quantity,
        type: "REFUND_RESTOCK",
        source: "ORDER",
        reason: "Online payment refund cancelled order and restored stock",
        referenceType: "ORDER",
        referenceId: order.id,
        actorUserId: req.user!.id,
      });
      if (order.couponCode) { await tx.coupon.updateMany({ where: { code: order.couponCode, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } }); await tx.couponRedemption.deleteMany({ where: { orderId: order.id } }); }
      await tx.payment.update({ where: { orderId: order.id }, data: { status: "REFUNDED", refundId: refund.id, refundedAmount: order.totalAmount, refundedAt: new Date(), reconciliationStatus: "UNCHECKED", reconciledAt: null, reconciliationNote: null } });
      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
      await tx.orderStatusHistory.create({ data: { orderId: order.id, status: "CANCELLED", note: "Online payment refunded and order cancelled", source: "ADMIN" } });
      await tx.orderCancellationRequest.updateMany({ where: { orderId: order.id, status: { in: ["REQUESTED", "APPROVED"] } }, data: { status: "COMPLETED", resolvedAt: new Date(), adminNote: "Online payment refunded and cancellation completed" } });
      return tx.order.findUnique({ where: { id: order.id }, include: { items: true, payment: true, cancellationRequest: true, shipment: { include: { events: { orderBy: { eventAt: "asc" } } } }, statusHistory: { orderBy: { createdAt: "asc" } } } });
    });
    if (updated) {
      void sendOrderStatusNotification(updated).catch((error) => console.error("Refund email failed", error));
      void createOrderStatusInAppNotification(updated).catch((error) => console.error("Refund in-app notification failed", error));
      try { await ensureCreditNoteForCancelledOrder(updated.id); } catch (error) { console.error("Cancellation credit note issuance failed", error); }
    }
    res.json({ success: true, data: updated });
  }),
);

router.patch(
  "/orders/:id/fulfilment",
  asyncHandler(async (req, res) => {
    const parsed = fulfilmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid fulfilment update", errors: parsed.error.flatten() });
    try {
      const order = await updateFulfilment(String(req.params.id), parsed.data);
      if (order) {
        void sendOrderStatusNotification(order).catch((error) => console.error("Order status email failed", error));
        void createOrderStatusInAppNotification(order).catch((error) => console.error("Order status in-app notification failed", error));
        if (order.status === "DELIVERED") {
          void awardDeliveredOrderRewards(order.id).catch((error) => console.error("Rewards delivery award failed", error));
          void rescheduleRefillsAfterDeliveredOrder(order.id).catch((error) => console.error("Refill delivery reschedule failed", error));
        }
      }
      res.json({ success: true, data: order });
    } catch (error) {
      const message = error instanceof Error ? error.message : "FULFILMENT_FAILED";
      if (message === "ORDER_NOT_FOUND") return res.status(404).json({ success: false, message: "Order not found" });
      if (message === "SHIPMENT_DETAILS_REQUIRED") return res.status(400).json({ success: false, message: "Carrier and tracking number are required before marking an order shipped" });
      if (message === "COURIER_COD_UNAVAILABLE") return res.status(400).json({ success: false, message: "The selected courier is not configured for Cash on Delivery. Choose another courier or update Shipping settings." });
      if (message === "COURIER_WEIGHT_EXCEEDED") return res.status(400).json({ success: false, message: "The selected courier cannot carry this order weight. Choose another courier or adjust its weight limit in Shipping settings." });
      if (message === "PREPAID_REFUND_REQUIRED") return res.status(400).json({ success: false, message: "Refund the online payment before cancelling this order" });
      if (message === "CANCELLATION_REQUEST_PENDING") return res.status(409).json({ success: false, message: "Resolve the pending customer cancellation request before moving this order forward" });
      if (message.startsWith("ORDER_INTEGRITY_BLOCKED:")) return res.status(409).json({ success: false, code: "ORDER_INTEGRITY_BLOCKED", message: "Order integrity checks found a critical mismatch. Review the Phase 79 integrity panel before moving fulfilment forward." });
      if (message.startsWith("INVALID_TRANSITION:")) return res.status(400).json({ success: false, message: "That order status change is not allowed" });
      throw error;
    }
  }),
);

router.patch(
  "/orders/:id/status",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ status: z.enum(orderStatuses) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid order status" });
    try {
      const order = await updateFulfilment(String(req.params.id), { status: parsed.data.status });
      if (order) {
        void sendOrderStatusNotification(order).catch((error) => console.error("Order status email failed", error));
        void createOrderStatusInAppNotification(order).catch((error) => console.error("Order status in-app notification failed", error));
        if (order.status === "DELIVERED") {
          void awardDeliveredOrderRewards(order.id).catch((error) => console.error("Rewards delivery award failed", error));
          void rescheduleRefillsAfterDeliveredOrder(order.id).catch((error) => console.error("Refill delivery reschedule failed", error));
        }
      }
      res.json({ success: true, data: order });
    } catch (error) {
      const message = error instanceof Error ? error.message : "FULFILMENT_FAILED";
      if (message === "SHIPMENT_DETAILS_REQUIRED") return res.status(400).json({ success: false, message: "Use order details to add shipping information before marking this order shipped" });
      if (message === "COURIER_COD_UNAVAILABLE") return res.status(400).json({ success: false, message: "The selected courier is not configured for Cash on Delivery. Choose another courier or update Shipping settings." });
      if (message === "COURIER_WEIGHT_EXCEEDED") return res.status(400).json({ success: false, message: "The selected courier cannot carry this order weight. Choose another courier or adjust its weight limit in Shipping settings." });
      if (message === "PREPAID_REFUND_REQUIRED") return res.status(400).json({ success: false, message: "Refund the online payment before cancelling this order" });
      if (message === "CANCELLATION_REQUEST_PENDING") return res.status(409).json({ success: false, message: "Resolve the pending customer cancellation request before moving this order forward" });
      if (message.startsWith("INVALID_TRANSITION:")) return res.status(400).json({ success: false, message: "That order status change is not allowed" });
      if (message === "ORDER_NOT_FOUND") return res.status(404).json({ success: false, message: "Order not found" });
      throw error;
    }
  }),
);



router.get(
  "/promotions/savings-health",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: adminSavingsAdvisorHealth() });
  }),
);

const couponSchema = z.object({
  code: z.string().trim().min(3).max(40),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.number().positive(),
  scope: z.enum(["ORDER", "PRODUCT", "CATEGORY"]).default("ORDER"),
  application: z.enum(["ORDER_TOTAL", "ELIGIBLE_ITEMS"]).default("ORDER_TOTAL"),
  productIds: z.array(z.string().uuid()).max(200).default([]),
  categoryIds: z.array(z.string().uuid()).max(100).default([]),
  minOrderAmount: z.number().nonnegative().optional(),
  maxDiscountAmount: z.number().nonnegative().optional(),
  usageLimit: z.number().int().positive().optional(),
  perCustomerUsageLimit: z.number().int().positive().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

const couponInclude = {
  products: { include: { product: { select: { id: true, name: true, slug: true } } } },
  categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
} as const;

function couponWriteData(data: z.infer<typeof couponSchema>) {
  const startsAt = data.startsAt ? new Date(data.startsAt) : null;
  const endsAt = data.endsAt ? new Date(data.endsAt) : null;
  if (startsAt && endsAt && endsAt <= startsAt) throw new Error("COUPON_DATE_RANGE");
  if (data.discountType === "PERCENTAGE" && data.discountValue > 100) throw new Error("COUPON_PERCENTAGE");
  if (data.scope === "PRODUCT" && data.productIds.length === 0) throw new Error("COUPON_TARGET_REQUIRED");
  if (data.scope === "CATEGORY" && data.categoryIds.length === 0) throw new Error("COUPON_TARGET_REQUIRED");
  return { startsAt, endsAt };
}

router.get(
  "/coupons",
  asyncHandler(async (_req, res) => {
    const coupons = await prisma.coupon.findMany({ where: { rewardOwnerUserId: null }, include: couponInclude, orderBy: { createdAt: "desc" } });
    res.json({ success: true, data: coupons });
  }),
);

router.post(
  "/coupons",
  asyncHandler(async (req, res) => {
    const parsed = couponSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid coupon", errors: parsed.error.flatten() });
    let dates;
    try { dates = couponWriteData(parsed.data); } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "COUPON_DATE_RANGE") return res.status(400).json({ success: false, message: "Coupon end date must be after the start date" });
      if (code === "COUPON_PERCENTAGE") return res.status(400).json({ success: false, message: "Percentage discount cannot exceed 100%" });
      if (code === "COUPON_TARGET_REQUIRED") return res.status(400).json({ success: false, message: "Select at least one target product or category" });
      throw error;
    }
    const data = parsed.data;
    const coupon = await prisma.coupon.create({
      data: {
        code: data.code.toUpperCase(), description: data.description || null, discountType: data.discountType, discountValue: data.discountValue,
        scope: data.scope, application: data.application, minOrderAmount: data.minOrderAmount ?? null, maxDiscountAmount: data.maxDiscountAmount ?? null,
        usageLimit: data.usageLimit ?? null, perCustomerUsageLimit: data.perCustomerUsageLimit === undefined ? 1 : data.perCustomerUsageLimit, startsAt: dates.startsAt, endsAt: dates.endsAt,
        products: data.scope === "PRODUCT" ? { create: data.productIds.map((productId) => ({ productId })) } : undefined,
        categories: data.scope === "CATEGORY" ? { create: data.categoryIds.map((categoryId) => ({ categoryId })) } : undefined,
      },
      include: couponInclude,
    });
    res.status(201).json({ success: true, data: coupon });
  }),
);

router.put(
  "/coupons/:id",
  asyncHandler(async (req, res) => {
    const parsed = couponSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid coupon", errors: parsed.error.flatten() });
    let dates;
    try { dates = couponWriteData(parsed.data); } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "COUPON_DATE_RANGE") return res.status(400).json({ success: false, message: "Coupon end date must be after the start date" });
      if (code === "COUPON_PERCENTAGE") return res.status(400).json({ success: false, message: "Percentage discount cannot exceed 100%" });
      if (code === "COUPON_TARGET_REQUIRED") return res.status(400).json({ success: false, message: "Select at least one target product or category" });
      throw error;
    }
    const data = parsed.data;
    const coupon = await prisma.$transaction(async (tx) => {
      await tx.couponProduct.deleteMany({ where: { couponId: String(req.params.id) } });
      await tx.couponCategory.deleteMany({ where: { couponId: String(req.params.id) } });
      return tx.coupon.update({
        where: { id: String(req.params.id) },
        data: {
          code: data.code.toUpperCase(), description: data.description || null, discountType: data.discountType, discountValue: data.discountValue,
          scope: data.scope, application: data.application, minOrderAmount: data.minOrderAmount ?? null, maxDiscountAmount: data.maxDiscountAmount ?? null,
          usageLimit: data.usageLimit ?? null, perCustomerUsageLimit: data.perCustomerUsageLimit === undefined ? 1 : data.perCustomerUsageLimit, startsAt: dates.startsAt, endsAt: dates.endsAt,
          products: data.scope === "PRODUCT" ? { create: data.productIds.map((productId) => ({ productId })) } : undefined,
          categories: data.scope === "CATEGORY" ? { create: data.categoryIds.map((categoryId) => ({ categoryId })) } : undefined,
        },
        include: couponInclude,
      });
    });
    res.json({ success: true, data: coupon });
  }),
);

router.patch(
  "/coupons/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid coupon update" });
    const coupon = await prisma.coupon.update({ where: { id: String(req.params.id) }, data: { isActive: parsed.data.isActive }, include: couponInclude });
    res.json({ success: true, data: coupon });
  }),
);

const offerSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().optional().or(z.literal("")),
  badge: z.string().trim().max(60).optional().or(z.literal("")),
  ctaText: z.string().trim().max(60).optional().or(z.literal("")),
  ctaLink: z.string().trim().max(200).optional().or(z.literal("")),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

router.get(
  "/offers",
  asyncHandler(async (_req, res) => {
    const offers = await prisma.offer.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] });
    res.json({ success: true, data: offers });
  }),
);

router.post(
  "/offers",
  asyncHandler(async (req, res) => {
    const parsed = offerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid offer", errors: parsed.error.flatten() });
    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) return res.status(400).json({ success: false, message: "Offer end date must be after the start date" });
    const offer = await prisma.offer.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        badge: parsed.data.badge || null,
        ctaText: parsed.data.ctaText || null,
        ctaLink: parsed.data.ctaLink || null,
        startsAt,
        endsAt,
        priority: parsed.data.priority ?? 0,
      },
    });
    res.status(201).json({ success: true, data: offer });
  }),
);

router.patch(
  "/offers/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid offer update" });
    const offer = await prisma.offer.update({ where: { id: String(req.params.id) }, data: { isActive: parsed.data.isActive } });
    res.json({ success: true, data: offer });
  }),
);


const bannerSchema = z.object({
  placement: z.enum(["HOME_HERO", "HOME_STRIP"]).default("HOME_HERO"),
  eyebrow: z.string().trim().max(80).optional().or(z.literal("")),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(12000).optional().or(z.literal("")),
  imageUrl: z.string().trim().optional().or(z.literal("")).refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid desktop image URL"),
  mobileImageUrl: z.string().trim().optional().or(z.literal("")).refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid mobile image URL"),
  imageAlt: z.string().trim().max(180).optional().or(z.literal("")),
  ctaText: z.string().trim().max(60).optional().or(z.literal("")),
  ctaLink: z.string().trim().max(220).optional().or(z.literal("")),
  background: z.string().trim().max(40).optional().or(z.literal("")),
  textColor: z.string().trim().max(40).optional().or(z.literal("")),
  titleFontFamily: z.enum(["Inter", "Georgia", "Arial", "Verdana", "Times New Roman", "Trebuchet MS"]).optional().or(z.literal("")),
  titleFontWeight: z.number().int().min(400).max(900).optional(),
  titleFontStyle: z.enum(["normal", "italic"]).optional(),
  titleTextAlign: z.enum(["left", "center", "right"]).optional(),
  titleSize: z.enum(["M", "L", "XL", "XXL"]).optional(),
  descriptionFontFamily: z.enum(["Inter", "Georgia", "Arial", "Verdana", "Times New Roman", "Trebuchet MS"]).optional().or(z.literal("")),
  descriptionTextAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

router.get(
  "/banners",
  asyncHandler(async (_req, res) => {
    const banners = await prisma.banner.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] });
    res.json({ success: true, data: banners });
  }),
);

router.post(
  "/banners",
  asyncHandler(async (req, res) => {
    const parsed = bannerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid banner", errors: parsed.error.flatten() });
    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) return res.status(400).json({ success: false, message: "Banner end date must be after the start date" });
    const banner = await prisma.banner.create({
      data: {
        placement: parsed.data.placement,
        eyebrow: parsed.data.eyebrow || null,
        title: parsed.data.title,
        description: parsed.data.description || null,
        imageUrl: parsed.data.imageUrl || null,
        mobileImageUrl: parsed.data.mobileImageUrl || null,
        imageAlt: parsed.data.imageAlt || null,
        ctaText: parsed.data.ctaText || null,
        ctaLink: parsed.data.ctaLink || null,
        background: parsed.data.background || null,
        textColor: parsed.data.textColor || null,
        titleFontFamily: parsed.data.titleFontFamily || null,
        titleFontWeight: parsed.data.titleFontWeight ?? 900,
        titleFontStyle: parsed.data.titleFontStyle ?? "normal",
        titleTextAlign: parsed.data.titleTextAlign ?? "left",
        titleSize: parsed.data.titleSize ?? "XL",
        descriptionFontFamily: parsed.data.descriptionFontFamily || null,
        descriptionTextAlign: parsed.data.descriptionTextAlign ?? "left",
        priority: parsed.data.priority ?? 0,
        startsAt,
        endsAt,
      },
    });
    res.status(201).json({ success: true, data: banner });
  }),
);

const bannerUpdateSchema = z.object({
  placement: z.enum(["HOME_HERO", "HOME_STRIP"]).optional(),
  eyebrow: z.string().trim().max(80).optional().or(z.literal("")),
  title: z.string().trim().min(2).max(180).optional(),
  description: z.string().trim().max(12000).optional().or(z.literal("")),
  imageUrl: z.string().trim().optional().or(z.literal("")).refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid desktop image URL"),
  mobileImageUrl: z.string().trim().optional().or(z.literal("")).refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid mobile image URL"),
  imageAlt: z.string().trim().max(180).optional().or(z.literal("")),
  ctaText: z.string().trim().max(60).optional().or(z.literal("")),
  ctaLink: z.string().trim().max(220).optional().or(z.literal("")),
  background: z.string().trim().max(40).optional().or(z.literal("")),
  textColor: z.string().trim().max(40).optional().or(z.literal("")),
  titleFontFamily: z.enum(["Inter", "Georgia", "Arial", "Verdana", "Times New Roman", "Trebuchet MS"]).optional().or(z.literal("")),
  titleFontWeight: z.number().int().min(400).max(900).optional(),
  titleFontStyle: z.enum(["normal", "italic"]).optional(),
  titleTextAlign: z.enum(["left", "center", "right"]).optional(),
  titleSize: z.enum(["M", "L", "XL", "XXL"]).optional(),
  descriptionFontFamily: z.enum(["Inter", "Georgia", "Arial", "Verdana", "Times New Roman", "Trebuchet MS"]).optional().or(z.literal("")),
  descriptionTextAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  "/banners/:id",
  asyncHandler(async (req, res) => {
    const parsed = bannerUpdateSchema.safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, message: "Invalid banner update", errors: parsed.success ? undefined : parsed.error.flatten() });

    const data: any = { ...parsed.data };
    for (const key of ["eyebrow", "description", "imageUrl", "mobileImageUrl", "imageAlt", "ctaText", "ctaLink", "background", "textColor", "titleFontFamily", "descriptionFontFamily"]) {
      if (key in data && data[key] === "") data[key] = null;
    }
    if ("startsAt" in data) data.startsAt = data.startsAt ? new Date(data.startsAt) : null;
    if ("endsAt" in data) data.endsAt = data.endsAt ? new Date(data.endsAt) : null;
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) return res.status(400).json({ success: false, message: "Banner end date must be after the start date" });

    const banner = await prisma.banner.update({ where: { id: String(req.params.id) }, data });
    res.json({ success: true, data: banner });
  }),
);

router.delete(
  "/banners/:id",
  asyncHandler(async (req, res) => {
    await prisma.banner.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true });
  }),
);


router.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const [
      productCount, customerCount, openOrderCount, todayOrders, yesterdayOrders, monthOrders,
      recentOrders, variants, pendingReturnCount, pendingCancellationCount, pendingPayments, pendingSupportCount, last7Orders,
    ] = await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: "CUSTOMER", isActive: true } }),
      prisma.order.count({ where: { status: { in: ["PENDING", "CONFIRMED", "PROCESSING"] } } }),
      prisma.order.findMany({ where: { createdAt: { gte: today }, status: { not: "CANCELLED" } }, select: { id: true, totalAmount: true } }),
      prisma.order.findMany({ where: { createdAt: { gte: yesterday, lt: today }, status: { not: "CANCELLED" } }, select: { id: true, totalAmount: true } }),
      prisma.order.findMany({ where: { createdAt: { gte: monthStart }, status: { not: "CANCELLED" } }, select: { id: true, totalAmount: true } }),
      prisma.order.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        select: { id: true, orderNumber: true, customerName: true, status: true, totalAmount: true, createdAt: true, paymentMethod: true },
      }),
      prisma.productVariant.findMany({
        where: { isActive: true, product: { isActive: true } },
        select: { id: true, name: true, sku: true, stockQuantity: true, safetyStock: true, lowStockThreshold: true, sellingPrice: true, costPrice: true, product: { select: { id: true, name: true } } },
        orderBy: { stockQuantity: "asc" },
      }),
      prisma.returnRequest.count({ where: { status: { in: ["REQUESTED", "APPROVED", "PICKUP_PENDING", "IN_TRANSIT", "RECEIVED"] } } }),
      prisma.orderCancellationRequest.count({ where: { status: "REQUESTED" } }),
      prisma.checkoutSession.count({ where: { status: "PENDING" } }),
      prisma.contactMessage.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } }),
      prisma.order.findMany({ where: { createdAt: { gte: sevenDaysAgo }, status: { not: "CANCELLED" } }, select: { createdAt: true, totalAmount: true } }),
    ]);

    const sum = (orders: { totalAmount: any }[]) => orders.reduce((total, order) => total + Number(order.totalAmount || 0), 0);
    const todaySales = sum(todayOrders);
    const yesterdaySales = sum(yesterdayOrders);
    const monthSales = sum(monthOrders);
    const percentChange = (current: number, previous: number) => previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100;

    const lowStock = variants.filter((variant) => availableToSell(variant) > 0 && availableToSell(variant) <= variant.lowStockThreshold);
    const outOfStock = variants.filter((variant) => availableToSell(variant) <= 0);
    const inventoryCostValue = variants.reduce((total, variant) => total + variant.stockQuantity * Number(variant.costPrice || 0), 0);
    const inventoryRetailValue = variants.reduce((total, variant) => total + variant.stockQuantity * Number(variant.sellingPrice || 0), 0);
    const missingCostCount = variants.filter((variant) => variant.costPrice == null).length;

    const trendMap = new Map<string, { date: string; orders: number; sales: number }>();
    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(sevenDaysAgo); day.setDate(day.getDate() + offset);
      const key = day.toISOString().slice(0, 10);
      trendMap.set(key, { date: key, orders: 0, sales: 0 });
    }
    for (const order of last7Orders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      const row = trendMap.get(key);
      if (row) { row.orders += 1; row.sales += Number(order.totalAmount || 0); }
    }

    const attention = [
      ...(pendingCancellationCount ? [{ type: "danger", label: `${pendingCancellationCount} cancellation request${pendingCancellationCount === 1 ? "" : "s"} waiting`, to: "/admin/cancellations" }] : []),
      ...(pendingReturnCount ? [{ type: "warning", label: `${pendingReturnCount} active return${pendingReturnCount === 1 ? "" : "s"}`, to: "/admin/returns" }] : []),
      ...(pendingPayments ? [{ type: "info", label: `${pendingPayments} online payment reservation${pendingPayments === 1 ? "" : "s"} pending`, to: "/admin/payments" }] : []),
      ...(pendingSupportCount ? [{ type: "info", label: `${pendingSupportCount} support request${pendingSupportCount === 1 ? "" : "s"} need attention`, to: "/admin/support" }] : []),
      ...(outOfStock.length ? [{ type: "danger", label: `${outOfStock.length} variant${outOfStock.length === 1 ? "" : "s"} out of stock`, to: "/admin/inventory" }] : []),
      ...(missingCostCount ? [{ type: "info", label: `${missingCostCount} variant${missingCostCount === 1 ? "" : "s"} missing cost price`, to: "/admin/inventory" }] : []),
    ].slice(0, 6);

    res.json({
      success: true,
      data: {
        productCount, customerCount, openOrderCount,
        todayOrderCount: todayOrders.length, todaySales,
        yesterdayOrderCount: yesterdayOrders.length, yesterdaySales,
        todaySalesChange: percentChange(todaySales, yesterdaySales),
        todayOrderChange: percentChange(todayOrders.length, yesterdayOrders.length),
        monthOrderCount: monthOrders.length, monthSales,
        lowStockCount: lowStock.length, outOfStockCount: outOfStock.length,
        inventoryCostValue, inventoryRetailValue, missingCostCount,
        pendingReturnCount, pendingCancellationCount, pendingPayments, pendingSupportCount,
        recentOrders, lowStock: lowStock.slice(0, 6),
        last7Days: [...trendMap.values()], attention,
      },
    });
  }),
);

router.get(
  "/customers",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const users = await prisma.user.findMany({
      where: {
        role: "CUSTOMER",
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      include: {
        _count: { select: { orders: true, addresses: true } },
        orders: { select: { totalAmount: true, createdAt: true }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const data = users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      isActive: user.isActive,
      createdAt: user.createdAt,
      orderCount: user._count.orders,
      addressCount: user._count.addresses,
      totalSpent: user.orders.reduce((sum, order) => sum + Number(order.totalAmount), 0),
      lastOrderAt: user.orders[0]?.createdAt ?? null,
    }));

    res.json({ success: true, data });
  }),
);

router.patch(
  "/customers/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid customer update" });
    const user = await prisma.user.findFirst({ where: { id: String(req.params.id), role: "CUSTOMER" } });
    if (!user) return res.status(404).json({ success: false, message: "Customer not found" });
    const updated = await prisma.user.update({ where: { id: user.id }, data: { isActive: parsed.data.isActive } });
    res.json({ success: true, data: { id: updated.id, isActive: updated.isActive } });
  }),
);

router.get(
  "/inventory",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [variants, salesRows] = await Promise.all([
      prisma.productVariant.findMany({
        where: search
          ? {
              OR: [
                { sku: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { product: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : undefined,
        include: { product: { select: { id: true, name: true, isActive: true } } },
        orderBy: [{ stockQuantity: "asc" }, { updatedAt: "desc" }],
        take: 300,
      }),
      prisma.orderItem.groupBy({
        by: ["variantId"],
        where: { variantId: { not: null }, createdAt: { gte: since }, order: { status: "DELIVERED" } },
        _sum: { quantity: true },
      }),
    ]);
    const sales = new Map(salesRows.filter((row) => row.variantId).map((row) => [String(row.variantId), Number(row._sum.quantity || 0)]));
    const data = variants.map((variant) => {
      const state = inventoryState(variant);
      const sold30d = sales.get(variant.id) || 0;
      const avgDailySales = sold30d / 30;
      const daysCover = avgDailySales > 0 ? Number((state.available / avgDailySales).toFixed(1)) : null;
      const targetUnits = avgDailySales > 0 ? Math.ceil(avgDailySales * 30) : Math.max(0, Number(variant.lowStockThreshold || 0));
      const suggestedReorder = Math.max(0, targetUnits + state.safetyStock - state.onHand);
      return { ...variant, availableQuantity: state.available, inventoryStatus: state.status, sold30d, avgDailySales: Number(avgDailySales.toFixed(2)), daysCover, suggestedReorder };
    });
    const summary = data.reduce((acc, variant) => {
      acc.onHand += Number(variant.stockQuantity || 0);
      acc.safetyStock += Number(variant.safetyStock || 0);
      acc.available += Number(variant.availableQuantity || 0);
      if (variant.inventoryStatus === "OUT_OF_STOCK") acc.outOfStock += 1;
      else if (variant.inventoryStatus === "LOW_STOCK") acc.lowStock += 1;
      acc.costValue += Number(variant.stockQuantity || 0) * Number(variant.costPrice || 0);
      acc.retailValue += Number(variant.stockQuantity || 0) * Number(variant.sellingPrice || 0);
      acc.suggestedReorder += Number(variant.suggestedReorder || 0);
      return acc;
    }, { onHand: 0, safetyStock: 0, available: 0, lowStock: 0, outOfStock: 0, costValue: 0, retailValue: 0, suggestedReorder: 0 });
    res.json({ success: true, data, summary, windowDays: 30 });
  }),
);

router.get(
  "/inventory/:id/movements",
  asyncHandler(async (req, res) => {
    const limit = Math.min(100, Math.max(10, Number(req.query.limit || 40)));
    const variant = await prisma.productVariant.findUnique({
      where: { id: String(req.params.id) },
      include: { product: { select: { id: true, name: true } } },
    });
    if (!variant) return res.status(404).json({ success: false, message: "Variant not found" });
    const movements = await prisma.inventoryMovement.findMany({
      where: { variantId: variant.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return res.json({ success: true, data: { variant: { ...variant, ...inventoryState(variant), availableQuantity: availableToSell(variant) }, movements } });
  }),
);

router.patch(
  "/inventory/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      stockQuantity: z.number().int().nonnegative().optional(),
      lowStockThreshold: z.number().int().nonnegative().optional(),
      safetyStock: z.number().int().nonnegative().optional(),
      sellingPrice: z.number().positive().optional(),
      mrp: z.number().positive().optional(),
      isActive: z.boolean().optional(),
      reason: z.string().trim().max(240).optional().or(z.literal("")),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid inventory update", errors: parsed.error.flatten() });
    const { reason, ...changes } = parsed.data;
    if (Object.keys(changes).length === 0) return res.status(400).json({ success: false, message: "No inventory changes supplied" });
    if (changes.mrp !== undefined && changes.sellingPrice !== undefined && changes.sellingPrice > changes.mrp) {
      return res.status(400).json({ success: false, message: "Selling price cannot be higher than MRP" });
    }
    const before = await prisma.productVariant.findUnique({ where: { id: String(req.params.id) }, select: { stockQuantity: true, safetyStock: true, erpManaged: true } });
    if (!before) return res.status(404).json({ success: false, message: "Variant not found" });
    if (before.erpManaged) {
      const erpOwnedFields = ["stockQuantity", "sellingPrice", "mrp", "isActive"].filter((key) => (changes as any)[key] !== undefined);
      if (erpOwnedFields.length) return res.status(409).json({ success: false, message: "This variant is managed by Riseora ERP. Update stock, price and active state in ERP; website safety stock and warning levels remain editable here." });
    }
    if (changes.stockQuantity !== undefined && changes.stockQuantity !== before.stockQuantity && !String(reason || "").trim()) {
      return res.status(400).json({ success: false, message: "Enter a reason when changing physical stock." });
    }

    const variant = await prisma.$transaction(async (tx) => {
      if (changes.stockQuantity !== undefined && changes.stockQuantity !== before.stockQuantity) {
        await setInventoryQuantity(tx, {
          variantId: String(req.params.id),
          nextQuantity: changes.stockQuantity,
          type: "ADMIN_ADJUSTMENT",
          source: "ADMIN",
          reason: String(reason || "Inventory adjustment"),
          referenceType: "ADMIN_INVENTORY",
          actorUserId: req.user!.id,
        });
      }
      const other: any = { ...changes };
      delete other.stockQuantity;
      if (Object.keys(other).length) await tx.productVariant.update({ where: { id: String(req.params.id) }, data: other });
      return tx.productVariant.findUniqueOrThrow({ where: { id: String(req.params.id) } });
    });

    const beforeAvailable = Math.max(0, Number(before.stockQuantity || 0) - Number(before.safetyStock || 0));
    const afterAvailable = availableToSell(variant);
    if (beforeAvailable <= 0 && afterAvailable > 0) {
      void notifyStockAlertsForVariant(variant.id).catch((error) => console.error("Back-in-stock notification failed", error));
    }
    void notifyPriceAlertsForVariant(variant.id).catch((error) => console.error("Price alert notification failed", error));
    res.json({ success: true, data: { ...variant, availableQuantity: afterAvailable, inventoryStatus: inventoryState(variant).status } });
  }),
);

router.patch(
  "/categories/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      name: z.string().trim().min(2).max(100).optional(),
      description: z.string().trim().max(500).nullable().optional(),
      imageUrl: z.string().trim().nullable().optional().refine((value) => value == null || value === "" || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid category image URL"),
      sortOrder: z.number().int().min(0).max(100000).optional(),
      isActive: z.boolean().optional(),
    }).safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, message: "Invalid category update" });
    const existingCategory = await prisma.category.findUnique({ where: { id: String(req.params.id) }, select: { erpManaged: true } });
    if (!existingCategory) return res.status(404).json({ success: false, message: "Category not found" });
    if (existingCategory.erpManaged && (parsed.data.name !== undefined || parsed.data.isActive !== undefined)) {
      return res.status(409).json({ success: false, message: "This category is managed by Riseora ERP. Change its name or active state in ERP; website image, description and display order remain editable here." });
    }
    const category = await prisma.category.update({
      where: { id: String(req.params.id) },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name, slug: slugify(parsed.data.name) } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.imageUrl !== undefined ? { imageUrl: parsed.data.imageUrl || null } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
    });
    res.json({ success: true, data: category });
  }),
);

const productReplaceSchema = productSchema.extend({ isActive: z.boolean().default(true) });

router.put(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const parsed = productReplaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid product", errors: parsed.error.flatten() });

    const product = await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, erpManaged: true, categoryId: true, name: true, slug: true, isActive: true },
      });
      if (!existing) throw new Error("PRODUCT_NOT_FOUND");

      await tx.productImage.deleteMany({ where: { productId: existing.id } });

      const existingVariants = await tx.productVariant.findMany({
        where: { productId: existing.id },
        select: {
          id: true, erpManaged: true, name: true, sku: true, size: true, unit: true,
          mrp: true, sellingPrice: true, costPrice: true, stockQuantity: true,
          lowStockThreshold: true, safetyStock: true, weightGrams: true, hsnCode: true, gstRate: true, isActive: true,
        },
      });
      const existingIds = new Set(existingVariants.map((variant) => variant.id));
      const submittedIds = new Set(parsed.data.variants.flatMap((variant) => variant.id ? [variant.id] : []));
      if ([...submittedIds].some((id) => !existingIds.has(id))) throw new Error("INVALID_VARIANT_ID");

      const removedIds = [...existingIds].filter((id) => !submittedIds.has(id));
      if (removedIds.length) await tx.productVariant.updateMany({ where: { id: { in: removedIds }, erpManaged: false }, data: { isActive: false } });

      for (const variant of parsed.data.variants) {
        const currentVariant = variant.id ? existingVariants.find((item) => item.id === variant.id) : undefined;
        const data = currentVariant?.erpManaged ? {
          name: currentVariant.name,
          sku: currentVariant.sku,
          size: currentVariant.size,
          unit: currentVariant.unit,
          mrp: currentVariant.mrp,
          sellingPrice: currentVariant.sellingPrice,
          costPrice: currentVariant.costPrice,
          stockQuantity: currentVariant.stockQuantity,
          lowStockThreshold: variant.lowStockThreshold,
          safetyStock: variant.safetyStock,
          weightGrams: currentVariant.weightGrams,
          hsnCode: currentVariant.hsnCode,
          gstRate: currentVariant.gstRate,
          isActive: currentVariant.isActive,
        } : {
          name: variant.name,
          sku: variant.sku,
          size: variant.size || null,
          unit: variant.unit || null,
          mrp: variant.mrp,
          sellingPrice: variant.sellingPrice,
          costPrice: variant.costPrice ?? null,
          stockQuantity: variant.stockQuantity,
          lowStockThreshold: variant.lowStockThreshold,
          safetyStock: variant.safetyStock,
          weightGrams: variant.weightGrams ?? null,
          hsnCode: variant.hsnCode || null,
          gstRate: variant.gstRate,
          isActive: variant.isActive,
        };
        if (variant.id) {
          const desiredStock = Number(data.stockQuantity || 0);
          const updateData: any = { ...data };
          delete updateData.stockQuantity;
          if (!currentVariant?.erpManaged && currentVariant && desiredStock !== Number(currentVariant.stockQuantity || 0)) {
            await setInventoryQuantity(tx, {
              variantId: variant.id,
              nextQuantity: desiredStock,
              type: "ADMIN_ADJUSTMENT",
              source: "ADMIN",
              reason: "Stock changed from Catalog product editor",
              referenceType: "PRODUCT",
              referenceId: existing.id,
              actorUserId: req.user!.id,
            });
          }
          await tx.productVariant.update({ where: { id: variant.id }, data: updateData });
        } else {
          const createdVariant = await tx.productVariant.create({ data: { ...data, productId: existing.id } });
          if (Number(createdVariant.stockQuantity || 0) !== 0) {
            await tx.inventoryMovement.create({ data: {
              variantId: createdVariant.id,
              type: "OPENING_STOCK" as any,
              source: "ADMIN" as any,
              quantityChange: Number(createdVariant.stockQuantity || 0),
              stockBefore: 0,
              stockAfter: Number(createdVariant.stockQuantity || 0),
              safetyStockSnapshot: Math.max(0, Number(createdVariant.safetyStock || 0)),
              reason: "Initial stock entered for new variant",
              referenceType: "PRODUCT",
              referenceId: existing.id,
              actorUserId: req.user!.id,
            } });
          }
        }
      }

      const effectiveProductName = existing.erpManaged ? existing.name : parsed.data.name;
      return tx.product.update({
        where: { id: existing.id },
        data: {
          categoryId: existing.erpManaged ? existing.categoryId : parsed.data.categoryId,
          name: effectiveProductName,
          slug: existing.erpManaged ? existing.slug : slugify(parsed.data.slug || parsed.data.name),
          shortDescription: parsed.data.shortDescription || null,
          description: parsed.data.description || null,
          benefits: parsed.data.benefits || null,
          ingredients: parsed.data.ingredients || null,
          howToUse: parsed.data.howToUse || null,
          suitableFor: parsed.data.suitableFor || null,
          faq: parsed.data.faq as any,
          isFeatured: parsed.data.isFeatured,
          isActive: existing.erpManaged ? existing.isActive : parsed.data.isActive,
          badge: parsed.data.badge || null,
          maxPurchaseQuantity: parsed.data.maxPurchaseQuantity ?? null,
          codAllowed: parsed.data.codAllowed,
          replenishmentEnabled: parsed.data.replenishmentEnabled,
          replenishmentDays: parsed.data.replenishmentEnabled ? (parsed.data.replenishmentDays ?? 30) : null,
          replenishmentLabel: parsed.data.replenishmentEnabled ? (parsed.data.replenishmentLabel || null) : null,
          images: {
            create: normalizedProductImages(parsed.data.images, effectiveProductName),
          },
        },
        include: { category: true, images: { orderBy: { sortOrder: "asc" } }, variants: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
      });
    });

    for (const variant of product.variants) {
      if (availableToSell(variant) > 0) void notifyStockAlertsForVariant(variant.id).catch((error) => console.error("Back-in-stock notification failed", error));
      void notifyPriceAlertsForVariant(variant.id).catch((error) => console.error("Price alert notification failed", error));
    }
    res.json({ success: true, data: product });
  }),
);


router.get(
  "/community/trust-health",
  asyncHandler(async (_req, res) => {
    const data = await communityTrustHealth();
    res.json({ success: true, data });
  }),
);

router.get(
  "/catalog/comparison-health",
  asyncHandler(async (_req, res) => {
    const data = await productComparisonHealth();
    res.json({ success: true, data });
  }),
);

router.get(
  "/catalog/ingredient-health",
  asyncHandler(async (_req, res) => {
    const data = await ingredientCatalogHealth();
    res.json({ success: true, data });
  }),
);

router.get(
  "/catalog/discovery-health",
  asyncHandler(async (_req, res) => {
    const data = await shopDiscoveryHealth();
    res.json({ success: true, data });
  }),
);


router.get(
  "/catalog/saved-shopping-health",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await savedShoppingHealth() });
  }),
);

router.get(
  "/catalog/cart-quantity-health",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await cartQuantityHealth() });
  }),
);

router.get(
  "/reviews",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const where: any = {};
    if (status === "pending") where.isApproved = false;
    if (status === "approved") where.isApproved = true;
    if (search) where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { comment: { contains: search, mode: "insensitive" } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { product: { name: { contains: search, mode: "insensitive" } } },
    ];
    const data = await prisma.review.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        product: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    res.json({ success: true, data });
  }),
);

router.patch(
  "/reviews/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ isApproved: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid review update" });
    const before = await prisma.review.findUnique({ where: { id: String(req.params.id) }, select: { id: true, isApproved: true } });
    if (!before) return res.status(404).json({ success: false, message: "Review not found" });
    const data = await prisma.review.update({
      where: { id: before.id },
      data: { isApproved: parsed.data.isApproved },
      include: { user: { select: { firstName: true, lastName: true, email: true } }, product: { select: { name: true, slug: true } } },
    });
    if (!before.isApproved && data.isApproved) void awardApprovedReviewReward(data.id).catch((error) => console.error("Review reward failed", error));
    if (before.isApproved && !data.isApproved) void reverseReviewReward(data.id).catch((error) => console.error("Review reward reversal failed", error));
    res.json({ success: true, data });
  }),
);

router.delete(
  "/reviews/:id",
  asyncHandler(async (req, res) => {
    const reviewId = String(req.params.id);
    await reverseReviewReward(reviewId).catch((error) => console.error("Review reward reversal failed", error));
    await prisma.review.delete({ where: { id: reviewId } });
    res.json({ success: true });
  }),
);

router.get(
  "/product-questions",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const where: any = {};
    if (status === "pending") where.isPublished = false;
    if (status === "published") where.isPublished = true;
    if (search) where.OR = [
      { question: { contains: search, mode: "insensitive" } },
      { answer: { contains: search, mode: "insensitive" } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { product: { name: { contains: search, mode: "insensitive" } } },
    ];
    const data = await prisma.productQuestion.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        product: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    res.json({ success: true, data });
  }),
);

router.patch(
  "/product-questions/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      answer: z.string().trim().max(4000).nullable().optional(),
      isPublished: z.boolean().optional(),
    }).safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, message: "Invalid question update" });
    const current = await prisma.productQuestion.findUnique({ where: { id: String(req.params.id) } });
    if (!current) return res.status(404).json({ success: false, message: "Question not found" });
    const answer = parsed.data.answer !== undefined ? (parsed.data.answer || null) : current.answer;
    const publish = parsed.data.isPublished !== undefined ? parsed.data.isPublished : current.isPublished;
    if (publish && !answer?.trim()) return res.status(400).json({ success: false, message: "Add an answer before publishing the question" });
    const data = await prisma.productQuestion.update({
      where: { id: current.id },
      data: { answer, isPublished: publish, answeredAt: answer ? (current.answeredAt || new Date()) : null },
      include: { user: { select: { firstName: true, lastName: true, email: true } }, product: { select: { name: true, slug: true } } },
    });
    res.json({ success: true, data });
  }),
);

router.delete(
  "/product-questions/:id",
  asyncHandler(async (req, res) => {
    await prisma.productQuestion.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true });
  }),
);


function reportDateRange(query: any) {
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29, 0, 0, 0, 0));
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const from = typeof query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? new Date(`${query.from}T00:00:00.000Z`) : defaultFrom;
  const to = typeof query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? new Date(`${query.to}T23:59:59.999Z`) : defaultTo;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new Error("INVALID_REPORT_RANGE");
  if (to.getTime() - from.getTime() > 370 * 24 * 60 * 60 * 1000) throw new Error("REPORT_RANGE_TOO_LARGE");
  return { from, to };
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

router.get(
  "/reports",
  asyncHandler(async (req, res) => {
    let range;
    try { range = reportDateRange(req.query); }
    catch (error) {
      const message = error instanceof Error ? error.message : "INVALID_REPORT_RANGE";
      return res.status(400).json({ success: false, message: message === "REPORT_RANGE_TOO_LARGE" ? "Choose a report range of 370 days or less" : "Invalid report date range" });
    }

    const duration = range.to.getTime() - range.from.getTime() + 1;
    const previousTo = new Date(range.from.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - duration + 1);
    const orderInclude = {
      items: { include: { variant: { select: { costPrice: true, product: { select: { category: { select: { name: true } } } } } } } },
      payment: true,
      returnRequests: { select: { status: true, refundAmount: true, items: { select: { quantity: true, orderItemId: true } } } },
    } as const;

    const [orders, previousOrders, newCustomers, previousNewCustomers, inventoryVariants] = await Promise.all([
      prisma.order.findMany({ where: { createdAt: { gte: range.from, lte: range.to } }, include: orderInclude, orderBy: { createdAt: "asc" } }),
      prisma.order.findMany({ where: { createdAt: { gte: previousFrom, lte: previousTo } }, include: orderInclude, orderBy: { createdAt: "asc" } }),
      prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: range.from, lte: range.to } } }),
      prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: previousFrom, lte: previousTo } } }),
      prisma.productVariant.findMany({
        where: { isActive: true, product: { isActive: true } },
        select: { id: true, sku: true, name: true, stockQuantity: true, safetyStock: true, lowStockThreshold: true, costPrice: true, sellingPrice: true, product: { select: { name: true, category: { select: { name: true } } } } },
      }),
    ]);

    const money = (value: unknown) => Number(value || 0);
    const active = (rows: typeof orders) => rows.filter((order) => order.status !== "CANCELLED");
    const orderRefund = (order: any) => {
      if (order.payment) return money(order.payment.refundedAmount);
      return (order.returnRequests || []).filter((item: any) => item.status === "REFUNDED").reduce((sum: number, item: any) => sum + money(item.refundAmount), 0);
    };
    const itemCost = (item: any) => item.unitCost != null ? money(item.unitCost) : money(item.variant?.costPrice);
    const orderCogs = (order: any) => {
      const base = order.items.reduce((sum: number, item: any) => sum + itemCost(item) * item.quantity, 0);
      const byId = new Map(order.items.map((item: any) => [item.id, item]));
      const returned = (order.returnRequests || []).filter((request: any) => request.status === "REFUNDED").reduce((sum: number, request: any) => sum + request.items.reduce((lineSum: number, row: any) => {
        const item: any = byId.get(row.orderItemId);
        return lineSum + (item ? itemCost(item) * row.quantity : 0);
      }, 0), 0);
      return Math.max(0, base - returned);
    };

    function summarize(rows: typeof orders, customerAdds: number) {
      const activeOrders = active(rows);
      const grossOrderValue = activeOrders.reduce((sum, order) => sum + money(order.totalAmount), 0);
      const refundedValue = activeOrders.reduce((sum, order) => sum + orderRefund(order), 0);
      const netOrderValue = Math.max(0, grossOrderValue - refundedValue);
      const cogs = activeOrders.reduce((sum, order) => sum + orderCogs(order), 0);
      const grossProfit = netOrderValue - cogs;
      const unitsOrdered = activeOrders.reduce((sum, order) => sum + order.items.reduce((lineSum, item) => lineSum + item.quantity, 0), 0);
      const averageOrderValue = activeOrders.length ? grossOrderValue / activeOrders.length : 0;
      const deliveredOrders = rows.filter((order) => order.status === "DELIVERED").length;
      const cancelledOrders = rows.filter((order) => order.status === "CANCELLED").length;
      const refundedOrders = activeOrders.filter((order) => orderRefund(order) > 0).length;
      return {
        totalOrders: rows.length, activeOrders: activeOrders.length, grossOrderValue, refundedValue, netOrderValue, cogs, grossProfit,
        grossMarginPct: netOrderValue > 0 ? (grossProfit / netOrderValue) * 100 : 0,
        averageOrderValue, unitsOrdered, deliveredOrders, cancelledOrders, refundedOrders, newCustomers: customerAdds,
        cancellationRatePct: rows.length ? (cancelledOrders / rows.length) * 100 : 0,
        refundRatePct: grossOrderValue > 0 ? (refundedValue / grossOrderValue) * 100 : 0,
      };
    }

    const summary = summarize(orders, newCustomers);
    const previousSummary = summarize(previousOrders, previousNewCustomers);
    const activeOrders = active(orders);

    const registeredBuyerIds = [...new Set(activeOrders.map((order) => order.userId).filter(Boolean))] as string[];
    const priorRegistered = registeredBuyerIds.length ? await prisma.order.groupBy({
      by: ["userId"],
      where: { userId: { in: registeredBuyerIds }, createdAt: { lt: range.from }, status: { not: "CANCELLED" } },
      _count: { _all: true },
    }) : [];
    const repeatCustomerIds = new Set(priorRegistered.map((row) => row.userId).filter(Boolean));
    const repeatCustomers = registeredBuyerIds.filter((id) => repeatCustomerIds.has(id)).length;
    const repeatCustomerRatePct = registeredBuyerIds.length ? (repeatCustomers / registeredBuyerIds.length) * 100 : 0;

    const daily = new Map<string, any>();
    for (let cursor = new Date(range.from); cursor <= range.to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const key = cursor.toISOString().slice(0, 10);
      daily.set(key, { date: key, orders: 0, gross: 0, refunds: 0, net: 0, cogs: 0, profit: 0, units: 0 });
    }
    const products = new Map<string, any>();
    const categories = new Map<string, any>();
    const coupons = new Map<string, any>();
    const customers = new Map<string, any>();
    const payments = new Map<string, any>();
    const statuses = new Map<string, number>();
    let costedOrderItemUnits = 0;
    let totalOrderItemUnits = 0;

    for (const order of orders) {
      statuses.set(order.status, (statuses.get(order.status) || 0) + 1);
      if (order.status === "CANCELLED") continue;
      const date = order.createdAt.toISOString().slice(0, 10);
      const row = daily.get(date) || { date, orders: 0, gross: 0, refunds: 0, net: 0, cogs: 0, profit: 0, units: 0 };
      const refund = orderRefund(order);
      const cogs = orderCogs(order);
      row.orders += 1; row.gross += money(order.totalAmount); row.refunds += refund; row.net += Math.max(0, money(order.totalAmount) - refund); row.cogs += cogs; row.profit += Math.max(0, money(order.totalAmount) - refund) - cogs;
      row.units += order.items.reduce((sum, item) => sum + item.quantity, 0);
      daily.set(date, row);

      const paymentKey = order.paymentMethod || "UNKNOWN";
      const payment = payments.get(paymentKey) || { method: paymentKey, orders: 0, value: 0 };
      payment.orders += 1; payment.value += money(order.totalAmount); payments.set(paymentKey, payment);

      if (order.couponCode) {
        const coupon = coupons.get(order.couponCode) || { code: order.couponCode, orders: 0, discount: 0, orderValue: 0 };
        coupon.orders += 1; coupon.discount += money(order.discountAmount); coupon.orderValue += money(order.totalAmount); coupons.set(order.couponCode, coupon);
      }

      const customerKey = (order.customerEmail || order.customerPhone || order.customerName).toLowerCase();
      const customer = customers.get(customerKey) || { name: order.customerName, email: order.customerEmail, phone: order.customerPhone, orders: 0, value: 0 };
      customer.orders += 1; customer.value += money(order.totalAmount); customers.set(customerKey, customer);

      for (const item of order.items) {
        totalOrderItemUnits += item.quantity;
        const unitCost = itemCost(item);
        if (item.unitCost != null || item.variant?.costPrice != null) costedOrderItemUnits += item.quantity;
        const key = item.sku || `${item.productName}/${item.variantName || ""}`;
        const product = products.get(key) || { sku: item.sku, productName: item.productName, variantName: item.variantName, units: 0, value: 0, cogs: 0, profit: 0 };
        product.units += item.quantity; product.value += money(item.lineTotal) - money(item.discountAmount); product.cogs += unitCost * item.quantity; product.profit = product.value - product.cogs; products.set(key, product);

        const categoryName = item.variant?.product?.category?.name || "Uncategorized / archived";
        const category = categories.get(categoryName) || { category: categoryName, units: 0, value: 0, cogs: 0, profit: 0 };
        category.units += item.quantity; category.value += money(item.lineTotal) - money(item.discountAmount); category.cogs += unitCost * item.quantity; category.profit = category.value - category.cogs; categories.set(categoryName, category);
      }
    }

    const soldVariantIds = new Set(activeOrders.flatMap((order) => order.items.map((item) => item.variantId).filter(Boolean)));
    const inventory = inventoryVariants.reduce((acc, variant) => {
      const cost = money(variant.costPrice); const retail = money(variant.sellingPrice);
      acc.units += variant.stockQuantity;
      acc.costValue += variant.stockQuantity * cost;
      acc.retailValue += variant.stockQuantity * retail;
      const sellable = availableToSell(variant);
      if (sellable <= 0) acc.outOfStock += 1;
      else if (sellable <= variant.lowStockThreshold) acc.lowStock += 1;
      if (variant.costPrice == null) acc.missingCost += 1;
      return acc;
    }, { units: 0, costValue: 0, retailValue: 0, lowStock: 0, outOfStock: 0, missingCost: 0 });

    const slowStockAll = inventoryVariants
      .filter((variant) => variant.stockQuantity > 0 && !soldVariantIds.has(variant.id))
      .map((variant) => ({ id: variant.id, sku: variant.sku, productName: variant.product.name, variantName: variant.name, stock: variant.stockQuantity, costValue: variant.stockQuantity * money(variant.costPrice), retailValue: variant.stockQuantity * money(variant.sellingPrice) }))
      .sort((a, b) => b.costValue - a.costValue || b.stock - a.stock);
    const slowStock = slowStockAll.slice(0, 12);

    const result = {
      range: { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10) },
      previousRange: { from: previousFrom.toISOString().slice(0, 10), to: previousTo.toISOString().slice(0, 10) },
      summary: { ...summary, repeatCustomers, repeatCustomerRatePct, costCoveragePct: totalOrderItemUnits ? (costedOrderItemUnits / totalOrderItemUnits) * 100 : 100 },
      comparison: {
        netOrderValuePct: percentageChange(summary.netOrderValue, previousSummary.netOrderValue),
        grossProfitPct: percentageChange(summary.grossProfit, previousSummary.grossProfit),
        activeOrdersPct: percentageChange(summary.activeOrders, previousSummary.activeOrders),
        averageOrderValuePct: percentageChange(summary.averageOrderValue, previousSummary.averageOrderValue),
        newCustomersPct: percentageChange(summary.newCustomers, previousSummary.newCustomers),
      },
      previousSummary,
      inventory: { ...inventory, potentialMarginValue: inventory.retailValue - inventory.costValue, slowStockCount: slowStockAll.length },
      slowStock,
      daily: [...daily.values()],
      topProducts: [...products.values()].sort((a, b) => b.value - a.value).slice(0, 30),
      profitableProducts: [...products.values()].sort((a, b) => b.profit - a.profit).slice(0, 20),
      categoryPerformance: [...categories.values()].sort((a, b) => b.value - a.value),
      topCustomers: [...customers.values()].sort((a, b) => b.value - a.value).slice(0, 30),
      couponPerformance: [...coupons.values()].sort((a, b) => b.orderValue - a.orderValue),
      paymentSplit: [...payments.values()].sort((a, b) => b.value - a.value),
      statusSplit: [...statuses.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    };
    res.json({ success: true, data: result });
  }),
);

export default router;

