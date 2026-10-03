import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/async-handler";
import { slugify } from "../utils/slugify";

const publicCampaignRoutes = Router();
const adminCampaignRoutes = Router();

const productInclude = {
  category: true,
  images: { orderBy: { sortOrder: "asc" as const } },
  variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" as const } },
  reviews: { where: { isApproved: true }, select: { rating: true } },
};

function publicVariant<T extends { stockQuantity?: number | null; safetyStock?: number | null }>(variant: T) {
  const availableQuantity = Math.max(0, Number(variant.stockQuantity || 0) - Math.max(0, Number(variant.safetyStock || 0)));
  return { ...variant, stockQuantity: availableQuantity, availableQuantity };
}

function publicProduct(product: any) {
  const ratings = product.reviews || [];
  const ratingAverage = ratings.length ? ratings.reduce((sum: number, review: any) => sum + review.rating, 0) / ratings.length : 0;
  const { reviews: _reviews, ...rest } = product;
  return {
    ...rest,
    variants: Array.isArray(rest.variants) ? rest.variants.map(publicVariant) : rest.variants,
    ratingAverage: Number(ratingAverage.toFixed(1)),
    reviewCount: ratings.length,
  };
}

function liveWindow(now = new Date()) {
  return {
    isPublished: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
  };
}

