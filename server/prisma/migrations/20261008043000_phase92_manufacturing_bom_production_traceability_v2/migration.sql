-- Phase 92 · Manufacturing BOM, Production Control & Traceability V2
CREATE TYPE "InventoryRole" AS ENUM ('FINISHED_GOOD','RAW_MATERIAL','PACKAGING','CONSUMABLE');
CREATE TYPE "ManufacturingBomStatus" AS ENUM ('DRAFT','ACTIVE','ARCHIVED');
CREATE TYPE "ProductionOrderStatus" AS ENUM ('DRAFT','APPROVED','MATERIAL_ISSUED','IN_PRODUCTION','QA_PENDING','RELEASED','QA_REJECTED','CANCELLED');
CREATE TYPE "ProductionVarianceStatus" AS ENUM ('ON_TARGET','YIELD_VARIANCE','MATERIAL_VARIANCE','COST_VARIANCE','MULTIPLE_VARIANCE');

ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'PRODUCTION_ISSUE';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'PRODUCTION_RETURN';
ALTER TYPE "InventoryMovementSource" ADD VALUE IF NOT EXISTS 'MANUFACTURING';
ALTER TYPE "InventoryBatchMovementType" ADD VALUE IF NOT EXISTS 'PRODUCTION_ISSUE';
ALTER TYPE "InventoryBatchMovementType" ADD VALUE IF NOT EXISTS 'PRODUCTION_RETURN';
ALTER TYPE "InventoryBatchMovementType" ADD VALUE IF NOT EXISTS 'PRODUCTION_OUTPUT';
ALTER TYPE "InventoryBatchMovementType" ADD VALUE IF NOT EXISTS 'PRODUCTION_WASTE';

ALTER TABLE "ProductVariant" ADD COLUMN "inventoryRole" "InventoryRole" NOT NULL DEFAULT 'FINISHED_GOOD';

