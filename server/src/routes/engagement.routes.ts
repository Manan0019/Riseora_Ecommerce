import { randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/async-handler";
import { optionalAuth } from "../middleware/auth";
import { createUserNotification } from "../services/notification-center.service";
import { sendSupportAdminNotification, sendSupportTicketReceived } from "../services/notification.service";
import { availableToSell } from "../services/inventory.service";
import { currentPrivacyPolicyVersion, recordConsentEvent } from "../services/consent.service";

const router = Router();
router.use(optionalAuth);
const publicWriteLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false });
const cartRecoveryLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false });

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  subject: z.string().trim().max(160).optional().or(z.literal("")),
  category: z.enum(["GENERAL", "ORDER", "PAYMENT", "DELIVERY", "RETURN_REFUND", "PRODUCT", "ACCOUNT", "REWARDS"]).default("GENERAL"),
  orderNumber: z.string().trim().max(80).optional().or(z.literal("")),
  message: z.string().trim().min(10).max(4000),
});

function publicTicketNumber() {
  const d = new Date();
  const date = `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `SUP-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

router.post("/contact", publicWriteLimit, asyncHandler(async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Please check the contact form details", errors: parsed.error.flatten() });
  const number = publicTicketNumber();
  const email = req.user?.email.toLowerCase() || parsed.data.email.toLowerCase();
  if (req.user && parsed.data.orderNumber) {
    const ownOrder = await prisma.order.findFirst({ where: { orderNumber: parsed.data.orderNumber, userId: req.user.id }, select: { id: true } });
    if (!ownOrder) return res.status(400).json({ success: false, message: "That order number is not linked to your account." });
  }
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.contactMessage.create({ data: {
      ticketNumber: number, userId: req.user?.id || null, name: parsed.data.name, email, phone: parsed.data.phone || null,
      subject: parsed.data.subject || "General support request", category: parsed.data.category, orderNumber: parsed.data.orderNumber || null, message: parsed.data.message, lastActivityAt: new Date(),
    }});
    await tx.supportMessage.create({ data: { ticketId: created.id, sender: "CUSTOMER", authorUserId: req.user?.id || null, message: parsed.data.message } });
    return created;
  });
  void sendSupportTicketReceived({ email, name: item.name, ticketNumber: item.ticketNumber, subject: item.subject || "Support request", signedIn: Boolean(req.user) }).catch((error) => console.error("Contact receipt email failed", error));
  void sendSupportAdminNotification({ ticketNumber: item.ticketNumber, name: item.name, email: item.email, category: item.category, subject: item.subject || "Support request", priority: item.priority }).catch((error) => console.error("Contact admin email failed", error));
  if (req.user) void createUserNotification({ userId: req.user.id, type: "SUPPORT", title: `Support request ${item.ticketNumber} received`, message: "Your Riseora support request is open. We’ll notify you when the team replies.", ctaLabel: "Open support", ctaUrl: `/support/${item.ticketNumber}`, dedupeKey: `support-created/${item.id}` }).catch((error) => console.error("Contact in-app notification failed", error));
  res.status(201).json({ success: true, data: { id: item.id, ticketNumber: item.ticketNumber }, message: `Thanks — Riseora has received your message. Ticket ${item.ticketNumber}.` });
}));

const newsletterSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  source: z.string().trim().max(80).optional().or(z.literal("")),
  consent: z.literal(true),
});

router.post("/newsletter", publicWriteLimit, asyncHandler(async (req, res) => {
  const parsed = newsletterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid email address" });
  const email = parsed.data.email.toLowerCase();
  const policyVersion = await currentPrivacyPolicyVersion();
  await prisma.$transaction(async (tx) => {
    await tx.newsletterSubscriber.upsert({
      where: { email },
      create: { email, name: parsed.data.name || null, source: parsed.data.source || "storefront", consentSource: parsed.data.source || "storefront", consentVersion: policyVersion },
      update: { name: parsed.data.name || undefined, source: parsed.data.source || undefined, consentSource: parsed.data.source || "storefront", consentVersion: policyVersion, isActive: true, unsubscribedAt: null, subscribedAt: new Date() },
    });
    if (req.user?.id) {
      await tx.marketingPreference.upsert({
        where: { userId: req.user.id },
        create: { userId: req.user.id, emailMarketing: true, lastSource: parsed.data.source || "storefront" },
        update: { emailMarketing: true, lastSource: parsed.data.source || "storefront" },
      });
    }
  });
  await recordConsentEvent({ req, userId: req.user?.id || null, email, purpose: "NEWSLETTER", decision: "GRANTED", source: parsed.data.source || "storefront", policyVersion });
  if (req.user?.id) await recordConsentEvent({ req, userId: req.user.id, email, purpose: "EMAIL_MARKETING", decision: "GRANTED", source: parsed.data.source || "storefront", policyVersion });
  res.json({ success: true, message: "You're on the Riseora list." });
}));

