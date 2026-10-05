import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { slugify } from "../utils/slugify";
import { enrichDeals, getActiveDeals, previewMerchandisingDeals } from "../services/merchandising.service";
import { routineBuilderEngagementSnapshot } from "../services/routine-builder.service";

export const publicDealRoutes = Router();
export const adminDealRoutes = Router();

function publicDealVariant(variant: any) {
  if (!variant) return variant;
  const availableQuantity = Math.max(0, Number(variant.stockQuantity || 0) - Math.max(0, Number(variant.safetyStock || 0)));
  return { ...variant, stockQuantity: availableQuantity, availableQuantity };
}

function publicDeal(deal: any) {
  if (!deal) return deal;
  return {
    ...deal,
    resolvedItems: (deal.resolvedItems || []).map((item: any) => ({ ...item, variant: publicDealVariant(item.variant) })),
    buyVariant: publicDealVariant(deal.buyVariant),
    giftVariant: publicDealVariant(deal.giftVariant),
  };
}

const bundleItemSchema = z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(20) });
const dealSchema = z.object({
  name: z.string().trim().min(2).max(140),
  type: z.enum(["BUNDLE_DISCOUNT", "BUY_X_GET_Y", "GIFT_WITH_PURCHASE"]),
  description: z.string().trim().max(700).optional().or(z.literal("")),
  badge: z.string().trim().max(50).optional().or(z.literal("")),
  imageUrl: z.string().trim().optional().or(z.literal("")).refine((value) => !value || value.startsWith("/uploads/") || /^https?:\/\//i.test(value), "Invalid image URL"),
  discountPercent: z.number().min(0.01).max(90).optional(),
  bundleItems: z.array(bundleItemSchema).max(8).optional(),
  buyVariantId: z.string().uuid().optional().or(z.literal("")),
  giftVariantId: z.string().uuid().optional().or(z.literal("")),
  buyQuantity: z.number().int().min(1).max(20).default(1),
  giftQuantity: z.number().int().min(1).max(20).default(1),
  minOrderAmount: z.number().nonnegative().optional(),
  isFeatured: z.boolean().default(false),
  priority: z.number().int().min(0).max(1000).default(0),
  startsAt: z.string().datetime().optional().or(z.literal("")),
  endsAt: z.string().datetime().optional().or(z.literal("")),
});

async function validateDealPayload(data: z.infer<typeof dealSchema>) {
  const ids = new Set<string>();
  if (data.buyVariantId) ids.add(data.buyVariantId);
  if (data.giftVariantId) ids.add(data.giftVariantId);
  for (const item of data.bundleItems || []) ids.add(item.variantId);
  if (ids.size) {
    const count = await prisma.productVariant.count({ where: { id: { in: [...ids] } } });
    if (count !== ids.size) throw new Error("DEAL_VARIANT_NOT_FOUND");
  }
  if (data.type === "BUNDLE_DISCOUNT") {
    const items = data.bundleItems || [];
    if (items.length < 2) throw new Error("BUNDLE_NEEDS_ITEMS");
    if (new Set(items.map((item) => item.variantId)).size !== items.length) throw new Error("BUNDLE_DUPLICATE_ITEMS");
    if (!data.discountPercent) throw new Error("BUNDLE_DISCOUNT_REQUIRED");
  }
  if (data.type === "BUY_X_GET_Y" && (!data.buyVariantId || !data.giftVariantId)) throw new Error("BUY_GIFT_REQUIRED");
  if (data.type === "GIFT_WITH_PURCHASE" && (!data.giftVariantId || data.minOrderAmount === undefined)) throw new Error("GIFT_THRESHOLD_REQUIRED");
}

function validationMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "INVALID_DEAL";
  const messages: Record<string, string> = {
    DEAL_VARIANT_NOT_FOUND: "One or more selected variants no longer exist",
    BUNDLE_NEEDS_ITEMS: "A combo needs at least two different variants",
    BUNDLE_DUPLICATE_ITEMS: "Use each variant only once inside a combo",
    BUNDLE_DISCOUNT_REQUIRED: "Add a combo discount percentage",
    BUY_GIFT_REQUIRED: "Choose both the qualifying and free-gift variants",
    GIFT_THRESHOLD_REQUIRED: "Choose a gift variant and minimum cart amount",
  };
  return messages[code] || "Invalid merchandising deal";
}