CREATE TABLE "ManufacturingBom" (
  "id" UUID NOT NULL,
  "bomCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "outputVariantId" UUID NOT NULL,
  "outputQuantity" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "ManufacturingBomStatus" NOT NULL DEFAULT 'DRAFT',
  "yieldTolerancePercent" DECIMAL(6,2) NOT NULL DEFAULT 5,
  "notes" TEXT,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManufacturingBom_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ManufacturingBom_bomCode_key" ON "ManufacturingBom"("bomCode");
CREATE UNIQUE INDEX "ManufacturingBom_outputVariantId_version_key" ON "ManufacturingBom"("outputVariantId","version");
CREATE INDEX "ManufacturingBom_status_outputVariantId_idx" ON "ManufacturingBom"("status","outputVariantId");
ALTER TABLE "ManufacturingBom" ADD CONSTRAINT "ManufacturingBom_outputVariantId_fkey" FOREIGN KEY ("outputVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingBom" ADD CONSTRAINT "ManufacturingBom_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManufacturingBom" ADD CONSTRAINT "ManufacturingBom_output_qty_check" CHECK ("outputQuantity" > 0 AND "version" > 0 AND "yieldTolerancePercent" >= 0 AND "yieldTolerancePercent" <= 100);

CREATE TABLE "ManufacturingBomItem" (
  "id" UUID NOT NULL,
  "bomId" UUID NOT NULL,
  "componentVariantId" UUID NOT NULL,
  "quantityPerRun" INTEGER NOT NULL,
  "wastagePercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "isCritical" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManufacturingBomItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ManufacturingBomItem_bomId_componentVariantId_key" ON "ManufacturingBomItem"("bomId","componentVariantId");
CREATE INDEX "ManufacturingBomItem_componentVariantId_bomId_idx" ON "ManufacturingBomItem"("componentVariantId","bomId");
ALTER TABLE "ManufacturingBomItem" ADD CONSTRAINT "ManufacturingBomItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "ManufacturingBom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingBomItem" ADD CONSTRAINT "ManufacturingBomItem_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingBomItem" ADD CONSTRAINT "ManufacturingBomItem_qty_check" CHECK ("quantityPerRun" > 0 AND "wastagePercent" >= 0 AND "wastagePercent" <= 100);

CREATE TABLE "ProductionOrder" (
  "id" UUID NOT NULL,
  "productionNumber" TEXT NOT NULL,
  "bomId" UUID NOT NULL,
  "outputVariantId" UUID NOT NULL,
  "warehouseId" UUID NOT NULL,
  "status" "ProductionOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "plannedRuns" INTEGER NOT NULL DEFAULT 1,
  "plannedOutputQty" INTEGER NOT NULL,
  "actualOutputQty" INTEGER,
  "plannedMaterialCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "actualMaterialCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "labourCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "overheadCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalProductionCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "unitProductionCost" DECIMAL(14,4),
  "yieldVariancePercent" DECIMAL(8,2),
  "varianceStatus" "ProductionVarianceStatus" NOT NULL DEFAULT 'ON_TARGET',
  "plannedStartAt" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "outputBatchCode" TEXT,
  "outputBatchId" UUID,
  "expiryDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdByUserId" UUID,
  "approvedByUserId" UUID,
  "startedByUserId" UUID,
  "completedByUserId" UUID,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionOrder_productionNumber_key" ON "ProductionOrder"("productionNumber");
CREATE UNIQUE INDEX "ProductionOrder_outputBatchId_key" ON "ProductionOrder"("outputBatchId");
CREATE INDEX "ProductionOrder_status_dueAt_idx" ON "ProductionOrder"("status","dueAt");
CREATE INDEX "ProductionOrder_warehouseId_status_createdAt_idx" ON "ProductionOrder"("warehouseId","status","createdAt");
CREATE INDEX "ProductionOrder_outputVariantId_createdAt_idx" ON "ProductionOrder"("outputVariantId","createdAt");
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "ManufacturingBom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_outputVariantId_fkey" FOREIGN KEY ("outputVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_outputBatchId_fkey" FOREIGN KEY ("outputBatchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_qty_check" CHECK ("plannedRuns" > 0 AND "plannedOutputQty" > 0 AND ("actualOutputQty" IS NULL OR "actualOutputQty" >= 0));
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_cost_check" CHECK ("plannedMaterialCost" >= 0 AND "actualMaterialCost" >= 0 AND "labourCost" >= 0 AND "overheadCost" >= 0 AND "totalProductionCost" >= 0);

CREATE TABLE "ProductionOrderMaterial" (
  "id" UUID NOT NULL,
  "productionOrderId" UUID NOT NULL,
  "componentVariantId" UUID NOT NULL,
  "plannedQty" INTEGER NOT NULL,
  "issuedQty" INTEGER NOT NULL DEFAULT 0,
  "consumedQty" INTEGER NOT NULL DEFAULT 0,
  "returnedQty" INTEGER NOT NULL DEFAULT 0,
  "wasteQty" INTEGER NOT NULL DEFAULT 0,
  "unitCostSnapshot" DECIMAL(14,4),
  "actualCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductionOrderMaterial_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionOrderMaterial_productionOrderId_componentVariantId_key" ON "ProductionOrderMaterial"("productionOrderId","componentVariantId");
CREATE INDEX "ProductionOrderMaterial_componentVariantId_productionOrderId_idx" ON "ProductionOrderMaterial"("componentVariantId","productionOrderId");
ALTER TABLE "ProductionOrderMaterial" ADD CONSTRAINT "ProductionOrderMaterial_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionOrderMaterial" ADD CONSTRAINT "ProductionOrderMaterial_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionOrderMaterial" ADD CONSTRAINT "ProductionOrderMaterial_qty_check" CHECK ("plannedQty" > 0 AND "issuedQty" >= 0 AND "consumedQty" >= 0 AND "returnedQty" >= 0 AND "wasteQty" >= 0 AND "actualCost" >= 0);

CREATE TABLE "ProductionMaterialAllocation" (
  "id" UUID NOT NULL,
  "materialLineId" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "quantityIssued" INTEGER NOT NULL,
  "quantityConsumed" INTEGER NOT NULL DEFAULT 0,
  "quantityReturned" INTEGER NOT NULL DEFAULT 0,
  "unitCostSnapshot" DECIMAL(14,4),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductionMaterialAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionMaterialAllocation_materialLineId_batchId_key" ON "ProductionMaterialAllocation"("materialLineId","batchId");
CREATE INDEX "ProductionMaterialAllocation_batchId_materialLineId_idx" ON "ProductionMaterialAllocation"("batchId","materialLineId");
ALTER TABLE "ProductionMaterialAllocation" ADD CONSTRAINT "ProductionMaterialAllocation_materialLineId_fkey" FOREIGN KEY ("materialLineId") REFERENCES "ProductionOrderMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionMaterialAllocation" ADD CONSTRAINT "ProductionMaterialAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionMaterialAllocation" ADD CONSTRAINT "ProductionMaterialAllocation_qty_check" CHECK ("quantityIssued" > 0 AND "quantityConsumed" >= 0 AND "quantityReturned" >= 0 AND ("quantityConsumed" + "quantityReturned") <= "quantityIssued");
