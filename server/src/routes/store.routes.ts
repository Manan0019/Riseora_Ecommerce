import { Router } from "express";
import { asyncHandler } from "../utils/async-handler";
import { getStoreSettings } from "../services/store.service";

const router = Router();

router.get(
  "/config",
  asyncHandler(async (_req, res) => {
    const settings = await getStoreSettings();
    res.json({
      success: true,
      data: {
        storeName: settings.storeName,
        legalName: settings.legalName,
        supportEmail: settings.supportEmail,
        supportPhone: settings.supportPhone,
        gstin: settings.gstin,
        freeShippingThreshold: settings.freeShippingThreshold == null ? null : Number(settings.freeShippingThreshold),
        flatShippingFee: Number(settings.flatShippingFee),
        codFee: Number(settings.codFee),
        codEnabled: settings.codEnabled,
        codMinOrderAmount: settings.codMinOrderAmount == null ? null : Number(settings.codMinOrderAmount),
        codMaxOrderAmount: settings.codMaxOrderAmount == null ? null : Number(settings.codMaxOrderAmount),
        maxOpenCodOrdersPerCustomer: settings.maxOpenCodOrdersPerCustomer,
        dispatchWithinDays: settings.dispatchWithinDays,
        deliveryMinDays: settings.deliveryMinDays,
        deliveryMaxDays: Math.max(settings.deliveryMinDays, settings.deliveryMaxDays),
        lowStockUrgencyThreshold: settings.lowStockUrgencyThreshold,
        returnsEnabled: settings.returnsEnabled,
        returnWindowDays: settings.returnWindowDays,
        returnPolicy: settings.returnPolicy,
        shippingPolicy: settings.shippingPolicy,
        privacyPolicy: settings.privacyPolicy,
        termsPolicy: settings.termsPolicy,
        brandTagline: settings.brandTagline,
        logoUrl: settings.logoUrl,
        logoMarkUrl: settings.logoMarkUrl,
        logoAlt: settings.logoAlt,
        announcementText: settings.announcementText,
        announcementSecondary: settings.announcementSecondary,
        siteUrl: settings.siteUrl,
        seoTitle: settings.seoTitle,
        seoDescription: settings.seoDescription,
        aboutTitle: settings.aboutTitle,
        aboutBody: settings.aboutBody,
        contactIntro: settings.contactIntro,
        instagramUrl: settings.instagramUrl,
        facebookUrl: settings.facebookUrl,
        youtubeUrl: settings.youtubeUrl,
        whatsappNumber: settings.whatsappNumber,
      },
    });
  }),
);

export default router;
