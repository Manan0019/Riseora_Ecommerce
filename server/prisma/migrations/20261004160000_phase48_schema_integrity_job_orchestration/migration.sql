-- Phase 48: repair historical refill schema drift and add durable background-job orchestration.
-- This migration is intentionally defensive because some delta installs contained the
-- Phase 38 Prisma model without its migration reaching the target database.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REFILL';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RefillReminderStatus') THEN
    CREATE TYPE "RefillReminderStatus" AS ENUM ('ACTIVE','PAUSED','CANCELLED');
  END IF;
END $$;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "replenishmentEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "replenishmentDays" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "replenishmentLabel" TEXT;

CREATE TABLE IF NOT EXISTS "RefillReminder" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "intervalDays" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "status" "RefillReminderStatus" NOT NULL DEFAULT 'ACTIVE',
  "nextReminderAt" TIMESTAMP(3) NOT NULL,
  "lastReminderAt" TIMESTAMP(3),
  "lastOrderedAt" TIMESTAMP(3),
  "reminderCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefillReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefillReminder_userId_variantId_key" ON "RefillReminder"("userId", "variantId");
CREATE INDEX IF NOT EXISTS "RefillReminder_status_nextReminderAt_idx" ON "RefillReminder"("status", "nextReminderAt");
CREATE INDEX IF NOT EXISTS "RefillReminder_userId_status_nextReminderAt_idx" ON "RefillReminder"("userId", "status", "nextReminderAt");
CREATE INDEX IF NOT EXISTS "RefillReminder_variantId_status_idx" ON "RefillReminder"("variantId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RefillReminder_userId_fkey') THEN
    ALTER TABLE "RefillReminder" ADD CONSTRAINT "RefillReminder_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RefillReminder_variantId_fkey') THEN
    ALTER TABLE "RefillReminder" ADD CONSTRAINT "RefillReminder_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SystemJobState" (
  "key" TEXT NOT NULL,
  "lastStartedAt" TIMESTAMP(3),
  "lastSucceededAt" TIMESTAMP(3),
  "lastFailedAt" TIMESTAMP(3),
  "lastDurationMs" INTEGER,
  "lastSummary" JSONB,
  "lastError" TEXT,
  "leaseOwner" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemJobState_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "SystemJobState_leaseUntil_idx" ON "SystemJobState"("leaseUntil");
CREATE INDEX IF NOT EXISTS "SystemJobState_lastFailedAt_idx" ON "SystemJobState"("lastFailedAt");
