-- Phase 84: Customer Care Case Management & Service Operations V2
CREATE TYPE "SupportEscalationLevel" AS ENUM ('NONE', 'L1', 'L2', 'MANAGEMENT');
CREATE TYPE "SupportResolutionCode" AS ENUM (
  'INFORMATION_PROVIDED',
  'ORDER_CORRECTED',
  'PAYMENT_RESOLVED',
  'DELIVERY_RESOLVED',
  'RETURN_RESOLVED',
  'REPLACEMENT_RESOLVED',
  'ACCOUNT_RESOLVED',
  'GOODWILL_RESOLUTION',
  'NO_ACTION_REQUIRED',
  'DUPLICATE',
  'OTHER'
);

ALTER TABLE "ContactMessage"
  ADD COLUMN "returnRequestId" UUID,
  ADD COLUMN "resolvedByUserId" UUID,
  ADD COLUMN "escalationLevel" "SupportEscalationLevel" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "resolutionCode" "SupportResolutionCode",
  ADD COLUMN "resolutionSummary" TEXT,
  ADD COLUMN "slaDueAt" TIMESTAMP(3),
  ADD COLUMN "firstResponseAt" TIMESTAMP(3),
  ADD COLUMN "lastCustomerReplyAt" TIMESTAMP(3),
  ADD COLUMN "lastAdminReplyAt" TIMESTAMP(3),
  ADD COLUMN "escalatedAt" TIMESTAMP(3),
  ADD COLUMN "reopenedAt" TIMESTAMP(3),
  ADD COLUMN "satisfactionScore" INTEGER,
  ADD COLUMN "satisfactionComment" TEXT,
  ADD COLUMN "satisfactionSubmittedAt" TIMESTAMP(3);

ALTER TABLE "ContactMessage"
  ADD CONSTRAINT "ContactMessage_returnRequestId_fkey"
  FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ContactMessage_returnRequestId_status_idx"
  ON "ContactMessage"("returnRequestId", "status");
CREATE INDEX "ContactMessage_slaDueAt_status_idx"
  ON "ContactMessage"("slaDueAt", "status");
CREATE INDEX "ContactMessage_escalationLevel_status_idx"
  ON "ContactMessage"("escalationLevel", "status");

ALTER TABLE "ContactMessage"
  ADD CONSTRAINT "ContactMessage_satisfactionScore_check"
  CHECK ("satisfactionScore" IS NULL OR ("satisfactionScore" BETWEEN 1 AND 5));
