-- Phase 91 · Quality Assurance, Supplier Compliance & Batch Release V2
CREATE TYPE "QualityBatchStatus" AS ENUM ('PENDING','SAMPLING','UNDER_REVIEW','RELEASED','CONDITIONAL_RELEASE','FAILED');
CREATE TYPE "QualityInspectionStatus" AS ENUM ('DRAFT','SAMPLING','UNDER_REVIEW','APPROVED','REJECTED','CLOSED');
CREATE TYPE "QualityDisposition" AS ENUM ('RELEASE','CONDITIONAL_RELEASE','HOLD','RETURN_TO_SUPPLIER','DESTROY');
CREATE TYPE "QualityTestResult" AS ENUM ('PASS','WARN','FAIL','NOT_TESTED');
CREATE TYPE "QualitySeverity" AS ENUM ('MINOR','MAJOR','CRITICAL');
CREATE TYPE "QualityIncidentStatus" AS ENUM ('OPEN','INVESTIGATING','CLOSED');
CREATE TYPE "QualityIncidentType" AS ENUM ('RECEIPT_REJECTION','QA_FAILURE','COST_VARIANCE','RECALL','CUSTOMER_QUALITY','EXPIRY_NONCOMPLIANCE','DOCUMENTATION');
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'QA_RELEASE';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'QA_REJECT';
ALTER TYPE "InventoryMovementSource" ADD VALUE IF NOT EXISTS 'QUALITY';
ALTER TYPE "InventoryBatchMovementType" ADD VALUE IF NOT EXISTS 'QA_HOLD';
ALTER TYPE "InventoryBatchMovementType" ADD VALUE IF NOT EXISTS 'QA_RELEASE';
ALTER TYPE "InventoryBatchMovementType" ADD VALUE IF NOT EXISTS 'QA_REJECT';
ALTER TABLE "InventoryBatch" ADD COLUMN "qualityStatus" "QualityBatchStatus" NOT NULL DEFAULT 'RELEASED';

CREATE TABLE "QualitySpecification" (
  "id" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sampleQty" INTEGER NOT NULL DEFAULT 1,
  "coaRequired" BOOLEAN NOT NULL DEFAULT false,
  "labReportRequired" BOOLEAN NOT NULL DEFAULT false,
  "minShelfLifeDays" INTEGER NOT NULL DEFAULT 90,
  "checks" JSONB NOT NULL,
  "notes" TEXT,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QualitySpecification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QualitySpecification_variantId_key" ON "QualitySpecification"("variantId");
CREATE INDEX "QualitySpecification_isActive_updatedAt_idx" ON "QualitySpecification"("isActive","updatedAt");
ALTER TABLE "QualitySpecification" ADD CONSTRAINT "QualitySpecification_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualitySpecification" ADD CONSTRAINT "QualitySpecification_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "QualityInspection" (
  "id" UUID NOT NULL,
  "inspectionNumber" TEXT NOT NULL,
  "batchId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "goodsReceiptItemId" UUID,
  "supplierId" UUID,
  "status" "QualityInspectionStatus" NOT NULL DEFAULT 'DRAFT',
  "disposition" "QualityDisposition" NOT NULL DEFAULT 'HOLD',
  "severity" "QualitySeverity" NOT NULL DEFAULT 'MINOR',
  "sampleQty" INTEGER NOT NULL DEFAULT 1,
  "coaNumber" TEXT,
  "coaUrl" TEXT,
  "labReportUrl" TEXT,
  "manufactureDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdByUserId" UUID,
  "reviewedByUserId" UUID,
  "sampledAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QualityInspection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QualityInspection_inspectionNumber_key" ON "QualityInspection"("inspectionNumber");
CREATE INDEX "QualityInspection_batchId_createdAt_idx" ON "QualityInspection"("batchId","createdAt");
CREATE INDEX "QualityInspection_supplierId_status_createdAt_idx" ON "QualityInspection"("supplierId","status","createdAt");
CREATE INDEX "QualityInspection_variantId_status_createdAt_idx" ON "QualityInspection"("variantId","status","createdAt");
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_goodsReceiptItemId_fkey" FOREIGN KEY ("goodsReceiptItemId") REFERENCES "GoodsReceiptItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "QualityInspectionTest" (
  "id" UUID NOT NULL,
  "inspectionId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "specification" TEXT,
  "measuredValue" TEXT,
  "unit" TEXT,
  "result" "QualityTestResult" NOT NULL DEFAULT 'NOT_TESTED',
  "critical" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QualityInspectionTest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QualityInspectionTest_inspectionId_code_key" ON "QualityInspectionTest"("inspectionId","code");
CREATE INDEX "QualityInspectionTest_inspectionId_result_idx" ON "QualityInspectionTest"("inspectionId","result");
ALTER TABLE "QualityInspectionTest" ADD CONSTRAINT "QualityInspectionTest_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QualityInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SupplierQualityIncident" (
  "id" UUID NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "supplierId" UUID NOT NULL,
  "batchId" UUID,
  "inspectionId" UUID,
  "type" "QualityIncidentType" NOT NULL,
  "severity" "QualitySeverity" NOT NULL DEFAULT 'MINOR',
  "status" "QualityIncidentStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "closedByUserId" UUID,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierQualityIncident_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierQualityIncident_sourceKey_key" ON "SupplierQualityIncident"("sourceKey");
CREATE INDEX "SupplierQualityIncident_supplierId_status_createdAt_idx" ON "SupplierQualityIncident"("supplierId","status","createdAt");
CREATE INDEX "SupplierQualityIncident_batchId_createdAt_idx" ON "SupplierQualityIncident"("batchId","createdAt");
CREATE INDEX "SupplierQualityIncident_inspectionId_idx" ON "SupplierQualityIncident"("inspectionId");
ALTER TABLE "SupplierQualityIncident" ADD CONSTRAINT "SupplierQualityIncident_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierQualityIncident" ADD CONSTRAINT "SupplierQualityIncident_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierQualityIncident" ADD CONSTRAINT "SupplierQualityIncident_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QualityInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierQualityIncident" ADD CONSTRAINT "SupplierQualityIncident_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
