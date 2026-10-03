-- Phase 38: refill/replenishment reminders and repeat-purchase lifecycle
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REFILL';
CREATE TYPE "RefillReminderStatus" AS ENUM ('ACTIVE','PAUSED','CANCELLED');

ALTER TABLE "Product" ADD COLUMN "replenishmentEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "replenishmentDays" INTEGER;
ALTER TABLE "Product" ADD COLUMN "replenishmentLabel" TEXT;

CREATE TABLE "RefillReminder" (
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

CREATE UNIQUE INDEX "RefillReminder_userId_variantId_key" ON "RefillReminder"("userId", "variantId");
CREATE INDEX "RefillReminder_status_nextReminderAt_idx" ON "RefillReminder"("status", "nextReminderAt");
CREATE INDEX "RefillReminder_userId_status_nextReminderAt_idx" ON "RefillReminder"("userId", "status", "nextReminderAt");
CREATE INDEX "RefillReminder_variantId_status_idx" ON "RefillReminder"("variantId", "status");

ALTER TABLE "RefillReminder" ADD CONSTRAINT "RefillReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefillReminder" ADD CONSTRAINT "RefillReminder_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
