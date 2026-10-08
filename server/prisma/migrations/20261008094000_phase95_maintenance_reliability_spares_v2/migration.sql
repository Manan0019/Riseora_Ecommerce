-- Phase 95 · Preventive Maintenance, Reliability & Spare-Parts Control V2
ALTER TYPE "InventoryRole" ADD VALUE IF NOT EXISTS 'SPARE_PART';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'MAINTENANCE_ISSUE';
ALTER TYPE "InventoryMovementSource" ADD VALUE IF NOT EXISTS 'MAINTENANCE';

CREATE TYPE "EquipmentAssetStatus" AS ENUM ('ACTIVE','MAINTENANCE','BREAKDOWN','HOLD','RETIRED');
CREATE TYPE "MaintenanceWorkOrderType" AS ENUM ('PREVENTIVE','CORRECTIVE','INSPECTION','CALIBRATION');
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW','NORMAL','HIGH','CRITICAL');
CREATE TYPE "MaintenanceWorkOrderStatus" AS ENUM ('DRAFT','APPROVED','IN_PROGRESS','COMPLETED','CANCELLED');

CREATE TABLE "EquipmentAsset" (
  "id" UUID NOT NULL,
  "assetCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "workCenterId" UUID NOT NULL,
  "status" "EquipmentAssetStatus" NOT NULL DEFAULT 'ACTIVE',
  "manufacturer" TEXT,
  "modelNumber" TEXT,
  "serialNumber" TEXT,
  "commissionedAt" TIMESTAMP(3),
  "cumulativeRuntimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EquipmentAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EquipmentAsset_assetCode_key" ON "EquipmentAsset"("assetCode");
CREATE UNIQUE INDEX "EquipmentAsset_serialNumber_key" ON "EquipmentAsset"("serialNumber");
CREATE INDEX "EquipmentAsset_workCenterId_status_idx" ON "EquipmentAsset"("workCenterId","status");
ALTER TABLE "EquipmentAsset" ADD CONSTRAINT "EquipmentAsset_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentAsset" ADD CONSTRAINT "EquipmentAsset_runtime_check" CHECK ("cumulativeRuntimeMinutes" >= 0);

ALTER TABLE "ProductionRoutingOperation" ADD COLUMN "equipmentAssetId" UUID;
ALTER TABLE "ProductionOperationExecution" ADD COLUMN "equipmentAssetId" UUID;
ALTER TABLE "ProductionDowntimeEvent" ADD COLUMN "equipmentAssetId" UUID;
ALTER TABLE "ProductionRoutingOperation" ADD CONSTRAINT "ProductionRoutingOperation_equipmentAssetId_fkey" FOREIGN KEY ("equipmentAssetId") REFERENCES "EquipmentAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOperationExecution" ADD CONSTRAINT "ProductionOperationExecution_equipmentAssetId_fkey" FOREIGN KEY ("equipmentAssetId") REFERENCES "EquipmentAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionDowntimeEvent" ADD CONSTRAINT "ProductionDowntimeEvent_equipmentAssetId_fkey" FOREIGN KEY ("equipmentAssetId") REFERENCES "EquipmentAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ProductionOperationExecution_equipmentAssetId_status_actualStartAt_idx" ON "ProductionOperationExecution"("equipmentAssetId","status","actualStartAt");
CREATE INDEX "ProductionDowntimeEvent_equipmentAssetId_startedAt_idx" ON "ProductionDowntimeEvent"("equipmentAssetId","startedAt");

CREATE TABLE "MaintenancePlan" (
  "id" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" "MaintenanceWorkOrderType" NOT NULL DEFAULT 'PREVENTIVE',
  "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
  "intervalDays" INTEGER,
  "intervalRuntimeMinutes" INTEGER,
  "estimatedMinutes" INTEGER NOT NULL DEFAULT 60,
  "instructions" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastCompletedAt" TIMESTAMP(3),
  "lastCompletedRuntimeMinutes" INTEGER,
  "nextDueAt" TIMESTAMP(3),
  "nextDueRuntimeMinutes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MaintenancePlan_assetId_isActive_nextDueAt_idx" ON "MaintenancePlan"("assetId","isActive","nextDueAt");
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "EquipmentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_interval_check" CHECK (("intervalDays" IS NULL OR "intervalDays" > 0) AND ("intervalRuntimeMinutes" IS NULL OR "intervalRuntimeMinutes" > 0) AND "estimatedMinutes" > 0);

CREATE TABLE "MaintenanceWorkOrder" (
  "id" UUID NOT NULL,
  "workOrderNumber" TEXT NOT NULL,
  "assetId" UUID NOT NULL,
  "planId" UUID,
  "sourceDowntimeEventId" UUID,
  "type" "MaintenanceWorkOrderType" NOT NULL,
  "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
  "status" "MaintenanceWorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "scheduledStartAt" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "technician" TEXT,
  "rootCause" TEXT,
  "correctiveAction" TEXT,
  "labourMinutes" INTEGER NOT NULL DEFAULT 0,
  "labourCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "spareCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "createdByUserId" UUID,
  "approvedByUserId" UUID,
  "completedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaintenanceWorkOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MaintenanceWorkOrder_workOrderNumber_key" ON "MaintenanceWorkOrder"("workOrderNumber");
CREATE UNIQUE INDEX "MaintenanceWorkOrder_sourceDowntimeEventId_key" ON "MaintenanceWorkOrder"("sourceDowntimeEventId");
CREATE INDEX "MaintenanceWorkOrder_assetId_status_dueAt_idx" ON "MaintenanceWorkOrder"("assetId","status","dueAt");
CREATE INDEX "MaintenanceWorkOrder_planId_status_idx" ON "MaintenanceWorkOrder"("planId","status");
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "EquipmentAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_sourceDowntimeEventId_fkey" FOREIGN KEY ("sourceDowntimeEventId") REFERENCES "ProductionDowntimeEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_cost_check" CHECK ("labourMinutes" >= 0 AND "labourCost" >= 0 AND "spareCost" >= 0 AND "totalCost" >= 0);

CREATE TABLE "MaintenanceSpareUsage" (
  "id" UUID NOT NULL,
  "workOrderId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCostSnapshot" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedByUserId" UUID,
  CONSTRAINT "MaintenanceSpareUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MaintenanceSpareUsage_workOrderId_issuedAt_idx" ON "MaintenanceSpareUsage"("workOrderId","issuedAt");
CREATE INDEX "MaintenanceSpareUsage_variantId_issuedAt_idx" ON "MaintenanceSpareUsage"("variantId","issuedAt");
ALTER TABLE "MaintenanceSpareUsage" ADD CONSTRAINT "MaintenanceSpareUsage_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "MaintenanceWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceSpareUsage" ADD CONSTRAINT "MaintenanceSpareUsage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceSpareUsage" ADD CONSTRAINT "MaintenanceSpareUsage_qty_cost_check" CHECK ("quantity" > 0 AND "unitCostSnapshot" >= 0 AND "totalCost" >= 0);
