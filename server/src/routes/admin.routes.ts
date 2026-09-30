import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { slugify } from "../utils/slugify";
import { sendOrderStatusNotification } from "../services/notification.service";
import { refundRazorpayPayment } from "../services/payment.service";
import { notifyStockAlertsForVariant } from "../services/stock-alert.service";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
    res.json({ success: true, data: categories });
  }),
);

const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().optional(),
  description: z.string().trim().optional().or(z.literal("")),
  imageUrl: z.string().url().optional().or(z.literal("")),
});

router.post(
  "/categories",
  asyncHandler(async (req, res) => {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid category", errors: parsed.error.flatten() });
    }

    const category = await prisma.category.create({
      data: {
        name: parsed.data.name,
        slug: slugify(parsed.data.slug || parsed.data.name),
        description: parsed.data.description || null,
        imageUrl: parsed.data.imageUrl || null,
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
  benefits: z.string().trim().max(5000).optional().or(z.literal("")),
  ingredients: z.string().trim().max(8000).optional().or(z.literal("")),
  howToUse: z.string().trim().max(5000).optional().or(z.literal("")),
  suitableFor: z.string().trim().max(2000).optional().or(z.literal("")),
  faq: z.array(z.object({ question: z.string().trim().min(2).max(300), answer: z.string().trim().min(2).max(3000) })).max(20).default([]),
  isFeatured: z.boolean().default(false),
  badge: z.string().trim().max(40).optional().or(z.literal("")),
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
            weightGrams: variant.weightGrams ?? null,
            hsnCode: variant.hsnCode || null,
            gstRate: variant.gstRate,
            isActive: variant.isActive,
          })),
        },
      },
      include: { category: true, images: true, variants: true },
    });

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
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid product update" });
    const product = await prisma.product.update({ where: { id: req.params.id }, data: parsed.data });
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
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        items: true,
        payment: true,
        shipment: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true, data: order });
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
      include: { items: true, payment: true, shipment: true },
    });
    if (!order) throw new Error("ORDER_NOT_FOUND");

    const isSameStatus = order.status === payload.status;
    if (!isSameStatus && !allowedTransitions[order.status].includes(payload.status)) {
      throw new Error(`INVALID_TRANSITION:${order.status}:${payload.status}`);
    }

    if (payload.status === "SHIPPED" && (!payload.carrier || !payload.trackingNumber)) {
      throw new Error("SHIPMENT_DETAILS_REQUIRED");
    }

    let resolvedTrackingUrl = payload.trackingUrl || "";
    if (payload.carrier && payload.trackingNumber && !resolvedTrackingUrl) {
      const partner = await tx.shippingPartner.findFirst({ where: { name: payload.carrier, isActive: true } });
      if (partner?.trackingUrlTemplate) resolvedTrackingUrl = partner.trackingUrlTemplate.replaceAll("{trackingNumber}", encodeURIComponent(payload.trackingNumber));
    }

    if (!isSameStatus && payload.status === "CANCELLED") {
      if (order.paymentMethod === "ONLINE" && order.payment?.status === "PAID") throw new Error("PREPAID_REFUND_REQUIRED");
      for (const item of order.items) {
        if (item.variantId) {
          await tx.productVariant.updateMany({ where: { id: item.variantId }, data: { stockQuantity: { increment: item.quantity } } });
        }
      }
      if (order.couponCode) {
        await tx.coupon.updateMany({ where: { code: order.couponCode, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } });
      }
      if (order.payment?.status === "PENDING") {
        await tx.payment.update({ where: { orderId: order.id }, data: { status: "CANCELLED" } });
      }
    }

    if (payload.status === "SHIPPED") {
      await tx.shipment.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          carrier: payload.carrier || null,
          trackingNumber: payload.trackingNumber || null,
          trackingUrl: resolvedTrackingUrl || null,
          shippedAt: new Date(),
        },
        update: {
          carrier: payload.carrier || null,
          trackingNumber: payload.trackingNumber || null,
          trackingUrl: resolvedTrackingUrl || null,
          shippedAt: order.shipment?.shippedAt ?? new Date(),
        },
      });
    } else if (order.shipment && (payload.carrier || payload.trackingNumber || payload.trackingUrl)) {
      await tx.shipment.update({
        where: { orderId: order.id },
        data: {
          ...(payload.carrier ? { carrier: payload.carrier } : {}),
          ...(payload.trackingNumber ? { trackingNumber: payload.trackingNumber } : {}),
          ...(resolvedTrackingUrl ? { trackingUrl: resolvedTrackingUrl } : {}),
        },
      });
    }

    if (!isSameStatus && payload.status === "DELIVERED") {
      await tx.shipment.upsert({
        where: { orderId: order.id },
        create: { orderId: order.id, deliveredAt: new Date() },
        update: { deliveredAt: new Date() },
      });
      if (order.paymentMethod === "COD" && order.payment) {
        await tx.payment.update({ where: { orderId: order.id }, data: { status: "PAID", paidAt: new Date() } });
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
      include: { items: true, payment: true, shipment: true, statusHistory: { orderBy: { createdAt: "asc" } } },
    });
  });
}