router.post("/newsletter/unsubscribe", publicWriteLimit, asyncHandler(async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid email address" });
  const email = parsed.data.email.toLowerCase();
  if (!req.user || req.user.email.toLowerCase() !== email) return res.status(403).json({ success: false, message: "Sign in to update this email preference, or use the unsubscribe link in a Riseora marketing email." });
  const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { email } });
  await prisma.newsletterSubscriber.updateMany({ where: { email }, data: { isActive: false, unsubscribedAt: new Date() } });
  await prisma.marketingPreference.upsert({ where: { userId: req.user.id }, create: { userId: req.user.id, emailMarketing: false, lastSource: "email-preference-form" }, update: { emailMarketing: false, lastSource: "email-preference-form" } });
  await recordConsentEvent({ req, userId: req.user.id, email, purpose: "NEWSLETTER", decision: "WITHDRAWN", source: "email-preference-form", policyVersion: subscriber?.consentVersion || undefined });
  await recordConsentEvent({ req, userId: req.user.id, email, purpose: "EMAIL_MARKETING", decision: "WITHDRAWN", source: "email-preference-form", policyVersion: subscriber?.consentVersion || undefined });
  res.json({ success: true, message: "Email preferences updated." });
}));


const cartRecoverySchema = z.object({
  cartToken: z.string().uuid().optional(),
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  recoveryOptIn: z.boolean().default(false),
  subtotal: z.number().nonnegative().max(10000000),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    productName: z.string().trim().max(200),
    variantName: z.string().trim().max(120).optional().or(z.literal("")),
    sku: z.string().trim().max(100),
    quantity: z.number().int().min(1),
    price: z.number().nonnegative(),
    imageUrl: z.string().max(2000).optional().or(z.literal("")),
  })).min(1).max(50),
});



const stockAlertSchema = z.object({
  variantId: z.string().uuid(),
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(120).optional().or(z.literal("")),
});

router.post("/stock-alerts", publicWriteLimit, asyncHandler(async (req, res) => {
  const parsed = stockAlertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid email address" });

  const variant = await prisma.productVariant.findFirst({
    where: { id: parsed.data.variantId, isActive: true, product: { isActive: true } },
    include: { product: true },
  });
  if (!variant) return res.status(404).json({ success: false, message: "Product option not found" });
  if (availableToSell(variant) > 0) return res.status(409).json({ success: false, message: "This option is already available to order." });

  const email = parsed.data.email.toLowerCase();
  await prisma.stockAlert.upsert({
    where: { variantId_email: { variantId: variant.id, email } },
    create: { variantId: variant.id, email, name: parsed.data.name || null },
    update: { name: parsed.data.name || null, status: "PENDING", subscribedAt: new Date(), notifiedAt: null },
  });
  res.json({ success: true, message: `We'll email you when ${variant.product.name} (${variant.name}) is available again.` });
}));


const priceAlertSchema = z.object({
  variantId: z.string().uuid(),
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  targetPrice: z.number().positive().max(10000000).nullable().optional(),
});

