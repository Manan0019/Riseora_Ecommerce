-- Phase 85: Production Reliability + Customer Recovery V2
CREATE TYPE "SupportRecoveryKind" AS ENUM ('COUPON', 'REWARD_POINTS');

CREATE TABLE "SupportRecoveryGrant" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "grantedByUserId" UUID,
  "kind" "SupportRecoveryKind" NOT NULL,
  "couponAmount" DECIMAL(12,2),
  "points" INTEGER,
  "couponId" UUID,
  "couponCodeSnapshot" TEXT,
  "rewardTransactionId" UUID,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportRecoveryGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportRecoveryGrant_ticketId_key" ON "SupportRecoveryGrant"("ticketId");
CREATE UNIQUE INDEX "SupportRecoveryGrant_couponId_key" ON "SupportRecoveryGrant"("couponId");
CREATE UNIQUE INDEX "SupportRecoveryGrant_rewardTransactionId_key" ON "SupportRecoveryGrant"("rewardTransactionId");
CREATE INDEX "SupportRecoveryGrant_userId_createdAt_idx" ON "SupportRecoveryGrant"("userId", "createdAt");
CREATE INDEX "SupportRecoveryGrant_kind_createdAt_idx" ON "SupportRecoveryGrant"("kind", "createdAt");
CREATE INDEX "SupportRecoveryGrant_grantedByUserId_createdAt_idx" ON "SupportRecoveryGrant"("grantedByUserId", "createdAt");

ALTER TABLE "SupportRecoveryGrant"
  ADD CONSTRAINT "SupportRecoveryGrant_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "ContactMessage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportRecoveryGrant"
  ADD CONSTRAINT "SupportRecoveryGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportRecoveryGrant"
  ADD CONSTRAINT "SupportRecoveryGrant_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportRecoveryGrant"
  ADD CONSTRAINT "SupportRecoveryGrant_couponId_fkey"
  FOREIGN KEY ("couponId") REFERENCES "Coupon"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportRecoveryGrant"
  ADD CONSTRAINT "SupportRecoveryGrant_couponAmount_check"
  CHECK ("couponAmount" IS NULL OR "couponAmount" > 0);

ALTER TABLE "SupportRecoveryGrant"
  ADD CONSTRAINT "SupportRecoveryGrant_points_check"
  CHECK ("points" IS NULL OR "points" > 0);

ALTER TABLE "SupportRecoveryGrant"
  ADD CONSTRAINT "SupportRecoveryGrant_value_shape_check"
  CHECK (
    ("kind" = 'COUPON' AND "couponAmount" IS NOT NULL AND "points" IS NULL)
    OR
    ("kind" = 'REWARD_POINTS' AND "points" IS NOT NULL AND "couponAmount" IS NULL)
  );
