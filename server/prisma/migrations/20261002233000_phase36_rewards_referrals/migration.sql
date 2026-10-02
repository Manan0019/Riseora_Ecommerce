-- Phase 36: rewards, referrals and private reward vouchers
CREATE TYPE "RewardTransactionType" AS ENUM ('ORDER_EARN','REVIEW_BONUS','REFERRAL_BONUS','REFERRAL_WELCOME','VOUCHER_REDEEM','REVERSAL','ADMIN_ADJUST');

ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN "referredByUserId" UUID;
UPDATE "User" SET "referralCode" = 'RISE-' || UPPER(SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 12)) WHERE "referralCode" IS NULL;
ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_referredByUserId_createdAt_idx" ON "User"("referredByUserId", "createdAt");
ALTER TABLE "User" ADD CONSTRAINT "User_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RewardAccount" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "lifetimeEarned" INTEGER NOT NULL DEFAULT 0,
  "lifetimeRedeemed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RewardAccount_userId_key" ON "RewardAccount"("userId");
CREATE INDEX "RewardAccount_balance_idx" ON "RewardAccount"("balance");
ALTER TABLE "RewardAccount" ADD CONSTRAINT "RewardAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RewardTransaction" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" "RewardTransactionType" NOT NULL,
  "points" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "sourceKey" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RewardTransaction_sourceKey_key" ON "RewardTransaction"("sourceKey");
CREATE INDEX "RewardTransaction_userId_createdAt_idx" ON "RewardTransaction"("userId", "createdAt");
CREATE INDEX "RewardTransaction_type_createdAt_idx" ON "RewardTransaction"("type", "createdAt");
ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoreSetting" ADD COLUMN "rewardsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StoreSetting" ADD COLUMN "rewardPointsPerHundred" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "StoreSetting" ADD COLUMN "rewardVoucherPoints" INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "StoreSetting" ADD COLUMN "rewardVoucherAmount" DECIMAL(12,2) NOT NULL DEFAULT 50;
ALTER TABLE "StoreSetting" ADD COLUMN "rewardVoucherMinOrderAmount" DECIMAL(12,2) NOT NULL DEFAULT 499;
ALTER TABLE "StoreSetting" ADD COLUMN "rewardVoucherValidityDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "StoreSetting" ADD COLUMN "rewardReviewBonusPoints" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "StoreSetting" ADD COLUMN "rewardReferralReferrerPoints" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "StoreSetting" ADD COLUMN "rewardReferralNewCustomerPoints" INTEGER NOT NULL DEFAULT 50;

ALTER TABLE "Coupon" ADD COLUMN "rewardOwnerUserId" UUID;
ALTER TABLE "Coupon" ADD COLUMN "rewardPointsCost" INTEGER;
CREATE INDEX "Coupon_rewardOwnerUserId_isActive_idx" ON "Coupon"("rewardOwnerUserId", "isActive");
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_rewardOwnerUserId_fkey" FOREIGN KEY ("rewardOwnerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