router.post("/price-alerts", publicWriteLimit, asyncHandler(async (req, res) => {
  const parsed = priceAlertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid email address and target price" });

  const variant = await prisma.productVariant.findFirst({
    where: { id: parsed.data.variantId, isActive: true, product: { isActive: true } },
    include: { product: true },
  });
  if (!variant) return res.status(404).json({ success: false, message: "Product option not found" });

  const currentPrice = Number(variant.sellingPrice);
  const targetPrice = parsed.data.targetPrice == null ? null : Number(parsed.data.targetPrice);
  if (targetPrice != null && targetPrice >= currentPrice) {
    return res.status(400).json({ success: false, message: `Target price must be below the current ₹${currentPrice.toFixed(0)} price.` });
  }

  const email = parsed.data.email.toLowerCase();
  await prisma.priceAlert.upsert({
    where: { variantId_email: { variantId: variant.id, email } },
    create: { variantId: variant.id, email, name: parsed.data.name || null, subscribedPrice: currentPrice, targetPrice },
    update: { name: parsed.data.name || null, subscribedPrice: currentPrice, targetPrice, status: "PENDING", subscribedAt: new Date(), notifiedAt: null },
  });

  res.json({
    success: true,
    message: targetPrice == null
      ? `We'll alert you if ${variant.product.name} (${variant.name}) drops below ₹${currentPrice.toFixed(0)}.`
      : `We'll alert you if ${variant.product.name} (${variant.name}) reaches ₹${targetPrice.toFixed(0)} or lower.`,
  });
}));

router.get("/cart-recovery/:cartToken", cartRecoveryLimit, asyncHandler(async (req, res) => {
  const parsed = z.string().uuid().safeParse(String(req.params.cartToken));
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid recovery link" });

  const session = await prisma.cartRecoverySession.findFirst({
    where: { cartToken: parsed.data, status: "ACTIVE", expiresAt: { gt: new Date() } },
  });
  if (!session) return res.status(404).json({ success: false, message: "This recovery link has expired or is no longer active." });

  const storedItems = Array.isArray(session.items) ? session.items as Array<{ variantId?: string; quantity?: number }> : [];
  const variantIds = storedItems.map((item) => item.variantId).filter((value): value is string => Boolean(value));
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, isActive: true, product: { isActive: true } },
    include: { product: { include: { images: { orderBy: { sortOrder: "asc" } } } } },
  });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  let unavailableCount = 0;
  const items = storedItems.flatMap((stored) => {
    const variant = stored.variantId ? byId.get(stored.variantId) : null;
    if (!variant || availableToSell(variant) <= 0) { unavailableCount += 1; return []; }
    const available = availableToSell(variant);
    const quantity = Math.max(1, Math.min(available, Number(stored.quantity || 1)));
    return [{
      variantId: variant.id,
      productId: variant.product.id,
      productSlug: variant.product.slug,
      productName: variant.product.name,
      variantName: variant.name,
      sku: variant.sku,
      price: Number(variant.sellingPrice),
      mrp: Number(variant.mrp),
      stockQuantity: available,
      maxPurchaseQuantity: variant.product.maxPurchaseQuantity,
      imageUrl: variant.product.images[0]?.url || "",
      quantity,
    }];
  });

  res.json({ success: true, data: { cartToken: session.cartToken, items, unavailableCount, expiresAt: session.expiresAt } });
}));

router.post("/cart-recovery", cartRecoveryLimit, asyncHandler(async (req, res) => {
  const parsed = cartRecoverySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid cart recovery snapshot" });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const data = parsed.data.cartToken
    ? await prisma.cartRecoverySession.upsert({
        where: { cartToken: parsed.data.cartToken },
        create: {
          cartToken: parsed.data.cartToken, userId: req.user?.id || null, email: parsed.data.email.toLowerCase(), name: parsed.data.name || null, phone: parsed.data.phone || null,
          items: parsed.data.items as any, subtotal: parsed.data.subtotal, recoveryOptIn: parsed.data.recoveryOptIn, expiresAt, lastSeenAt: new Date(),
        },
        update: {
          userId: req.user?.id || undefined, email: parsed.data.email.toLowerCase(), name: parsed.data.name || null, phone: parsed.data.phone || null,
          items: parsed.data.items as any, subtotal: parsed.data.subtotal, recoveryOptIn: parsed.data.recoveryOptIn, expiresAt, lastSeenAt: new Date(), status: "ACTIVE", orderNumber: null,
        },
      })
    : await prisma.cartRecoverySession.create({
        data: { userId: req.user?.id || null, email: parsed.data.email.toLowerCase(), name: parsed.data.name || null, phone: parsed.data.phone || null, items: parsed.data.items as any, subtotal: parsed.data.subtotal, recoveryOptIn: parsed.data.recoveryOptIn, expiresAt },
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