function dealDates(data: z.infer<typeof dealSchema>) {
  const startsAt = data.startsAt ? new Date(data.startsAt) : null;
  const endsAt = data.endsAt ? new Date(data.endsAt) : null;
  if (startsAt && endsAt && endsAt <= startsAt) throw new Error("INVALID_DATES");
  return { startsAt, endsAt };
}

function dealWriteData(data: z.infer<typeof dealSchema>) {
  const { startsAt, endsAt } = dealDates(data);
  return {
    name: data.name,
    type: data.type,
    description: data.description || null,
    badge: data.badge || null,
    imageUrl: data.imageUrl || null,
    discountPercent: data.type === "BUNDLE_DISCOUNT" ? data.discountPercent : null,
    bundleItems: data.type === "BUNDLE_DISCOUNT" ? (data.bundleItems as any) : ([] as any),
    buyVariantId: data.type === "BUY_X_GET_Y" ? data.buyVariantId || null : null,
    giftVariantId: data.type === "BUY_X_GET_Y" || data.type === "GIFT_WITH_PURCHASE" ? data.giftVariantId || null : null,
    buyQuantity: data.buyQuantity,
    giftQuantity: data.giftQuantity,
    minOrderAmount: data.type === "GIFT_WITH_PURCHASE" ? data.minOrderAmount ?? null : null,
    isFeatured: data.isFeatured,
    priority: data.priority,
    startsAt,
    endsAt,
  };
}

publicDealRoutes.get(
  "/deals",
  asyncHandler(async (req, res) => {
    const deals = await getActiveDeals() as any[];
    const featured = req.query.featured === "true";
    const productId = typeof req.query.productId === "string" ? req.query.productId : "";
    const filtered = deals.filter((deal: any) => {
      if (featured && !deal.isFeatured) return false;
      if (!productId) return true;
      return (deal.resolvedItems || []).some((item: any) => item.variant?.productId === productId)
        || deal.buyVariant?.productId === productId
        || deal.giftVariant?.productId === productId;
    });
    res.json({ success: true, data: filtered.map(publicDeal) });
  }),
);

const previewSchema = z.object({
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(50),
});

publicDealRoutes.post(
  "/deals/preview",
  asyncHandler(async (req, res) => {
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid cart contents" });
    const ids = [...new Set(parsed.data.items.map((item) => item.variantId))];
    const variants = await prisma.productVariant.findMany({ where: { id: { in: ids } }, select: { id: true, sellingPrice: true } });
    if (variants.length !== ids.length) return res.status(400).json({ success: false, message: "One or more cart items are no longer available" });
    const priceMap = new Map(variants.map((variant) => [variant.id, Number(variant.sellingPrice)]));
    const subtotal = parsed.data.items.reduce((sum, item) => sum + (priceMap.get(item.variantId) || 0) * item.quantity, 0);
    const preview = await previewMerchandisingDeals(parsed.data.items, subtotal);
    res.json({ success: true, data: { ...preview, winner: preview.winner ? { ...preview.winner, deal: publicDeal(preview.winner.deal) } : null, deals: preview.deals.map((row: any) => ({ ...row, deal: publicDeal(row.deal) })), subtotal } });
  }),
);

publicDealRoutes.get(
  "/deals/:slug",
  asyncHandler(async (req, res) => {
    const deals = await getActiveDeals() as any[];
    const deal = deals.find((item: any) => item.slug === String(req.params.slug));
    if (!deal) return res.status(404).json({ success: false, message: "Offer not found or no longer active" });
    res.json({ success: true, data: publicDeal(deal) });
  }),
);

