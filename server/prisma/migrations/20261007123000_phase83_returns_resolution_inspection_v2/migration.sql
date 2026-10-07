-- Phase 83: Returns Resolution, Inspection & Replacement Operations V2

ALTER TYPE "ReturnStatus" ADD VALUE IF NOT EXISTS 'RESOLUTION_PENDING';
ALTER TYPE "ReturnStatus" ADD VALUE IF NOT EXISTS 'REPLACEMENT_PENDING';
ALTER TYPE "ReturnStatus" ADD VALUE IF NOT EXISTS 'REPLACEMENT_SHIPPED';
ALTER TYPE "ReturnStatus" ADD VALUE IF NOT EXISTS 'REPLACED';

CREATE TYPE "ReturnResolution" AS ENUM ('REFUND', 'REPLACEMENT');
CREATE TYPE "ReturnPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "ReturnInspectionGrade" AS ENUM ('SEALED', 'RESELLABLE', 'OPENED', 'DAMAGED', 'DEFECTIVE', 'WRONG_ITEM', 'UNSAFE');

ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'RETURN_REPLACEMENT';

ALTER TABLE "ReturnRequest"
  ADD COLUMN "preferredResolution" "ReturnResolution" NOT NULL DEFAULT 'REFUND',
  ADD COLUMN "approvedResolution" "ReturnResolution",
  ADD COLUMN "priority" "ReturnPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "slaDueAt" TIMESTAMP(3),
  ADD COLUMN "approvedRefundAmount" DECIMAL(12,2),
  ADD COLUMN "refundAdjustmentReason" TEXT,
  ADD COLUMN "replacementCarrier" TEXT,
  ADD COLUMN "replacementTrackingNumber" TEXT,
  ADD COLUMN "replacementTrackingUrl" TEXT,
  ADD COLUMN "inspectionCompletedAt" TIMESTAMP(3),
  ADD COLUMN "replacementShippedAt" TIMESTAMP(3),
  ADD COLUMN "replacementDeliveredAt" TIMESTAMP(3),
  ADD COLUMN "resolutionCompletedAt" TIMESTAMP(3);

ALTER TABLE "ReturnRequestItem"
  ADD COLUMN "replacementVariantId" UUID,
  ADD COLUMN "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "restockQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "quarantineQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "writeOffQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "inspectionGrade" "ReturnInspectionGrade",
  ADD COLUMN "inspectionNote" TEXT;

CREATE INDEX "ReturnRequest_priority_slaDueAt_idx" ON "ReturnRequest"("priority", "slaDueAt");
CREATE INDEX "ReturnRequest_approvedResolution_status_idx" ON "ReturnRequest"("approvedResolution", "status");
CREATE INDEX "ReturnRequestItem_replacementVariantId_idx" ON "ReturnRequestItem"("replacementVariantId");
