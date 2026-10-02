import { Router } from "express";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { getStoreSettings } from "../services/store.service";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/overview", asyncHandler(async (_req, res) => {
  const now = new Date();
  const [settings, productCount, activeVariantCount, outOfStockCount, missingImageProducts, missingDescriptionProducts, activeDeals] = await Promise.all([
    getStoreSettings(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.productVariant.count({ where: { isActive: true, product: { isActive: true } } }),
    prisma.productVariant.count({ where: { isActive: true, stockQuantity: { lte: 0 }, product: { isActive: true } } }),
    prisma.product.count({ where: { isActive: true, images: { none: {} } } }),
    prisma.product.count({ where: { isActive: true, AND: [{ OR: [{ shortDescription: null }, { shortDescription: "" }] }, { OR: [{ description: null }, { description: "" }] }] } }),
    prisma.merchandisingDeal.count({ where: { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] } }),
  ]);

  const publicBase = (settings.siteUrl || env.PUBLIC_SITE_URL || env.CLIENT_URL).replace(/\/$/, "");
  res.json({
    success: true,
    data: {
      site: {
        publicBase,
        hasSiteUrl: Boolean(settings.siteUrl || env.PUBLIC_SITE_URL),
        hasSeoTitle: Boolean(settings.seoTitle),
        hasSeoDescription: Boolean(settings.seoDescription),
        hasLogo: Boolean(settings.logoUrl),
        hasPrivacyPolicy: Boolean(settings.privacyPolicy),
        hasTermsPolicy: Boolean(settings.termsPolicy),
      },
      catalog: { productCount, activeVariantCount, outOfStockCount, missingImageProducts, missingDescriptionProducts, activeDeals },
      endpoints: {
        robots: `${publicBase}/robots.txt`,
        sitemap: `${publicBase}/sitemap.xml`,
        merchantFeed: `${publicBase}/google-merchant.xml`,
      },
    },
  });
}));

export default router;