adminDealRoutes.use(requireAuth, requireAdmin);

adminDealRoutes.get(
  "/merchandising/routine-health",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: routineBuilderEngagementSnapshot() });
  }),
);

adminDealRoutes.get(
  "/deals",
  asyncHandler(async (_req, res) => {
    const deals = await prisma.merchandisingDeal.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] });
    res.json({ success: true, data: await enrichDeals(deals) });
  }),
);

adminDealRoutes.post(
  "/deals",
  asyncHandler(async (req, res) => {
    const parsed = dealSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid merchandising deal", errors: parsed.error.flatten() });
    try { await validateDealPayload(parsed.data); } catch (error) { return res.status(400).json({ success: false, message: validationMessage(error) }); }
    let data;
    try { data = dealWriteData(parsed.data); } catch { return res.status(400).json({ success: false, message: "End date must be after the start date" }); }
    const baseSlug = slugify(parsed.data.name);
    const slug = `${baseSlug}-${Date.now().toString(36).slice(-5)}`;
    const deal = await prisma.merchandisingDeal.create({ data: { ...data, slug } });
    res.status(201).json({ success: true, data: deal });
  }),
);

adminDealRoutes.put(
  "/deals/:id",
  asyncHandler(async (req, res) => {
    const parsed = dealSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid merchandising deal", errors: parsed.error.flatten() });
    try { await validateDealPayload(parsed.data); } catch (error) { return res.status(400).json({ success: false, message: validationMessage(error) }); }
    let data;
    try { data = dealWriteData(parsed.data); } catch { return res.status(400).json({ success: false, message: "End date must be after the start date" }); }
    const existing = await prisma.merchandisingDeal.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) return res.status(404).json({ success: false, message: "Deal not found" });
    const deal = await prisma.merchandisingDeal.update({ where: { id: existing.id }, data });
    res.json({ success: true, data: deal });
  }),
);

adminDealRoutes.post(
  "/deals/:id/duplicate",
  asyncHandler(async (req, res) => {
    const source = await prisma.merchandisingDeal.findUnique({ where: { id: String(req.params.id) } });
    if (!source) return res.status(404).json({ success: false, message: "Deal not found" });
    const name = `${source.name} Copy`;
    const slug = `${slugify(name)}-${Date.now().toString(36).slice(-5)}`;
    const copy = await prisma.merchandisingDeal.create({ data: {
      name,
      slug,
      type: source.type,
      description: source.description,
      badge: source.badge,
      imageUrl: source.imageUrl,
      discountPercent: source.discountPercent,
      bundleItems: source.bundleItems === null ? undefined : source.bundleItems as any,
      buyVariantId: source.buyVariantId,
      giftVariantId: source.giftVariantId,
      buyQuantity: source.buyQuantity,
      giftQuantity: source.giftQuantity,
      minOrderAmount: source.minOrderAmount,
      isFeatured: false,
      isActive: false,
      priority: source.priority,
      startsAt: null,
      endsAt: null,
    } });
    res.status(201).json({ success: true, data: copy, message: "Deal duplicated as inactive draft" });
  }),
);

adminDealRoutes.patch(
  "/deals/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ isActive: z.boolean().optional(), isFeatured: z.boolean().optional(), priority: z.number().int().min(0).max(1000).optional() }).safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, message: "Invalid deal update" });
    const deal = await prisma.merchandisingDeal.update({ where: { id: String(req.params.id) }, data: parsed.data });
    res.json({ success: true, data: deal });
  }),
);

adminDealRoutes.delete(
  "/deals/:id",
  asyncHandler(async (req, res) => {
    await prisma.merchandisingDeal.delete({ where: { id: String(req.params.id) } });
    res.json({ success: true });
  }),
);
