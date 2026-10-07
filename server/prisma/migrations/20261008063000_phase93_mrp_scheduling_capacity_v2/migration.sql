-- Phase 93 · MRP, Production Scheduling & Capacity Control V2
CREATE TYPE "WorkCenterStatus" AS ENUM ('ACTIVE','HOLD','INACTIVE');
CREATE TYPE "ProductionRoutingStatus" AS ENUM ('DRAFT','ACTIVE','ARCHIVED');
CREATE TYPE "MrpPlanStatus" AS ENUM ('DRAFT','APPROVED','CONVERTED','ARCHIVED');
CREATE TYPE "MrpSupplyAction" AS ENUM ('MAKE','BUY','NONE');
CREATE TYPE "ProductionScheduleStatus" AS ENUM ('DRAFT','PUBLISHED','LOCKED','ARCHIVED');
CREATE TYPE "ProductionScheduleSlotStatus" AS ENUM ('PLANNED','RELEASED','IN_PROGRESS','COMPLETED','CANCELLED');

ALTER TABLE "ProductionOrder" ADD COLUMN "mrpPlanItemId" UUID, ADD COLUMN "routingId" UUID, ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 50;
CREATE UNIQUE INDEX "ProductionOrder_mrpPlanItemId_key" ON "ProductionOrder"("mrpPlanItemId");
CREATE INDEX "ProductionOrder_routingId_status_dueAt_idx" ON "ProductionOrder"("routingId","status","dueAt");
CREATE INDEX "ProductionOrder_priority_dueAt_idx" ON "ProductionOrder"("priority","dueAt");
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_priority_check" CHECK ("priority" >= 1 AND "priority" <= 100);

