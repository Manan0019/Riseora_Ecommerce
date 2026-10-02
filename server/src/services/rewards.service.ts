import { randomBytes } from "node:crypto";
import type { Prisma, RewardTransactionType } from "../generated/prisma/client";
import { prisma } from "../config/prisma";
import { getStoreSettings } from "./store.service";
import { createUserNotification } from "./notification-center.service";

type Tx = Prisma.TransactionClient;

function asJson(value: Record<string, unknown>): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }

async function accountFor(tx: Tx, userId: string) {
  return tx.rewardAccount.upsert({ where: { userId }, update: {}, create: { userId } });
}

export async function applyRewardPoints(tx: Tx, input: {
  userId: string; points: number; type: RewardTransactionType; description: string; sourceKey?: string | null; metadata?: Record<string, unknown>;
}) {
  const points = Math.trunc(input.points);
  if (!points) return null;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`rewards:${input.userId}`}))`;
  if (input.sourceKey) {
    const existing = await tx.rewardTransaction.findUnique({ where: { sourceKey: input.sourceKey } });
    if (existing) return existing;
  }
  const account = await accountFor(tx, input.userId);
  const balanceAfter = account.balance + points;
  await tx.rewardAccount.update({
    where: { userId: input.userId },
    data: {
      balance: balanceAfter,
      ...(points > 0 ? { lifetimeEarned: { increment: points } } : {}),
      ...(input.type === "VOUCHER_REDEEM" && points < 0 ? { lifetimeRedeemed: { increment: Math.abs(points) } } : {}),
    },
  });
  return tx.rewardTransaction.create({ data: {
    userId: input.userId, type: input.type, points, balanceAfter, description: input.description,
    sourceKey: input.sourceKey || null, metadata: input.metadata ? asJson(input.metadata) : undefined,
  } });
}

export async function awardDeliveredOrderRewards(orderId: string) {
  const settings = await getStoreSettings();
  if (!settings.rewardsEnabled || Number(settings.rewardPointsPerHundred || 0) <= 0) return null;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { id: true, firstName: true, referredByUserId: true } } },
  });
  if (!order?.userId || order.status !== "DELIVERED") return null;
  const points = Math.max(0, Math.floor(Number(order.totalAmount || 0) / 100) * Number(settings.rewardPointsPerHundred || 0));
  if (!points) return null;

  const txResult = await prisma.$transaction(async (tx) => {
    const earned = await applyRewardPoints(tx, {
      userId: order.userId!, points, type: "ORDER_EARN", description: `Rewards earned on ${order.orderNumber}`,
      sourceKey: `order-delivered:${order.id}`, metadata: { orderId: order.id, orderNumber: order.orderNumber, orderTotal: Number(order.totalAmount) },
    });

    let referrerAward: any = null; let referredAward: any = null;
    if (order.user?.referredByUserId) {
      const deliveredCount = await tx.order.count({ where: { userId: order.userId!, status: "DELIVERED" } });
      if (deliveredCount === 1) {
        const referrerPoints = Number(settings.rewardReferralReferrerPoints || 0);
        const newCustomerPoints = Number(settings.rewardReferralNewCustomerPoints || 0);
        if (referrerPoints > 0) referrerAward = await applyRewardPoints(tx, {
          userId: order.user.referredByUserId, points: referrerPoints, type: "REFERRAL_BONUS", description: "Referral reward: first delivered order",
          sourceKey: `referral-referrer:${order.userId}`, metadata: { referredUserId: order.userId!, qualifyingOrderId: order.id, orderNumber: order.orderNumber },
        });
        if (newCustomerPoints > 0) referredAward = await applyRewardPoints(tx, {
          userId: order.userId!, points: newCustomerPoints, type: "REFERRAL_WELCOME", description: "Referral welcome reward",
          sourceKey: `referral-welcome:${order.userId}`, metadata: { qualifyingOrderId: order.id, orderNumber: order.orderNumber },
        });
      }
    }
    return { earned, referrerAward, referredAward, referrerId: order.user?.referredByUserId || null };
  });

  if (txResult.earned) void createUserNotification({ userId: order.userId, title: `+${points} Riseora Rewards points`, message: `Your delivered order ${order.orderNumber} earned ${points} points.`, type: "GENERAL", ctaLabel: "View rewards", ctaUrl: "/rewards", dedupeKey: `reward-order-notification/${order.id}` }).catch(() => {});
  if (txResult.referredAward) void createUserNotification({ userId: order.userId, title: "Referral reward unlocked", message: `Your first delivered order unlocked ${Number(settings.rewardReferralNewCustomerPoints || 0)} bonus points.`, type: "GENERAL", ctaLabel: "View rewards", ctaUrl: "/rewards", dedupeKey: `reward-referral-welcome-notification/${order.userId}` }).catch(() => {});
  if (txResult.referrerAward && txResult.referrerId) void createUserNotification({ userId: txResult.referrerId, title: "Your referral placed their first order", message: `You earned ${Number(settings.rewardReferralReferrerPoints || 0)} referral points.`, type: "GENERAL", ctaLabel: "View rewards", ctaUrl: "/rewards", dedupeKey: `reward-referrer-notification/${order.userId}` }).catch(() => {});
  return txResult;
}

export async function awardApprovedReviewReward(reviewId: string) {
  const settings = await getStoreSettings();
  if (!settings.rewardsEnabled || Number(settings.rewardReviewBonusPoints || 0) <= 0) return null;
  const review = await prisma.review.findUnique({ where: { id: reviewId }, include: { product: { select: { name: true } } } });
  if (!review?.isApproved || !review.verifiedPurchase) return null;
  const points = Number(settings.rewardReviewBonusPoints || 0);
  const existing = await prisma.rewardTransaction.findMany({ where: { userId: review.userId, OR: [{ sourceKey: { startsWith: `review-approved:${review.id}:` } }, { sourceKey: { startsWith: `review-reversed:${review.id}:` } }] }, select: { sourceKey: true } });
  const awards = existing.filter((item) => item.sourceKey?.startsWith(`review-approved:${review.id}:`)).length;
  const reversals = existing.filter((item) => item.sourceKey?.startsWith(`review-reversed:${review.id}:`)).length;
  if (awards > reversals) return null;
  const cycle = awards + 1;
  const created = await prisma.$transaction((tx) => applyRewardPoints(tx, {
    userId: review.userId, points, type: "REVIEW_BONUS", description: `Verified review bonus: ${review.product.name}`,
    sourceKey: `review-approved:${review.id}:${cycle}`, metadata: { reviewId: review.id, productId: review.productId, productName: review.product.name, cycle },
  }));
  if (created) void createUserNotification({ userId: review.userId, title: `+${points} points for your review`, message: `Thanks for reviewing ${review.product.name}. Your verified review reward is ready.`, type: "GENERAL", ctaLabel: "View rewards", ctaUrl: "/rewards", dedupeKey: `reward-review-notification/${review.id}/${cycle}` }).catch(() => {});
  return created;
}

export async function reverseReviewReward(reviewId: string) {
  const entries = await prisma.rewardTransaction.findMany({ where: { OR: [{ sourceKey: { startsWith: `review-approved:${reviewId}:` } }, { sourceKey: { startsWith: `review-reversed:${reviewId}:` } }] }, orderBy: { createdAt: "asc" } });
  const awards = entries.filter((item) => item.sourceKey?.startsWith(`review-approved:${reviewId}:`) && item.points > 0);
  const reversals = entries.filter((item) => item.sourceKey?.startsWith(`review-reversed:${reviewId}:`) && item.points < 0);
  if (awards.length <= reversals.length) return null;
  const original = awards[awards.length - 1];
  const cycle = reversals.length + 1;
  return prisma.$transaction((tx) => applyRewardPoints(tx, {
    userId: original.userId, points: -original.points, type: "REVERSAL", description: "Review reward reversed",
    sourceKey: `review-reversed:${reviewId}:${cycle}`, metadata: { reviewId, cycle },
  }));
}

export async function reverseRefundedOrderRewards(returnRequestId: string) {
  const request = await prisma.returnRequest.findUnique({ where: { id: returnRequestId }, include: { order: { include: { returnRequests: true } } } });
  if (!request?.order.userId || request.status !== "REFUNDED") return null;
  const original = await prisma.rewardTransaction.findUnique({ where: { sourceKey: `order-delivered:${request.order.id}` } });
  if (!original || original.points <= 0) return null;
  const total = Math.max(0.01, Number(request.order.totalAmount || 0));
  const refundedTotal = request.order.returnRequests.filter((item) => item.status === "REFUNDED").reduce((sum, item) => sum + Number(item.refundAmount || 0), 0);
  const cumulativeTarget = Math.min(original.points, Math.round(original.points * Math.min(1, refundedTotal / total)));
  const existingReversals = await prisma.rewardTransaction.findMany({ where: { userId: request.order.userId, sourceKey: { startsWith: `return-reward-reversal:${request.order.id}:` } }, select: { points: true } });
  const already = Math.abs(existingReversals.reduce((sum, item) => sum + Math.min(0, item.points), 0));
  const needed = Math.max(0, cumulativeTarget - already);
  if (!needed) return null;
  const reversed = await prisma.$transaction((tx) => applyRewardPoints(tx, {
    userId: request.order.userId!, points: -needed, type: "REVERSAL", description: `Rewards adjusted after refund ${request.returnNumber}`,
    sourceKey: `return-reward-reversal:${request.order.id}:${request.id}`, metadata: { orderId: request.order.id, returnRequestId: request.id, refundAmount: Number(request.refundAmount) },
  }));
  if (reversed) void createUserNotification({ userId: request.order.userId, title: "Rewards balance adjusted", message: `${needed} points were adjusted after refund ${request.returnNumber}.`, type: "GENERAL", ctaLabel: "View rewards", ctaUrl: "/rewards", dedupeKey: `reward-refund-notification/${request.id}` }).catch(() => {});

  if (refundedTotal + 0.01 >= total) {
    const referralTxs = await prisma.rewardTransaction.findMany({ where: { sourceKey: { in: [`referral-welcome:${request.order.userId}`, `referral-referrer:${request.order.userId}`] } } });
    for (const item of referralTxs) {
      const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata as any : {};
      if (metadata.qualifyingOrderId !== request.order.id || item.points <= 0) continue;
      await prisma.$transaction((tx) => applyRewardPoints(tx, { userId: item.userId, points: -item.points, type: "REVERSAL", description: "Referral reward reversed after full refund", sourceKey: `referral-reversal:${item.id}`, metadata: { qualifyingOrderId: request.order.id } }));
    }
  }
  return reversed;
}

export async function createRewardVoucher(userId: string) {
  const settings = await getStoreSettings();
  if (!settings.rewardsEnabled) throw new Error("REWARDS_DISABLED");
  const cost = Math.max(1, Number(settings.rewardVoucherPoints || 0));
  const amount = Number(settings.rewardVoucherAmount || 0);
  if (amount <= 0) throw new Error("VOUCHER_NOT_CONFIGURED");
  const code = `RWD-${randomBytes(4).toString("hex").toUpperCase()}`;
  const endsAt = new Date(Date.now() + Math.max(1, Number(settings.rewardVoucherValidityDays || 90)) * 86400000);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`rewards:${userId}`}))`;
    const account = await accountFor(tx, userId);
    if (account.balance < cost) throw new Error("INSUFFICIENT_POINTS");
    const coupon = await tx.coupon.create({ data: {
      code, description: "Private Riseora Rewards voucher", discountType: "FIXED", discountValue: amount, scope: "ORDER", application: "ORDER_TOTAL",
      minOrderAmount: Number(settings.rewardVoucherMinOrderAmount || 0), usageLimit: 1, perCustomerUsageLimit: 1, startsAt: new Date(), endsAt, isActive: true,
      rewardOwnerUserId: userId, rewardPointsCost: cost,
    } });
    await applyRewardPoints(tx, { userId, points: -cost, type: "VOUCHER_REDEEM", description: `Redeemed ${cost} points for ₹${amount.toFixed(0)} voucher`, sourceKey: `reward-voucher:${coupon.id}`, metadata: { couponId: coupon.id, code: coupon.code, voucherAmount: amount } });
    return coupon;
  });
  void createUserNotification({ userId, title: "Your rewards voucher is ready", message: `${result.code} gives ₹${amount.toFixed(0)} off an eligible order.`, type: "GENERAL", ctaLabel: "Shop now", ctaUrl: "/shop", dedupeKey: `reward-voucher-notification/${result.id}` }).catch(() => {});
  return result;
}

