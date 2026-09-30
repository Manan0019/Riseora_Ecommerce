import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { slugify } from "../utils/slugify";
import { enrichDeals, getActiveDeals } from "../services/merchandising.service";

export const publicDealRoutes = Router();
export const adminDealRoutes = Router();

publicDealRoutes.get(
  "/deals",
  asyncHandler(async (req, res) => {
    const deals = await getActiveDeals();
    const featured = req.query.featured === "true";
    res.json({ success: true, data: featured ? deals.filter((deal: any) => deal.isFeatured) : deals });
  }),
);

adminDealRoutes.use(requireAuth, requireAdmin);

adminDealRoutes.get(
  "/deals",
  asyncHandler(async (_req, res) => {
    const deals = await prisma.merchandisingDeal.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] });
    res.json({ success: true, data: await enrichDeals(deals) });
  }),
);

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

adminDealRoutes.post(
  "/deals",
  asyncHandler(async (req, res) => {
    const parsed = dealSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid merchandising deal", errors: parsed.error.flatten() });
    try { await validateDealPayload(parsed.data); } catch (error) {
      const code = error instanceof Error ? error.message : "INVALID_DEAL";
      const messages: Record<string, string> = {
        DEAL_VARIANT_NOT_FOUND: "One or more selected variants no longer exist",
        BUNDLE_NEEDS_ITEMS: "A combo needs at least two different variants",
        BUNDLE_DUPLICATE_ITEMS: "Use each variant only once inside a combo",
        BUNDLE_DISCOUNT_REQUIRED: "Add a combo discount percentage",
        BUY_GIFT_REQUIRED: "Choose both the qualifying and free-gift variants",
        GIFT_THRESHOLD_REQUIRED: "Choose a gift variant and minimum cart amount",
      };
      return res.status(400).json({ success: false, message: messages[code] || "Invalid merchandising deal" });
    }
    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) return res.status(400).json({ success: false, message: "End date must be after the start date" });
    const baseSlug = slugify(parsed.data.name);
    const slug = `${baseSlug}-${Date.now().toString(36).slice(-5)}`;
    const deal = await prisma.merchandisingDeal.create({
      data: {
        name: parsed.data.name,
        slug,
        type: parsed.data.type,
        description: parsed.data.description || null,
        badge: parsed.data.badge || null,
        imageUrl: parsed.data.imageUrl || null,
        discountPercent: parsed.data.type === "BUNDLE_DISCOUNT" ? parsed.data.discountPercent : null,
        bundleItems: parsed.data.type === "BUNDLE_DISCOUNT" ? (parsed.data.bundleItems as any) : undefined,
        buyVariantId: parsed.data.type === "BUY_X_GET_Y" ? parsed.data.buyVariantId || null : null,
        giftVariantId: parsed.data.type === "BUY_X_GET_Y" || parsed.data.type === "GIFT_WITH_PURCHASE" ? parsed.data.giftVariantId || null : null,
        buyQuantity: parsed.data.buyQuantity,
        giftQuantity: parsed.data.giftQuantity,
        minOrderAmount: parsed.data.type === "GIFT_WITH_PURCHASE" ? parsed.data.minOrderAmount ?? null : null,
        isFeatured: parsed.data.isFeatured,
        priority: parsed.data.priority,
        startsAt,
        endsAt,
      },
    });
    res.status(201).json({ success: true, data: deal });
  }),
);

adminDealRoutes.patch(
  "/deals/:id",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ isActive: z.boolean().optional(), isFeatured: z.boolean().optional(), priority: z.number().int().min(0).max(1000).optional() }).safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, message: "Invalid deal update" });
    const deal = await prisma.merchandisingDeal.update({ where: { id: req.params.id }, data: parsed.data });
    res.json({ success: true, data: deal });
  }),
);

adminDealRoutes.delete(
  "/deals/:id",
  asyncHandler(async (req, res) => {
    await prisma.merchandisingDeal.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  }),
);