function safeInternalPath(value: string | undefined | null) {
  if (!value) return true;
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

const nullableText = (max: number) => z.string().trim().max(max).optional().nullable().or(z.literal(""));
const campaignInput = z.object({
  slug: z.string().trim().max(120).optional().or(z.literal("")),
  eyebrow: nullableText(80),
  title: z.string().trim().min(2).max(180),
  summary: nullableText(600),
  body: nullableText(30000),
  heroImageUrl: nullableText(600),
  mobileHeroImageUrl: nullableText(600),
  heroAlt: nullableText(180),
  ctaText: nullableText(60),
  ctaLink: nullableText(240).refine((value) => safeInternalPath(value), "Primary CTA must be a safe internal Riseora path"),
  secondaryCtaText: nullableText(60),
  secondaryCtaLink: nullableText(240).refine((value) => safeInternalPath(value), "Secondary CTA must be a safe internal Riseora path"),
  theme: z.enum(["HERBAL", "IVORY", "ROSE", "MIDNIGHT", "GOLD"]).default("HERBAL"),
  seoTitle: nullableText(70),
  seoDescription: nullableText(180),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  isPublished: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  priority: z.number().int().min(0).max(10000).default(0),
  productIds: z.array(z.string().uuid()).max(40).default([]),
});

function cleanNullable(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

async function uniqueSlug(title: string, requested?: string, excludeId?: string) {
  const base = slugify(requested || title) || `campaign-${Date.now()}`;
  let candidate = base;
  for (let index = 0; index < 100; index += 1) {
    const found = await prisma.campaign.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!found || found.id === excludeId) return candidate;
    candidate = `${base}-${index + 2}`;
  }
  return `${base}-${Date.now()}`;
}

function campaignData(input: z.infer<typeof campaignInput>, slug: string) {
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (startsAt && endsAt && endsAt <= startsAt) throw new Error("CAMPAIGN_DATE_RANGE_INVALID");
  return {
    slug,
    eyebrow: cleanNullable(input.eyebrow) as string | null,
    title: input.title,
    summary: cleanNullable(input.summary) as string | null,
    body: cleanNullable(input.body) as string | null,
    heroImageUrl: cleanNullable(input.heroImageUrl) as string | null,
    mobileHeroImageUrl: cleanNullable(input.mobileHeroImageUrl) as string | null,
    heroAlt: cleanNullable(input.heroAlt) as string | null,
    ctaText: cleanNullable(input.ctaText) as string | null,
    ctaLink: cleanNullable(input.ctaLink) as string | null,
    secondaryCtaText: cleanNullable(input.secondaryCtaText) as string | null,
    secondaryCtaLink: cleanNullable(input.secondaryCtaLink) as string | null,
    theme: input.theme,
    seoTitle: cleanNullable(input.seoTitle) as string | null,
    seoDescription: cleanNullable(input.seoDescription) as string | null,
    startsAt,
    endsAt,
    isPublished: input.isPublished,
    isFeatured: input.isFeatured,
    priority: input.priority,
  };
}

publicCampaignRoutes.get("/", asyncHandler(async (req, res) => {
  const featured = req.query.featured === "true";
  const limit = Math.min(12, Math.max(1, Number(req.query.limit || 6)));
  const campaigns = await prisma.campaign.findMany({
    where: { ...liveWindow(), ...(featured ? { isFeatured: true } : {}) },
    select: { id: true, slug: true, eyebrow: true, title: true, summary: true, heroImageUrl: true, mobileHeroImageUrl: true, heroAlt: true, ctaText: true, ctaLink: true, theme: true, startsAt: true, endsAt: true, isFeatured: true, priority: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  res.json({ success: true, data: campaigns });
}));

publicCampaignRoutes.get("/:slug", asyncHandler(async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { slug: String(req.params.slug), ...liveWindow() },
    include: {
      products: { orderBy: { sortOrder: "asc" }, include: { product: { include: productInclude } } },
    },
  });
  if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found or not currently live" });
  const { products, ...rest } = campaign;
  res.json({ success: true, data: { ...rest, products: products.filter((row) => row.product.isActive).map((row) => publicProduct(row.product)) } });
}));

adminCampaignRoutes.get("/campaigns", asyncHandler(async (_req, res) => {
  const campaigns = await prisma.campaign.findMany({
    include: { products: { orderBy: { sortOrder: "asc" }, select: { productId: true, sortOrder: true, product: { select: { name: true, slug: true } } } } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  res.json({ success: true, data: campaigns });
}));

adminCampaignRoutes.post("/campaigns", asyncHandler(async (req, res) => {
  const parsed = campaignInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid campaign", errors: parsed.error.flatten() });
  const slug = await uniqueSlug(parsed.data.title, parsed.data.slug || undefined);
  let data;
  try { data = campaignData(parsed.data, slug); }
  catch { return res.status(400).json({ success: false, message: "Campaign end date must be after the start date" }); }
  const campaign = await prisma.campaign.create({
    data: {
      ...data,
      products: { create: parsed.data.productIds.map((productId, index) => ({ productId, sortOrder: index })) },
    },
    include: { products: true },
  });
  res.status(201).json({ success: true, data: campaign });
}));

adminCampaignRoutes.put("/campaigns/:id", asyncHandler(async (req, res) => {
  const parsed = campaignInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid campaign", errors: parsed.error.flatten() });
  const id = String(req.params.id);
  const existing = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return res.status(404).json({ success: false, message: "Campaign not found" });
  const slug = await uniqueSlug(parsed.data.title, parsed.data.slug || undefined, id);
  let data;
  try { data = campaignData(parsed.data, slug); }
  catch { return res.status(400).json({ success: false, message: "Campaign end date must be after the start date" }); }
  const campaign = await prisma.$transaction(async (tx) => {
    await tx.campaignProduct.deleteMany({ where: { campaignId: id } });
    return tx.campaign.update({
      where: { id },
      data: { ...data, products: { create: parsed.data.productIds.map((productId, index) => ({ productId, sortOrder: index })) } },
      include: { products: true },
    });
  });
  res.json({ success: true, data: campaign });
}));

adminCampaignRoutes.post("/campaigns/:id/duplicate", asyncHandler(async (req, res) => {
  const source = await prisma.campaign.findUnique({ where: { id: String(req.params.id) }, include: { products: { orderBy: { sortOrder: "asc" } } } });
  if (!source) return res.status(404).json({ success: false, message: "Campaign not found" });
  const title = `${source.title} Copy`;
  const slug = await uniqueSlug(title);
  const duplicate = await prisma.campaign.create({
    data: {
      slug, eyebrow: source.eyebrow, title, summary: source.summary, body: source.body,
      heroImageUrl: source.heroImageUrl, mobileHeroImageUrl: source.mobileHeroImageUrl, heroAlt: source.heroAlt,
      ctaText: source.ctaText, ctaLink: source.ctaLink, secondaryCtaText: source.secondaryCtaText, secondaryCtaLink: source.secondaryCtaLink,
      theme: source.theme, seoTitle: source.seoTitle, seoDescription: source.seoDescription,
      isPublished: false, isFeatured: false, priority: source.priority,
      products: { create: source.products.map((row) => ({ productId: row.productId, sortOrder: row.sortOrder })) },
    },
  });
  res.status(201).json({ success: true, data: duplicate });
}));

adminCampaignRoutes.delete("/campaigns/:id", asyncHandler(async (req, res) => {
  await prisma.campaign.delete({ where: { id: String(req.params.id) } });
  res.json({ success: true });
}));

adminCampaignRoutes.get("/media", asyncHandler(async (req, res) => {
  const kind = typeof req.query.kind === "string" ? req.query.kind : "";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const archived = req.query.archived === "true";
  const assets = await prisma.mediaAsset.findMany({
    where: {
      isArchived: archived,
      ...(kind && ["PRODUCT", "BRAND", "CAMPAIGN", "CATEGORY"].includes(kind) ? { kind: kind as any } : {}),
      ...(search ? { OR: [{ originalName: { contains: search, mode: "insensitive" } }, { altText: { contains: search, mode: "insensitive" } }, { url: { contains: search, mode: "insensitive" } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  });
  res.json({ success: true, data: assets });
}));

adminCampaignRoutes.post("/media/index-existing", asyncHandler(async (_req, res) => {
  const [productImages, categories, banners, campaigns, settings] = await Promise.all([
    prisma.productImage.findMany({ select: { url: true, altText: true } }),
    prisma.category.findMany({ where: { imageUrl: { not: null } }, select: { name: true, imageUrl: true } }),
    prisma.banner.findMany({ select: { title: true, imageUrl: true, mobileImageUrl: true, imageAlt: true } }),
    prisma.campaign.findMany({ select: { title: true, heroImageUrl: true, mobileHeroImageUrl: true, heroAlt: true } }),
    prisma.storeSetting.findUnique({ where: { id: "primary" }, select: { storeName: true, logoUrl: true, logoMarkUrl: true, logoAlt: true } }),
  ]);
  const rows: Array<{ kind: any; url: string; altText?: string | null; originalName?: string | null }> = [];
  for (const image of productImages) if (image.url) rows.push({ kind: "PRODUCT", url: image.url, altText: image.altText });
  for (const item of categories) if (item.imageUrl) rows.push({ kind: "CATEGORY", url: item.imageUrl, altText: item.name, originalName: item.name });
  for (const item of banners) {
    if (item.imageUrl) rows.push({ kind: "CAMPAIGN", url: item.imageUrl, altText: item.imageAlt || item.title, originalName: item.title });
    if (item.mobileImageUrl) rows.push({ kind: "CAMPAIGN", url: item.mobileImageUrl, altText: item.imageAlt || item.title, originalName: `${item.title} mobile` });
  }
  for (const item of campaigns) {
    if (item.heroImageUrl) rows.push({ kind: "CAMPAIGN", url: item.heroImageUrl, altText: item.heroAlt || item.title, originalName: item.title });
    if (item.mobileHeroImageUrl) rows.push({ kind: "CAMPAIGN", url: item.mobileHeroImageUrl, altText: item.heroAlt || item.title, originalName: `${item.title} mobile` });
  }
  if (settings?.logoUrl) rows.push({ kind: "BRAND", url: settings.logoUrl, altText: settings.logoAlt || settings.storeName, originalName: "Primary logo" });
  if (settings?.logoMarkUrl) rows.push({ kind: "BRAND", url: settings.logoMarkUrl, altText: settings.logoAlt || settings.storeName, originalName: "Vertical logo" });
  let indexed = 0;
  for (const row of rows) {
    await prisma.mediaAsset.upsert({
      where: { url: row.url },
      update: { kind: row.kind, altText: row.altText || undefined, originalName: row.originalName || undefined, isArchived: false },
      create: { kind: row.kind, url: row.url, altText: row.altText || null, originalName: row.originalName || null, storage: /^https?:\/\//i.test(row.url) ? "cloud" : "local" },
    });
    indexed += 1;
  }
  res.json({ success: true, data: { indexed } });
}));

adminCampaignRoutes.patch("/media/:id", asyncHandler(async (req, res) => {
  const parsed = z.object({ altText: z.string().trim().max(180).optional().nullable(), isArchived: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, message: "Invalid media update" });
  const asset = await prisma.mediaAsset.update({ where: { id: String(req.params.id) }, data: parsed.data });
  res.json({ success: true, data: asset });
}));

adminCampaignRoutes.get("/content/health", asyncHandler(async (_req, res) => {
  const now = new Date();
  const [campaigns, banners, mediaCount, missingMediaAlt] = await Promise.all([
    prisma.campaign.findMany({ select: { id: true, title: true, slug: true, isPublished: true, startsAt: true, endsAt: true, heroImageUrl: true, mobileHeroImageUrl: true, heroAlt: true, seoTitle: true, seoDescription: true } }),
    prisma.banner.findMany({ select: { id: true, title: true, isActive: true, imageUrl: true, mobileImageUrl: true, imageAlt: true, startsAt: true, endsAt: true } }),
    prisma.mediaAsset.count({ where: { isArchived: false } }),
    prisma.mediaAsset.count({ where: { isArchived: false, OR: [{ altText: null }, { altText: "" }] } }),
  ]);
  const campaignIssues = campaigns.map((item) => ({
    ...item,
    issues: [!item.heroImageUrl && "Missing hero image", item.heroImageUrl && !item.heroAlt && "Missing hero alt text", !item.seoTitle && "Missing SEO title", !item.seoDescription && "Missing SEO description", item.startsAt && item.endsAt && item.endsAt <= item.startsAt && "Invalid schedule"].filter(Boolean),
  })).filter((item) => item.issues.length);
  const bannerIssues = banners.map((item) => ({ ...item, issues: [!item.imageUrl && "Missing desktop image", item.imageUrl && !item.imageAlt && "Missing image alt text", !item.mobileImageUrl && "No mobile-specific image"].filter(Boolean) })).filter((item) => item.issues.length);
  const live = campaigns.filter((item) => item.isPublished && (!item.startsAt || item.startsAt <= now) && (!item.endsAt || item.endsAt > now)).length;
  const scheduled = campaigns.filter((item) => item.isPublished && item.startsAt && item.startsAt > now).length;
  res.json({ success: true, data: { campaigns: { total: campaigns.length, live, scheduled, issues: campaignIssues }, banners: { total: banners.length, issues: bannerIssues }, media: { total: mediaCount, missingAlt: missingMediaAlt } } });
}));

export { publicCampaignRoutes, adminCampaignRoutes };