router.post(
  "/orders/:id/refund",
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true, payment: true, shipment: true } });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (["SHIPPED", "DELIVERED", "CANCELLED"].includes(order.status)) return res.status(400).json({ success: false, message: "This order can no longer be refunded from the dashboard" });
    if (order.paymentMethod !== "ONLINE" || !order.payment?.providerPaymentId || order.payment.status !== "PAID") return res.status(400).json({ success: false, message: "This order does not have a refundable online payment" });

    const locked = await prisma.payment.updateMany({ where: { orderId: order.id, status: "PAID" }, data: { status: "REFUNDING" } });
    if (locked.count !== 1) return res.status(409).json({ success: false, message: "This payment is already being refunded or is no longer refundable" });

    let refund;
    try {
      refund = await refundRazorpayPayment(order.payment.providerPaymentId, Math.round(Number(order.totalAmount) * 100));
    } catch (error) {
      await prisma.payment.updateMany({ where: { orderId: order.id, status: "REFUNDING" }, data: { status: "PAID" } });
      if (error instanceof Error && error.message === "PAYMENT_REFUND_FAILED") return res.status(502).json({ success: false, message: "Refund could not be completed by the payment provider. No order data was changed." });
      throw error;
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of order.items) if (item.variantId) await tx.productVariant.updateMany({ where: { id: item.variantId }, data: { stockQuantity: { increment: item.quantity } } });
      if (order.couponCode) await tx.coupon.updateMany({ where: { code: order.couponCode, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } });
      await tx.payment.update({ where: { orderId: order.id }, data: { status: "REFUNDED", refundId: refund.id, refundedAmount: order.totalAmount, refundedAt: new Date() } });
      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
      await tx.orderStatusHistory.create({ data: { orderId: order.id, status: "CANCELLED", note: "Online payment refunded and order cancelled", source: "ADMIN" } });
      return tx.order.findUnique({ where: { id: order.id }, include: { items: true, payment: true, shipment: true, statusHistory: { orderBy: { createdAt: "asc" } } } });
    });
    if (updated) void sendOrderStatusNotification(updated).catch((error) => console.error("Refund email failed", error));
    res.json({ success: true, data: updated });
  }),
);

router.patch(
  "/orders/:id/fulfilment",
  asyncHandler(async (req, res) => {
    const parsed = fulfilmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid fulfilment update", errors: parsed.error.flatten() });
    try {
      const order = await updateFulfilment(req.params.id, parsed.data);
      if (order) void sendOrderStatusNotification(order).catch((error) => console.error("Order status email failed", error));
      res.json({ success: true, data: order });
    } catch (error) {
      const message = error instanceof Error ? error.message : "FULFILMENT_FAILED";
      if (message === "ORDER_NOT_FOUND") return res.status(404).json({ success: false, message: "Order not found" });
      if (message === "SHIPMENT_DETAILS_REQUIRED") return res.status(400).json({ success: false, message: "Carrier and tracking number are required before marking an order shipped" });
      if (message === "PREPAID_REFUND_REQUIRED") return res.status(400).json({ success: false, message: "Refund the online payment before cancelling this order" });
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
      const order = await updateFulfilment(req.params.id, { status: parsed.data.status });
      if (order) void sendOrderStatusNotification(order).catch((error) => console.error("Order status email failed", error));
      res.json({ success: true, data: order });
    } catch (error) {
      const message = error instanceof Error ? error.message : "FULFILMENT_FAILED";
      if (message === "SHIPMENT_DETAILS_REQUIRED") return res.status(400).json({ success: false, message: "Use order details to add shipping information before marking this order shipped" });
      if (message === "PREPAID_REFUND_REQUIRED") return res.status(400).json({ success: false, message: "Refund the online payment before cancelling this order" });
      if (message.startsWith("INVALID_TRANSITION:")) return res.status(400).json({ success: false, message: "That order status change is not allowed" });
      if (message === "ORDER_NOT_FOUND") return res.status(404).json({ success: false, message: "Order not found" });
      throw error;
    }
  }),
);


