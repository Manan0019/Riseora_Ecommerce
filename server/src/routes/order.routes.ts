import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";

const router = Router();

const createOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  customerPhone: z.string().trim().min(8).max(20),
  shippingAddress: z.object({
    line1: z.string().trim().min(3),
    line2: z.string().trim().optional().or(z.literal("")),
    landmark: z.string().trim().optional().or(z.literal("")),
    city: z.string().trim().min(2),
    state: z.string().trim().min(2),
    postalCode: z.string().trim().min(4).max(12),
    country: z.string().trim().default("India"),
  }),
  paymentMethod: z.literal("COD").default("COD"),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1),
});

function makeOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `RISE-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

router.post(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid order details",
        errors: parsed.error.flatten(),
      });
    }

    const requestedIds = [...new Set(parsed.data.items.map((item) => item.variantId))];
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: requestedIds }, isActive: true, product: { isActive: true } },
      include: { product: true },
    });

    if (variants.length !== requestedIds.length) {
      return res.status(400).json({ success: false, message: "One or more products are unavailable" });
    }

    const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
    const computedItems = parsed.data.items.map((item) => {
      const variant = variantMap.get(item.variantId)!;
      const unitPrice = Number(variant.sellingPrice);
      return {
        variant,
        quantity: item.quantity,
        unitPrice,
        lineTotal: unitPrice * item.quantity,
      };
    });

    const subtotal = computedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const shippingFee = 0;
    const discountAmount = 0;
    const totalAmount = subtotal + shippingFee - discountAmount;

    const order = await prisma.$transaction(async (tx) => {
      for (const item of computedItems) {
        const updated = await tx.productVariant.updateMany({
          where: {
            id: item.variant.id,
            isActive: true,
            stockQuantity: { gte: item.quantity },
          },
          data: { stockQuantity: { decrement: item.quantity } },
        });

        if (updated.count !== 1) {
          throw new Error(`OUT_OF_STOCK:${item.variant.sku}`);
        }
      }

      return tx.order.create({
        data: {
          orderNumber: makeOrderNumber(),
          userId: req.user?.id ?? null,
          customerName: parsed.data.customerName,
          customerEmail: parsed.data.customerEmail || null,
          customerPhone: parsed.data.customerPhone,
          shippingAddress: parsed.data.shippingAddress,
          paymentMethod: "COD",
          subtotal,
          shippingFee,
          discountAmount,
          totalAmount,
          items: {
            create: computedItems.map((item) => ({
              variantId: item.variant.id,
              productName: item.variant.product.name,
              variantName: item.variant.name,
              sku: item.variant.sku,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
            })),
          },
          payment: {
            create: {
              method: "COD",
              status: "PENDING",
              amount: totalAmount,
            },
          },
        },
        include: { items: true, payment: true },
      });
    });

    res.status(201).json({ success: true, data: order });
  }),
);

router.get(
  "/my",
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: req.user!.id },
      include: { items: true, payment: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: orders });
  }),
);

export default router;
