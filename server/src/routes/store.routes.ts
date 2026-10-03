import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/async-handler";
import { getStoreSettings } from "../services/store.service";
import { getShippingQuote } from "../services/shipping-zone.service";

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
        requireServiceablePostalCode: settings.requireServiceablePostalCode,
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

router.get(
  "/serviceability",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      postalCode: z.string().trim().regex(/^\d{6}$/),
      subtotal: z.coerce.number().nonnegative().optional().default(0),
      paymentMethod: z.enum(["COD", "ONLINE"]).optional().default("ONLINE"),
      weightGrams: z.coerce.number().int().nonnegative().optional().default(0),
    }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid 6-digit PIN code" });
    const settings = await getStoreSettings();
    const quote = await getShippingQuote({
      postalCode: parsed.data.postalCode,
      merchandiseAfterDiscount: parsed.data.subtotal,
      paymentMethod: parsed.data.paymentMethod,
      totalWeightGrams: parsed.data.weightGrams,
      settings,
    });
    res.json({
      success: true,
      data: {
        postalCode: quote.postalCode,
        serviceable: quote.serviceable,
        matched: quote.matched,
        strict: quote.strict,
        zoneName: quote.zoneName,
        city: quote.city,
        state: quote.state,
        codAllowed: quote.codAllowed,
        dispatchWithinDays: quote.dispatchWithinDays,
        deliveryMinDays: quote.deliveryMinDays,
        deliveryMaxDays: quote.deliveryMaxDays,
        totalWeightGrams: quote.totalWeightGrams,
        maxWeightGrams: quote.maxWeightGrams,
        preferredShippingPartnerName: quote.preferredShippingPartnerName,
        codMaxOrderAmount: quote.codMaxOrderAmountOverride,
        shippingFee: quote.shippingFee,
        freeShippingThreshold: quote.freeShippingThresholdOverride == null ? (settings.freeShippingThreshold == null ? null : Number(settings.freeShippingThreshold)) : quote.freeShippingThresholdOverride,
        reason: quote.reason,
      },
    });
  }),
);

export default router;