const couponSchema = z.object({
  code: z.string().trim().min(3).max(40),
  description: z.string().trim().optional().or(z.literal("")),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.number().positive(),
  minOrderAmount: z.number().nonnegative().optional(),
  maxDiscountAmount: z.number().nonnegative().optional(),
  usageLimit: z.number().int().positive().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

router.get(
  "/coupons",
  asyncHandler(async (_req, res) => {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ success: true, data: coupons });
  }),
);

router.post(
  "/coupons",
  asyncHandler(async (req, res) => {
    const parsed = couponSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid coupon", errors: parsed.error.flatten() });
    if (parsed.data.discountType === "PERCENTAGE" && parsed.data.discountValue > 100) return res.status(400).json({ success: false, message: "Percentage discount cannot exceed 100%" });
    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) return res.status(400).json({ success: false, message: "Coupon end date must be after the start date" });

    const coupon = await prisma.coupon.create({
      data: {
        code: parsed.data.code.toUpperCase(),
        description: parsed.data.description || null,
        discountType: parsed.data.discountType,
        discountValue: parsed.data.discountValue,
        minOrderAmount: parsed.data.minOrderAmount ?? null,
        maxDiscountAmount: parsed.data.maxDiscountAmount ?? null,
        usageLimit: parsed.data.usageLimit ?? null,
        startsAt,
        endsAt,
      },
    });
    res.status(201).json({ success: true, data: coupon });
  }),
);

router.patch(
  "/coupons/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid coupon update" });
    const coupon = await prisma.coupon.update({ where: { id: req.params.id }, data: { isActive: parsed.data.isActive } });
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
    const offer = await prisma.offer.update({ where: { id: req.params.id }, data: { isActive: parsed.data.isActive } });
    res.json({ success: true, data: offer });
  }),
);


const bannerSchema = z.object({
  placement: z.enum(["HOME_HERO", "HOME_STRIP"]).default("HOME_HERO"),
  eyebrow: z.string().trim().max(80).optional().or(z.literal("")),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  imageUrl: z.string().trim().optional().or(z.literal("")).refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid desktop image URL"),
  mobileImageUrl: z.string().trim().optional().or(z.literal("")).refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid mobile image URL"),
  ctaText: z.string().trim().max(60).optional().or(z.literal("")),
  ctaLink: z.string().trim().max(220).optional().or(z.literal("")),
  background: z.string().trim().max(40).optional().or(z.literal("")),
  textColor: z.string().trim().max(40).optional().or(z.literal("")),
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
        ctaText: parsed.data.ctaText || null,
        ctaLink: parsed.data.ctaLink || null,
        background: parsed.data.background || null,
        textColor: parsed.data.textColor || null,
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
  description: z.string().trim().max(500).optional().or(z.literal("")),
  imageUrl: z.string().trim().optional().or(z.literal("")).refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid desktop image URL"),
  mobileImageUrl: z.string().trim().optional().or(z.literal("")).refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid mobile image URL"),
  ctaText: z.string().trim().max(60).optional().or(z.literal("")),
  ctaLink: z.string().trim().max(220).optional().or(z.literal("")),
  background: z.string().trim().max(40).optional().or(z.literal("")),
  textColor: z.string().trim().max(40).optional().or(z.literal("")),
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
    for (const key of ["eyebrow", "description", "imageUrl", "mobileImageUrl", "ctaText", "ctaLink", "background", "textColor"]) {
      if (key in data && data[key] === "") data[key] = null;
    }
    if ("startsAt" in data) data.startsAt = data.startsAt ? new Date(data.startsAt) : null;
    if ("endsAt" in data) data.endsAt = data.endsAt ? new Date(data.endsAt) : null;
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) return res.status(400).json({ success: false, message: "Banner end date must be after the start date" });

    const banner = await prisma.banner.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: banner });
  }),
);

router.delete(
  "/banners/:id",
  asyncHandler(async (req, res) => {
    await prisma.banner.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  }),
);


