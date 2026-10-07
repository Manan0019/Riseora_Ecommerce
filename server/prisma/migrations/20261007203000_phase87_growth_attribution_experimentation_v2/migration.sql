-- Phase 87 · Growth Attribution, Campaign ROI & Experimentation V2
CREATE TYPE "RetentionExperimentMode" AS ENUM ('NONE', 'HOLDOUT', 'AB_TEST');
CREATE TYPE "RetentionExperimentGroup" AS ENUM ('STANDARD', 'CONTROL', 'VARIANT_A', 'VARIANT_B');
ALTER TYPE "RetentionEnrollmentStatus" ADD VALUE IF NOT EXISTS 'CONTROL';

ALTER TABLE "RetentionCampaign"
  ADD COLUMN "experimentMode" "RetentionExperimentMode" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "holdoutPercent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "variantBLabel" TEXT,
  ADD COLUMN "variantBCouponAmount" DECIMAL(12,2),
  ADD COLUMN "variantBRewardPoints" INTEGER,
  ADD COLUMN "attributionWindowDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "pointValueRupees" DECIMAL(8,2) NOT NULL DEFAULT 1;

ALTER TABLE "RetentionEnrollment"
  ADD COLUMN "experimentGroup" "RetentionExperimentGroup" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "variantLabel" TEXT,
  ADD COLUMN "exposedAt" TIMESTAMP(3),
  ADD COLUMN "benefitFaceValue" DECIMAL(12,2);

CREATE INDEX "RetentionEnrollment_campaignId_experimentGroup_status_idx" ON "RetentionEnrollment"("campaignId", "experimentGroup", "status");
CREATE INDEX "RetentionEnrollment_userId_exposedAt_idx" ON "RetentionEnrollment"("userId", "exposedAt");
