-- Phase 86: Retention Intelligence, Lifecycle Campaigns & Growth Control Center V2
CREATE TYPE "RetentionSegment" AS ENUM ('NEW', 'ACTIVE', 'LOYAL', 'VIP', 'AT_RISK', 'LAPSED');
CREATE TYPE "RetentionCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');
CREATE TYPE "RetentionBenefitKind" AS ENUM ('COUPON', 'REWARD_POINTS');
CREATE TYPE "RetentionAudiencePolicy" AS ENUM ('ACCOUNT_PERSONALIZATION', 'MARKETING_OPT_IN_ONLY');
CREATE TYPE "RetentionEnrollmentStatus" AS ENUM ('ELIGIBLE', 'SUPPRESSED', 'ISSUED', 'EXPIRED');

CREATE TABLE "RetentionCampaign" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "segment" "RetentionSegment" NOT NULL,
  "status" "RetentionCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "benefitKind" "RetentionBenefitKind" NOT NULL,
  "audiencePolicy" "RetentionAudiencePolicy" NOT NULL DEFAULT 'ACCOUNT_PERSONALIZATION',
  "couponAmount" DECIMAL(12,2),
  "rewardPoints" INTEGER,
  "validDays" INTEGER NOT NULL DEFAULT 30,
  "createdByUserId" UUID,
  "previewEligible" INTEGER NOT NULL DEFAULT 0,
  "previewSuppressed" INTEGER NOT NULL DEFAULT 0,
  "activatedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RetentionCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetentionEnrollment" (
  "id" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "segmentSnapshot" "RetentionSegment" NOT NULL,
  "riskScoreSnapshot" INTEGER NOT NULL,
  "lifetimeSpendSnapshot" DECIMAL(12,2) NOT NULL,
  "status" "RetentionEnrollmentStatus" NOT NULL,
  "suppressionReason" TEXT,
  "couponId" UUID,
  "couponCodeSnapshot" TEXT,
  "rewardTransactionId" UUID,
  "expiresAt" TIMESTAMP(3),
  "notifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RetentionEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RetentionCampaign_status_createdAt_idx" ON "RetentionCampaign"("status", "createdAt");
CREATE INDEX "RetentionCampaign_segment_status_createdAt_idx" ON "RetentionCampaign"("segment", "status", "createdAt");
CREATE INDEX "RetentionCampaign_createdByUserId_createdAt_idx" ON "RetentionCampaign"("createdByUserId", "createdAt");
CREATE UNIQUE INDEX "RetentionEnrollment_couponId_key" ON "RetentionEnrollment"("couponId");
CREATE UNIQUE INDEX "RetentionEnrollment_rewardTransactionId_key" ON "RetentionEnrollment"("rewardTransactionId");
CREATE UNIQUE INDEX "RetentionEnrollment_campaignId_userId_key" ON "RetentionEnrollment"("campaignId", "userId");
CREATE INDEX "RetentionEnrollment_userId_status_createdAt_idx" ON "RetentionEnrollment"("userId", "status", "createdAt");
CREATE INDEX "RetentionEnrollment_campaignId_status_idx" ON "RetentionEnrollment"("campaignId", "status");
CREATE INDEX "RetentionEnrollment_segmentSnapshot_status_createdAt_idx" ON "RetentionEnrollment"("segmentSnapshot", "status", "createdAt");

ALTER TABLE "RetentionCampaign" ADD CONSTRAINT "RetentionCampaign_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RetentionEnrollment" ADD CONSTRAINT "RetentionEnrollment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "RetentionCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetentionEnrollment" ADD CONSTRAINT "RetentionEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetentionEnrollment" ADD CONSTRAINT "RetentionEnrollment_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RetentionCampaign" ADD CONSTRAINT "RetentionCampaign_validDays_check" CHECK ("validDays" BETWEEN 1 AND 90);
ALTER TABLE "RetentionCampaign" ADD CONSTRAINT "RetentionCampaign_value_shape_check" CHECK (("benefitKind" = 'COUPON' AND "couponAmount" IS NOT NULL AND "couponAmount" > 0 AND "rewardPoints" IS NULL) OR ("benefitKind" = 'REWARD_POINTS' AND "rewardPoints" IS NOT NULL AND "rewardPoints" > 0 AND "couponAmount" IS NULL));
ALTER TABLE "RetentionEnrollment" ADD CONSTRAINT "RetentionEnrollment_risk_check" CHECK ("riskScoreSnapshot" BETWEEN 0 AND 100);