router.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [productCount, customerCount, openOrderCount, todayOrderCount, todaySales, recentOrders, variants, pendingReturnCount] = await Promise.all([
      prisma.product.count(),
      prisma.user.count({ where: { role: "CUSTOMER" } }),
      prisma.order.count({ where: { status: { in: ["PENDING", "CONFIRMED", "PROCESSING"] } } }),
      prisma.order.count({ where: { createdAt: { gte: today } } }),
      prisma.order.aggregate({ where: { createdAt: { gte: today }, status: { not: "CANCELLED" } }, _sum: { totalAmount: true } }),
      prisma.order.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        select: { id: true, orderNumber: true, customerName: true, status: true, totalAmount: true, createdAt: true },
      }),
      prisma.productVariant.findMany({
        where: { isActive: true, product: { isActive: true } },
        include: { product: { select: { id: true, name: true } } },
        orderBy: { stockQuantity: "asc" },
      }),
      prisma.returnRequest.count({ where: { status: { in: ["REQUESTED", "APPROVED", "PICKUP_PENDING", "IN_TRANSIT", "RECEIVED"] } } }),
    ]);

    const lowStock = variants.filter((variant) => variant.stockQuantity <= variant.lowStockThreshold);

    res.json({
      success: true,
      data: {
        productCount,
        customerCount,
        openOrderCount,
        todayOrderCount,
        todaySales: Number(todaySales._sum.totalAmount ?? 0),
        lowStockCount: lowStock.length,
        pendingReturnCount,
        recentOrders,
        lowStock: lowStock.slice(0, 6),
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
    const user = await prisma.user.findFirst({ where: { id: req.params.id, role: "CUSTOMER" } });
    if (!user) return res.status(404).json({ success: false, message: "Customer not found" });
    const updated = await prisma.user.update({ where: { id: user.id }, data: { isActive: parsed.data.isActive } });
    res.json({ success: true, data: { id: updated.id, isActive: updated.isActive } });
  }),
);

router.get(
  "/inventory",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const variants = await prisma.productVariant.findMany({
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
    });
    res.json({ success: true, data: variants });
  }),
);

router.patch(
  "/inventory/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      stockQuantity: z.number().int().nonnegative().optional(),
      lowStockThreshold: z.number().int().nonnegative().optional(),
      sellingPrice: z.number().positive().optional(),
      mrp: z.number().positive().optional(),
      isActive: z.boolean().optional(),
    }).safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, message: "Invalid inventory update" });
    if (parsed.data.mrp !== undefined && parsed.data.sellingPrice !== undefined && parsed.data.sellingPrice > parsed.data.mrp) {
      return res.status(400).json({ success: false, message: "Selling price cannot be higher than MRP" });
    }
    const before = await prisma.productVariant.findUnique({ where: { id: req.params.id }, select: { stockQuantity: true } });
    if (!before) return res.status(404).json({ success: false, message: "Variant not found" });
    const variant = await prisma.productVariant.update({ where: { id: req.params.id }, data: parsed.data });
    if (before.stockQuantity <= 0 && variant.stockQuantity > 0) {
      void notifyStockAlertsForVariant(variant.id).catch((error) => console.error("Back-in-stock notification failed", error));
    }
    res.json({ success: true, data: variant });
  }),
);

router.patch(
  "/categories/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      name: z.string().trim().min(2).max(100).optional(),
      description: z.string().trim().max(500).nullable().optional(),
      imageUrl: z.string().url().nullable().optional(),
      isActive: z.boolean().optional(),
    }).safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, message: "Invalid category update" });
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name, slug: slugify(parsed.data.name) } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.imageUrl !== undefined ? { imageUrl: parsed.data.imageUrl } : {}),
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
      const existing = await tx.product.findUnique({ where: { id: req.params.id }, select: { id: true } });
      if (!existing) throw new Error("PRODUCT_NOT_FOUND");

      await tx.productImage.deleteMany({ where: { productId: existing.id } });

      const existingVariants = await tx.productVariant.findMany({ where: { productId: existing.id }, select: { id: true } });
      const existingIds = new Set(existingVariants.map((variant) => variant.id));
      const submittedIds = new Set(parsed.data.variants.flatMap((variant) => variant.id ? [variant.id] : []));
      if ([...submittedIds].some((id) => !existingIds.has(id))) throw new Error("INVALID_VARIANT_ID");

      const removedIds = [...existingIds].filter((id) => !submittedIds.has(id));
      if (removedIds.length) await tx.productVariant.updateMany({ where: { id: { in: removedIds } }, data: { isActive: false } });

      for (const variant of parsed.data.variants) {
        const data = {
          name: variant.name,
          sku: variant.sku,
          size: variant.size || null,
          unit: variant.unit || null,
          mrp: variant.mrp,
          sellingPrice: variant.sellingPrice,
          costPrice: variant.costPrice ?? null,
          stockQuantity: variant.stockQuantity,
          lowStockThreshold: variant.lowStockThreshold,
          weightGrams: variant.weightGrams ?? null,
          hsnCode: variant.hsnCode || null,
          gstRate: variant.gstRate,
          isActive: variant.isActive,
        };
        if (variant.id) await tx.productVariant.update({ where: { id: variant.id }, data });
        else await tx.productVariant.create({ data: { ...data, productId: existing.id } });
      }

      return tx.product.update({
        where: { id: existing.id },
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
          isActive: parsed.data.isActive,
          badge: parsed.data.badge || null,
          images: {
          create: normalizedProductImages(parsed.data.images, parsed.data.name),
        },
        },
        include: { category: true, images: { orderBy: { sortOrder: "asc" } }, variants: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
      });
    });

    for (const variant of product.variants) {
      if (variant.stockQuantity > 0) void notifyStockAlertsForVariant(variant.id).catch((error) => console.error("Back-in-stock notification failed", error));
    }
    res.json({ success: true, data: product });
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
    const data = await prisma.review.update({
      where: { id: req.params.id },
      data: { isApproved: parsed.data.isApproved },
      include: { user: { select: { firstName: true, lastName: true, email: true } }, product: { select: { name: true, slug: true } } },
    });
    res.json({ success: true, data });
  }),
);

