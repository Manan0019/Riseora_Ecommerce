import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/async-handler";

const router = Router();
const publicWriteLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false });
const cartRecoveryLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false });

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  subject: z.string().trim().max(160).optional().or(z.literal("")),
  message: z.string().trim().min(10).max(4000),
});

router.post("/contact", publicWriteLimit, asyncHandler(async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Please check the contact form details", errors: parsed.error.flatten() });
  const item = await prisma.contactMessage.create({ data: {
    name: parsed.data.name, email: parsed.data.email.toLowerCase(), phone: parsed.data.phone || null, subject: parsed.data.subject || null, message: parsed.data.message,
  }});
  res.status(201).json({ success: true, data: { id: item.id }, message: "Thanks — Riseora has received your message." });
}));

const newsletterSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  source: z.string().trim().max(80).optional().or(z.literal("")),
});

router.post("/newsletter", publicWriteLimit, asyncHandler(async (req, res) => {
  const parsed = newsletterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid email address" });
  const email = parsed.data.email.toLowerCase();
  await prisma.newsletterSubscriber.upsert({
    where: { email },
    create: { email, name: parsed.data.name || null, source: parsed.data.source || "storefront" },
    update: { name: parsed.data.name || undefined, source: parsed.data.source || undefined, isActive: true, unsubscribedAt: null, subscribedAt: new Date() },
  });
  res.json({ success: true, message: "You're on the Riseora list." });
}));

router.post("/newsletter/unsubscribe", publicWriteLimit, asyncHandler(async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid email address" });
  await prisma.newsletterSubscriber.updateMany({ where: { email: parsed.data.email.toLowerCase() }, data: { isActive: false, unsubscribedAt: new Date() } });
  res.json({ success: true, message: "Email preferences updated." });
}));


const cartRecoverySchema = z.object({
  cartToken: z.string().uuid().optional(),
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  subtotal: z.number().nonnegative().max(10000000),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    productName: z.string().trim().max(200),
    variantName: z.string().trim().max(120).optional().or(z.literal("")),
    sku: z.string().trim().max(100),
    quantity: z.number().int().min(1).max(50),
    price: z.number().nonnegative(),
    imageUrl: z.string().max(2000).optional().or(z.literal("")),
  })).min(1).max(50),
});

router.post("/cart-recovery", cartRecoveryLimit, asyncHandler(async (req, res) => {
  const parsed = cartRecoverySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid cart recovery snapshot" });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const data = parsed.data.cartToken
    ? await prisma.cartRecoverySession.upsert({
        where: { cartToken: parsed.data.cartToken },
        create: {
          cartToken: parsed.data.cartToken, email: parsed.data.email.toLowerCase(), name: parsed.data.name || null, phone: parsed.data.phone || null,
          items: parsed.data.items as any, subtotal: parsed.data.subtotal, expiresAt, lastSeenAt: new Date(),
        },
        update: {
          email: parsed.data.email.toLowerCase(), name: parsed.data.name || null, phone: parsed.data.phone || null,
          items: parsed.data.items as any, subtotal: parsed.data.subtotal, expiresAt, lastSeenAt: new Date(), status: "ACTIVE", orderNumber: null,
        },
      })
    : await prisma.cartRecoverySession.create({
        data: { email: parsed.data.email.toLowerCase(), name: parsed.data.name || null, phone: parsed.data.phone || null, items: parsed.data.items as any, subtotal: parsed.data.subtotal, expiresAt },
      });
  res.json({ success: true, data: { cartToken: data.cartToken } });
}));

router.post("/cart-recovery/converted", cartRecoveryLimit, asyncHandler(async (req, res) => {
  const parsed = z.object({ cartToken: z.string().uuid(), orderNumber: z.string().trim().min(3).max(80) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid recovery conversion" });
  await prisma.cartRecoverySession.updateMany({
    where: { cartToken: parsed.data.cartToken, status: "ACTIVE" },
    data: { status: "CONVERTED", orderNumber: parsed.data.orderNumber, lastSeenAt: new Date() },
  });
  res.json({ success: true });
}));

router.post("/cart-recovery/dismiss", cartRecoveryLimit, asyncHandler(async (req, res) => {
  const parsed = z.object({ cartToken: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid recovery token" });
  await prisma.cartRecoverySession.updateMany({ where: { cartToken: parsed.data.cartToken, status: "ACTIVE" }, data: { status: "DISMISSED", lastSeenAt: new Date() } });
  res.json({ success: true });
}));

export default router;