CREATE TABLE "WorkCenter" (
  "id" UUID NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "warehouseId" UUID NOT NULL,
  "status" "WorkCenterStatus" NOT NULL DEFAULT 'ACTIVE', "dailyCapacityMinutes" INTEGER NOT NULL DEFAULT 480,
  "defaultSetupMinutes" INTEGER NOT NULL DEFAULT 15, "efficiencyPercent" DECIMAL(6,2) NOT NULL DEFAULT 100,
  "notes" TEXT, "createdByUserId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkCenter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkCenter_code_key" ON "WorkCenter"("code");
CREATE INDEX "WorkCenter_warehouseId_status_idx" ON "WorkCenter"("warehouseId","status");
ALTER TABLE "WorkCenter" ADD CONSTRAINT "WorkCenter_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkCenter" ADD CONSTRAINT "WorkCenter_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkCenter" ADD CONSTRAINT "WorkCenter_capacity_check" CHECK ("dailyCapacityMinutes" > 0 AND "defaultSetupMinutes" >= 0 AND "efficiencyPercent" > 0 AND "efficiencyPercent" <= 200);

CREATE TABLE "ProductionRouting" (
  "id" UUID NOT NULL, "routingCode" TEXT NOT NULL, "name" TEXT NOT NULL, "outputVariantId" UUID NOT NULL, "warehouseId" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, "status" "ProductionRoutingStatus" NOT NULL DEFAULT 'DRAFT', "notes" TEXT,
  "createdByUserId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductionRouting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionRouting_routingCode_key" ON "ProductionRouting"("routingCode");
CREATE UNIQUE INDEX "ProductionRouting_outputVariantId_warehouseId_version_key" ON "ProductionRouting"("outputVariantId","warehouseId","version");
CREATE INDEX "ProductionRouting_status_outputVariantId_warehouseId_idx" ON "ProductionRouting"("status","outputVariantId","warehouseId");
ALTER TABLE "ProductionRouting" ADD CONSTRAINT "ProductionRouting_outputVariantId_fkey" FOREIGN KEY ("outputVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionRouting" ADD CONSTRAINT "ProductionRouting_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionRouting" ADD CONSTRAINT "ProductionRouting_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProductionRoutingOperation" (
  "id" UUID NOT NULL, "routingId" UUID NOT NULL, "workCenterId" UUID NOT NULL, "sequence" INTEGER NOT NULL, "name" TEXT NOT NULL,
  "setupMinutes" INTEGER NOT NULL DEFAULT 0, "runMinutesPerUnit" DECIMAL(10,4) NOT NULL DEFAULT 0, "queueMinutes" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductionRoutingOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionRoutingOperation_routingId_sequence_key" ON "ProductionRoutingOperation"("routingId","sequence");
CREATE INDEX "ProductionRoutingOperation_workCenterId_routingId_idx" ON "ProductionRoutingOperation"("workCenterId","routingId");
ALTER TABLE "ProductionRoutingOperation" ADD CONSTRAINT "ProductionRoutingOperation_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "ProductionRouting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionRoutingOperation" ADD CONSTRAINT "ProductionRoutingOperation_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionRoutingOperation" ADD CONSTRAINT "ProductionRoutingOperation_time_check" CHECK ("sequence" > 0 AND "setupMinutes" >= 0 AND "runMinutesPerUnit" >= 0 AND "queueMinutes" >= 0);

CREATE TABLE "MrpPlan" (
  "id" UUID NOT NULL, "planNumber" TEXT NOT NULL, "name" TEXT NOT NULL, "warehouseId" UUID NOT NULL, "demandPlanId" UUID,
  "status" "MrpPlanStatus" NOT NULL DEFAULT 'DRAFT', "horizonStart" TIMESTAMP(3) NOT NULL, "horizonEnd" TIMESTAMP(3) NOT NULL,
  "itemCount" INTEGER NOT NULL DEFAULT 0, "makeUnits" INTEGER NOT NULL DEFAULT 0, "buyUnits" INTEGER NOT NULL DEFAULT 0, "shortageCount" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT, "generatedByUserId" UUID, "approvedByUserId" UUID, "approvedAt" TIMESTAMP(3), "productionConvertedAt" TIMESTAMP(3), "procurementConvertedAt" TIMESTAMP(3), "convertedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "MrpPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MrpPlan_planNumber_key" ON "MrpPlan"("planNumber");
CREATE INDEX "MrpPlan_warehouseId_status_createdAt_idx" ON "MrpPlan"("warehouseId","status","createdAt");
CREATE INDEX "MrpPlan_demandPlanId_status_idx" ON "MrpPlan"("demandPlanId","status");
ALTER TABLE "MrpPlan" ADD CONSTRAINT "MrpPlan_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MrpPlan" ADD CONSTRAINT "MrpPlan_demandPlanId_fkey" FOREIGN KEY ("demandPlanId") REFERENCES "DemandPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MrpPlan" ADD CONSTRAINT "MrpPlan_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MrpPlan" ADD CONSTRAINT "MrpPlan_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MrpPlan" ADD CONSTRAINT "MrpPlan_horizon_check" CHECK ("horizonEnd" >= "horizonStart" AND "itemCount" >= 0 AND "makeUnits" >= 0 AND "buyUnits" >= 0 AND "shortageCount" >= 0);

CREATE TABLE "MrpPlanItem" (
  "id" UUID NOT NULL, "planId" UUID NOT NULL, "variantId" UUID NOT NULL, "inventoryRole" "InventoryRole" NOT NULL, "supplyAction" "MrpSupplyAction" NOT NULL,
  "grossRequirementQty" INTEGER NOT NULL, "availableStockQty" INTEGER NOT NULL, "safetyStockQty" INTEGER NOT NULL, "scheduledReceiptQty" INTEGER NOT NULL,
  "netRequirementQty" INTEGER NOT NULL, "plannedSupplyQty" INTEGER NOT NULL, "requiredBy" TIMESTAMP(3) NOT NULL, "bomId" UUID, "sourceReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "MrpPlanItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MrpPlanItem_planId_variantId_key" ON "MrpPlanItem"("planId","variantId");
CREATE INDEX "MrpPlanItem_planId_supplyAction_idx" ON "MrpPlanItem"("planId","supplyAction");
CREATE INDEX "MrpPlanItem_variantId_requiredBy_idx" ON "MrpPlanItem"("variantId","requiredBy");
ALTER TABLE "MrpPlanItem" ADD CONSTRAINT "MrpPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MrpPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MrpPlanItem" ADD CONSTRAINT "MrpPlanItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MrpPlanItem" ADD CONSTRAINT "MrpPlanItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "ManufacturingBom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MrpPlanItem" ADD CONSTRAINT "MrpPlanItem_qty_check" CHECK ("grossRequirementQty" >= 0 AND "availableStockQty" >= 0 AND "safetyStockQty" >= 0 AND "scheduledReceiptQty" >= 0 AND "netRequirementQty" >= 0 AND "plannedSupplyQty" >= 0);


ALTER TABLE "PurchaseOrderItem" ADD COLUMN "mrpPlanItemId" UUID;
CREATE INDEX "PurchaseOrderItem_mrpPlanItemId_idx" ON "PurchaseOrderItem"("mrpPlanItemId");
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_mrpPlanItemId_fkey" FOREIGN KEY ("mrpPlanItemId") REFERENCES "MrpPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProductionSchedule" (
  "id" UUID NOT NULL, "scheduleNumber" TEXT NOT NULL, "name" TEXT NOT NULL, "warehouseId" UUID NOT NULL, "status" "ProductionScheduleStatus" NOT NULL DEFAULT 'DRAFT',
  "horizonStart" TIMESTAMP(3) NOT NULL, "horizonEnd" TIMESTAMP(3) NOT NULL, "totalMinutes" INTEGER NOT NULL DEFAULT 0, "lateRiskCount" INTEGER NOT NULL DEFAULT 0, "overloadCount" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" UUID, "publishedByUserId" UUID, "publishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductionSchedule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionSchedule_scheduleNumber_key" ON "ProductionSchedule"("scheduleNumber");
CREATE INDEX "ProductionSchedule_warehouseId_status_horizonStart_idx" ON "ProductionSchedule"("warehouseId","status","horizonStart");
ALTER TABLE "ProductionSchedule" ADD CONSTRAINT "ProductionSchedule_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionSchedule" ADD CONSTRAINT "ProductionSchedule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionSchedule" ADD CONSTRAINT "ProductionSchedule_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionSchedule" ADD CONSTRAINT "ProductionSchedule_horizon_check" CHECK ("horizonEnd" >= "horizonStart" AND "totalMinutes" >= 0 AND "lateRiskCount" >= 0 AND "overloadCount" >= 0);

CREATE TABLE "ProductionScheduleSlot" (
  "id" UUID NOT NULL, "scheduleId" UUID NOT NULL, "productionOrderId" UUID NOT NULL, "workCenterId" UUID NOT NULL, "routingOperationId" UUID,
  "sequence" INTEGER NOT NULL, "operationName" TEXT NOT NULL, "plannedStartAt" TIMESTAMP(3) NOT NULL, "plannedEndAt" TIMESTAMP(3) NOT NULL, "plannedMinutes" INTEGER NOT NULL,
  "status" "ProductionScheduleSlotStatus" NOT NULL DEFAULT 'PLANNED', "lateRisk" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ProductionScheduleSlot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionScheduleSlot_scheduleId_productionOrderId_sequence_key" ON "ProductionScheduleSlot"("scheduleId","productionOrderId","sequence");
CREATE INDEX "ProductionScheduleSlot_workCenterId_plannedStartAt_plannedEndAt_idx" ON "ProductionScheduleSlot"("workCenterId","plannedStartAt","plannedEndAt");
CREATE INDEX "ProductionScheduleSlot_productionOrderId_sequence_idx" ON "ProductionScheduleSlot"("productionOrderId","sequence");
ALTER TABLE "ProductionScheduleSlot" ADD CONSTRAINT "ProductionScheduleSlot_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ProductionSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionScheduleSlot" ADD CONSTRAINT "ProductionScheduleSlot_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionScheduleSlot" ADD CONSTRAINT "ProductionScheduleSlot_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionScheduleSlot" ADD CONSTRAINT "ProductionScheduleSlot_routingOperationId_fkey" FOREIGN KEY ("routingOperationId") REFERENCES "ProductionRoutingOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionScheduleSlot" ADD CONSTRAINT "ProductionScheduleSlot_time_check" CHECK ("sequence" > 0 AND "plannedMinutes" > 0 AND "plannedEndAt" > "plannedStartAt");

ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_mrpPlanItemId_fkey" FOREIGN KEY ("mrpPlanItemId") REFERENCES "MrpPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "ProductionRouting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
