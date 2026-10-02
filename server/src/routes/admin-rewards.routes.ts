import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/async-handler";
import { adminAdjustRewards } from "../services/rewards.service";
import { getStoreSettings } from "../services/store.service";

const router = Router();
const settingsSchema = z.object({
  rewardsEnabled: z.boolean().optional(),
  rewardPointsPerHundred: z.number().int().min(0).max(500).optional(),
  rewardVoucherPoints: z.number().int().min(1).max(100000).optional(),
  rewardVoucherAmount: z.number().positive().max(100000).optional(),
  rewardVoucherMinOrderAmount: z.number().nonnegative().max(1000000).optional(),
  rewardVoucherValidityDays: z.number().int().min(1).max(3650).optional(),
  rewardReviewBonusPoints: z.number().int().min(0).max(10000).optional(),
  rewardReferralReferrerPoints: z.number().int().min(0).max(50000).optional(),
  rewardReferralNewCustomerPoints: z.number().int().min(0).max(50000).optional(),
});

router.get("/rewards", asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86400000);
  const [settings, members, transactions30d, recentTransactions, referralCount, vouchersIssued, vouchersUsed] = await Promise.all([
    getStoreSettings(),
    prisma.rewardAccount.findMany({ include: { user: { select: { id: true, firstName: true, lastName: true, email: true, referralCode: true } } }, orderBy: [{ balance: "desc" }, { lifetimeEarned: "desc" }], take: 100 }),
    prisma.rewardTransaction.findMany({ where: { createdAt: { gte: since } }, select: { points: true, type: true } }),
    prisma.rewardTransaction.findMany({ include: { user: { select: { firstName: true, lastName: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.user.count({ where: { referredByUserId: { not: null } } }),
    prisma.coupon.count({ where: { rewardOwnerUserId: { not: null } } }),
    prisma.coupon.count({ where: { rewardOwnerUserId: { not: null }, usageCount: { gt: 0 } } }),
  ]);
  const totalOutstanding = members.reduce((sum, row) => sum + Math.max(0, row.balance), 0);
  const earned30d = transactions30d.filter((row) => row.points > 0).reduce((sum, row) => sum + row.points, 0);
  const redeemed30d = Math.abs(transactions30d.filter((row) => row.type === "VOUCHER_REDEEM" && row.points < 0).reduce((sum, row) => sum + row.points, 0));
  const referralRewards30d = transactions30d.filter((row) => row.type === "REFERRAL_BONUS" && row.points > 0).length;
  res.json({ success: true, data: {
    settings,
    metrics: { members: members.length, totalOutstanding, earned30d, redeemed30d, referralCount, referralRewards30d, vouchersIssued, vouchersUsed },
    members, recentTransactions,
  } });
}));

router.patch("/rewards/settings", asyncHandler(async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ success: false, message: "Invalid rewards settings", errors: parsed.success ? undefined : parsed.error.flatten() });
  const data = await prisma.storeSetting.update({ where: { id: "primary" }, data: parsed.data });
  res.json({ success: true, data });
}));

router.post("/rewards/members/:userId/adjust", asyncHandler(async (req, res) => {
  const parsed = z.object({ points: z.number().int().min(-100000).max(100000).refine((value) => value !== 0), reason: z.string().trim().min(3).max(240) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a non-zero point adjustment and reason", errors: parsed.error.flatten() });
  const user = await prisma.user.findUnique({ where: { id: String(req.params.userId) }, select: { id: true, role: true } });
  if (!user || user.role !== "CUSTOMER") return res.status(404).json({ success: false, message: "Customer not found" });
  const transaction = await adminAdjustRewards(user.id, parsed.data.points, parsed.data.reason);
  res.json({ success: true, data: transaction });
}));
export default router;
