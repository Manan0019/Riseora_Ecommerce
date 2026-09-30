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
        returnsEnabled: settings.returnsEnabled,
        returnWindowDays: settings.returnWindowDays,
        returnPolicy: settings.returnPolicy,
        shippingPolicy: settings.shippingPolicy,
        privacyPolicy: settings.privacyPolicy,
        termsPolicy: settings.termsPolicy,
      },
    });
  }),
);

export default router;