router.delete(
  "/reviews/:id",
  asyncHandler(async (req, res) => {
    await prisma.review.delete({ where: { id: req.params.id } });
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

router.get(
  "/reports",
  asyncHandler(async (req, res) => {
    let range;
    try { range = reportDateRange(req.query); }
    catch (error) {
      const message = error instanceof Error ? error.message : "INVALID_REPORT_RANGE";
      return res.status(400).json({ success: false, message: message === "REPORT_RANGE_TOO_LARGE" ? "Choose a report range of 370 days or less" : "Invalid report date range" });
    }

    const [orders, newCustomers] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: range.from, lte: range.to } },
        include: {
          items: true,
          payment: true,
          returnRequests: { select: { status: true, refundAmount: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: range.from, lte: range.to } } }),
    ]);

    const activeOrders = orders.filter((order) => order.status !== "CANCELLED");
    const money = (value: unknown) => Number(value || 0);
    const orderRefund = (order: any) => {
      if (order.payment) return money(order.payment.refundedAmount);
      return (order.returnRequests || []).filter((item: any) => item.status === "REFUNDED").reduce((sum: number, item: any) => sum + money(item.refundAmount), 0);
    };

    const grossOrderValue = activeOrders.reduce((sum, order) => sum + money(order.totalAmount), 0);
    const refundedValue = activeOrders.reduce((sum, order) => sum + orderRefund(order), 0);
    const netOrderValue = Math.max(0, grossOrderValue - refundedValue);
    const unitsOrdered = activeOrders.reduce((sum, order) => sum + order.items.reduce((lineSum, item) => lineSum + item.quantity, 0), 0);
    const averageOrderValue = activeOrders.length ? grossOrderValue / activeOrders.length : 0;

    const daily = new Map<string, any>();
    const products = new Map<string, any>();
    const coupons = new Map<string, any>();
    const customers = new Map<string, any>();
    const payments = new Map<string, any>();
    const statuses = new Map<string, number>();

    for (const order of orders) {
      statuses.set(order.status, (statuses.get(order.status) || 0) + 1);
      if (order.status === "CANCELLED") continue;
      const date = order.createdAt.toISOString().slice(0, 10);
      const row = daily.get(date) || { date, orders: 0, gross: 0, refunds: 0, net: 0, units: 0 };
      const refund = orderRefund(order);
      row.orders += 1; row.gross += money(order.totalAmount); row.refunds += refund; row.net += Math.max(0, money(order.totalAmount) - refund);
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
        const key = item.sku || `${item.productName}/${item.variantName || ""}`;
        const product = products.get(key) || { sku: item.sku, productName: item.productName, variantName: item.variantName, units: 0, value: 0 };
        product.units += item.quantity; product.value += money(item.lineTotal); products.set(key, product);
      }
    }

    const result = {
      range: { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10) },
      summary: {
        totalOrders: orders.length, activeOrders: activeOrders.length, grossOrderValue, refundedValue, netOrderValue, averageOrderValue, unitsOrdered,
        deliveredOrders: orders.filter((order) => order.status === "DELIVERED").length, newCustomers,
      },
      daily: [...daily.values()],
      topProducts: [...products.values()].sort((a, b) => b.value - a.value).slice(0, 20),
      topCustomers: [...customers.values()].sort((a, b) => b.value - a.value).slice(0, 20),
      couponPerformance: [...coupons.values()].sort((a, b) => b.orderValue - a.orderValue),
      paymentSplit: [...payments.values()].sort((a, b) => b.value - a.value),
      statusSplit: [...statuses.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    };
    res.json({ success: true, data: result });
  }),
);

export default router;

