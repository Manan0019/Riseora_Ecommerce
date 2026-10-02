-- Phase 27: complete in-app notifications and retention intelligence.
ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS "ctaLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "ctaUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT,
  ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "User_role_isActive_createdAt_idx" ON "User"("role", "isActive", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Order_userId_status_createdAt_idx" ON "Order"("userId", "status", "createdAt" DESC);
