-- Phase 37 — Support Operations & Communications V2
CREATE TYPE "SupportTicketCategory" AS ENUM ('GENERAL', 'ORDER', 'PAYMENT', 'DELIVERY', 'RETURN_REFUND', 'PRODUCT', 'ACCOUNT', 'REWARDS');
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "SupportMessageSender" AS ENUM ('CUSTOMER', 'ADMIN', 'SYSTEM');
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('SENT', 'FAILED');

ALTER TYPE "ContactMessageStatus" ADD VALUE IF NOT EXISTS 'WAITING_CUSTOMER';
ALTER TYPE "ContactMessageStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUPPORT';

ALTER TABLE "ContactMessage"
  ADD COLUMN "ticketNumber" TEXT,
  ADD COLUMN "userId" UUID,
  ADD COLUMN "category" "SupportTicketCategory" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "orderNumber" TEXT,
  ADD COLUMN "assignedAdminUserId" UUID,
  ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "resolvedAt" TIMESTAMP(3);

UPDATE "ContactMessage"
SET "ticketNumber" = 'SUP-' || UPPER(REPLACE("id"::text, '-', '')),
    "lastActivityAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "ticketNumber" IS NULL;

ALTER TABLE "ContactMessage" ALTER COLUMN "ticketNumber" SET NOT NULL;
ALTER TABLE "ContactMessage"
  ADD CONSTRAINT "ContactMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ContactMessage_ticketNumber_key" ON "ContactMessage"("ticketNumber");
CREATE INDEX "ContactMessage_status_priority_lastActivityAt_idx" ON "ContactMessage"("status", "priority", "lastActivityAt");
CREATE INDEX "ContactMessage_category_status_lastActivityAt_idx" ON "ContactMessage"("category", "status", "lastActivityAt");
CREATE INDEX "ContactMessage_userId_lastActivityAt_idx" ON "ContactMessage"("userId", "lastActivityAt");
CREATE INDEX "ContactMessage_assignedAdminUserId_status_idx" ON "ContactMessage"("assignedAdminUserId", "status");
CREATE INDEX "ContactMessage_orderNumber_idx" ON "ContactMessage"("orderNumber");

CREATE TABLE "SupportMessage" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "sender" "SupportMessageSender" NOT NULL,
  "authorUserId" UUID,
  "message" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SupportMessage"
  ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ContactMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");
CREATE INDEX "SupportMessage_authorUserId_createdAt_idx" ON "SupportMessage"("authorUserId", "createdAt");

-- Preserve every existing contact message as the first support-thread message.
INSERT INTO "SupportMessage" ("id", "ticketId", "sender", "message", "isInternal", "createdAt")
SELECT gen_random_uuid(), "id", 'CUSTOMER'::"SupportMessageSender", "message", false, "createdAt"
FROM "ContactMessage";

CREATE TABLE "EmailDeliveryLog" (
  "id" UUID NOT NULL,
  "toEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "status" "EmailDeliveryStatus" NOT NULL,
  "idempotencyKey" TEXT,
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailDeliveryLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailDeliveryLog_status_createdAt_idx" ON "EmailDeliveryLog"("status", "createdAt");
CREATE INDEX "EmailDeliveryLog_template_createdAt_idx" ON "EmailDeliveryLog"("template", "createdAt");
CREATE INDEX "EmailDeliveryLog_toEmail_createdAt_idx" ON "EmailDeliveryLog"("toEmail", "createdAt");
