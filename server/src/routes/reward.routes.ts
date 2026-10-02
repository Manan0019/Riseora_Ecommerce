import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { createRewardVoucher, rewardSummary } from "../services/rewards.service";
import { getStoreSettings } from "../services/store.service";

const router = Router();
const redeemLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });

router.get("/public", asyncHandler(async (_req, res) => {
  const settings = await getStoreSettings();
  res.json({ success: true, data: {
    enabled: settings.rewardsEnabled,
    pointsPerHundred: settings.rewardPointsPerHundred,
    voucherPoints: settings.rewardVoucherPoints,
    voucherAmount: Number(settings.rewardVoucherAmount),
    reviewBonusPoints: settings.rewardReviewBonusPoints,
    referralReferrerPoints: settings.rewardReferralReferrerPoints,
    referralNewCustomerPoints: settings.rewardReferralNewCustomerPoints,
  } });
}));

router.use(requireAuth);
router.get("/me", asyncHandler(async (req, res) => res.json({ success: true, data: await rewardSummary(req.user!.id) })));
router.post("/vouchers", redeemLimit, asyncHandler(async (req, res) => {
  try { const coupon = await createRewardVoucher(req.user!.id); res.status(201).json({ success: true, data: coupon, message: `Voucher ${coupon.code} created.` }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "REWARD_REDEEM_FAILED";
    if (message === "REWARDS_DISABLED") return res.status(409).json({ success: false, message: "Riseora Rewards is currently paused." });
    if (message === "INSUFFICIENT_POINTS") return res.status(409).json({ success: false, message: "You do not have enough available points yet." });
    if (message === "VOUCHER_NOT_CONFIGURED") return res.status(409).json({ success: false, message: "Reward vouchers are not configured yet." });
    throw error;
  }
}));
export default router;