export async function rewardSummary(userId: string) {
  const settings = await getStoreSettings();
  const [user, account, transactions, vouchers, referralCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true, referredBy: { select: { firstName: true } } } }),
    prisma.rewardAccount.upsert({ where: { userId }, update: {}, create: { userId } }),
    prisma.rewardTransaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.coupon.findMany({ where: { rewardOwnerUserId: userId }, orderBy: { createdAt: "desc" }, select: { id: true, code: true, discountValue: true, minOrderAmount: true, usageCount: true, usageLimit: true, startsAt: true, endsAt: true, isActive: true, rewardPointsCost: true, createdAt: true } }),
    prisma.user.count({ where: { referredByUserId: userId } }),
  ]);
  const successfulReferrals = await prisma.rewardTransaction.count({ where: { userId, type: "REFERRAL_BONUS", points: { gt: 0 } } });
  return {
    account,
    transactions,
    vouchers,
    referralCode: user?.referralCode || "",
    referredByName: user?.referredBy?.firstName || null,
    referralCount,
    successfulReferrals,
    settings: {
      enabled: settings.rewardsEnabled,
      pointsPerHundred: settings.rewardPointsPerHundred,
      voucherPoints: settings.rewardVoucherPoints,
      voucherAmount: Number(settings.rewardVoucherAmount),
      voucherMinOrderAmount: Number(settings.rewardVoucherMinOrderAmount),
      voucherValidityDays: settings.rewardVoucherValidityDays,
      reviewBonusPoints: settings.rewardReviewBonusPoints,
      referralReferrerPoints: settings.rewardReferralReferrerPoints,
      referralNewCustomerPoints: settings.rewardReferralNewCustomerPoints,
    },
  };
}

export async function adminAdjustRewards(userId: string, points: number, reason: string) {
  return prisma.$transaction((tx) => applyRewardPoints(tx, { userId, points, type: "ADMIN_ADJUST", description: reason, sourceKey: `admin-adjust:${randomBytes(8).toString("hex")}`, metadata: { reason } }));
}
