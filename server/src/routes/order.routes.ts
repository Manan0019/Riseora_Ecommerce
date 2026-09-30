import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { createCodOrder } from "../services/checkout.service";

const router = Router();

const createOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  customerPhone: z.string().trim().min(8).max(20),
  couponCode: z.string().trim().max(40).optional().or(z.literal("")),
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
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1) })).min(1),
});

router.post(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid order details", errors: parsed.error.flatten() });
    try {
      const order = await createCodOrder(parsed.data, req.user?.id ?? null);
      res.status(201).json({ success: true, data: order });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ORDER_FAILED";
      if (message === "PRODUCT_UNAVAILABLE") return res.status(400).json({ success: false, message: "One or more products are unavailable" });
      if (message.startsWith("PURCHASE_LIMIT:")) {
        const [, productName, limit] = message.split(":");
        return res.status(400).json({ success: false, message: `${productName} is limited to ${limit} per order.` });
      }
      if (message === "COUPON_NOT_FOUND") return res.status(400).json({ success: false, message: "Coupon code not found" });
      if (message.startsWith("COUPON_INVALID:")) return res.status(400).json({ success: false, message: message.slice("COUPON_INVALID:".length) });
      if (message === "COUPON_LIMIT_REACHED") return res.status(400).json({ success: false, message: "This coupon has reached its usage limit" });
      if (message.startsWith("OUT_OF_STOCK:")) return res.status(400).json({ success: false, message: `Not enough stock for ${message.split(":")[1]}` });
      throw error;
    }
  }),
);

router.get(
  "/my",
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({ where: { userId: req.user!.id }, include: { items: true, payment: true, shipment: true, statusHistory: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } });
    res.json({ success: true, data: orders });
  }),
);

router.get(
  "/my/:orderNumber",
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({ where: { orderNumber: req.params.orderNumber, userId: req.user!.id }, include: { items: true, payment: true, shipment: true, statusHistory: { orderBy: { createdAt: "asc" } } } });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true, data: order });
  }),
);

router.get(
  "/track",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ orderNumber: z.string().trim().min(6), phone: z.string().trim().min(8).max(20) }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid order number and phone number" });
    const order = await prisma.order.findFirst({ where: { orderNumber: parsed.data.orderNumber.toUpperCase(), customerPhone: parsed.data.phone }, include: { items: true, payment: true, shipment: true, statusHistory: { orderBy: { createdAt: "asc" } } } });
    if (!order) return res.status(404).json({ success: false, message: "We could not find an order matching those details" });
    res.json({ success: true, data: order });
  }),
);

export default router;
