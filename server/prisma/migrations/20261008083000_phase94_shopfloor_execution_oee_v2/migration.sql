-- Phase 94 · Shop-Floor Execution, Downtime & OEE Control V2
CREATE TYPE "ShopFloorExecutionStatus" AS ENUM ('QUEUED','READY','IN_PROGRESS','PAUSED','COMPLETED','SKIPPED');
CREATE TYPE "ProductionDowntimeCategory" AS ENUM ('BREAKDOWN','MATERIAL_SHORTAGE','QUALITY_HOLD','CHANGEOVER','STAFFING','UTILITIES','PLANNED_STOP','OTHER');
CREATE TYPE "ProductionLabourRole" AS ENUM ('OPERATOR','SUPERVISOR','QUALITY','MAINTENANCE','OTHER');

ALTER TABLE "ProductionOrder"
  ADD COLUMN "shopFloorDispatchedAt" TIMESTAMP(3),
  ADD COLUMN "shopFloorDispatchedByUserId" UUID;
CREATE INDEX "ProductionOrder_shopFloorDispatchedAt_status_idx" ON "ProductionOrder"("shopFloorDispatchedAt","status");
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_shopFloorDispatchedByUserId_fkey" FOREIGN KEY ("shopFloorDispatchedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WorkCenterShift" (
  "id" UUID NOT NULL,
  "workCenterId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startMinuteOfDay" INTEGER NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkCenterShift_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkCenterShift_workCenterId_dayOfWeek_name_key" ON "WorkCenterShift"("workCenterId","dayOfWeek","name");
CREATE INDEX "WorkCenterShift_workCenterId_isActive_dayOfWeek_idx" ON "WorkCenterShift"("workCenterId","isActive","dayOfWeek");
ALTER TABLE "WorkCenterShift" ADD CONSTRAINT "WorkCenterShift_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkCenterShift" ADD CONSTRAINT "WorkCenterShift_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkCenterShift" ADD CONSTRAINT "WorkCenterShift_time_check" CHECK ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6 AND "startMinuteOfDay" >= 0 AND "startMinuteOfDay" < 1440 AND "durationMinutes" > 0 AND "durationMinutes" <= 1440 AND "breakMinutes" >= 0 AND "breakMinutes" < "durationMinutes");

CREATE TABLE "ProductionOperationExecution" (
  "id" UUID NOT NULL,
  "productionOrderId" UUID NOT NULL,
  "routingOperationId" UUID,
  "scheduleSlotId" UUID,
  "workCenterId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "operationName" TEXT NOT NULL,
  "status" "ShopFloorExecutionStatus" NOT NULL DEFAULT 'QUEUED',
  "plannedStartAt" TIMESTAMP(3),
  "plannedEndAt" TIMESTAMP(3),
  "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
  "actualStartAt" TIMESTAMP(3),
  "actualEndAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "actualSetupMinutes" INTEGER NOT NULL DEFAULT 0,
  "runtimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "downtimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "goodQty" INTEGER NOT NULL DEFAULT 0,
  "rejectQty" INTEGER NOT NULL DEFAULT 0,
  "reworkQty" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "startedByUserId" UUID,
  "completedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductionOperationExecution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionOperationExecution_scheduleSlotId_key" ON "ProductionOperationExecution"("scheduleSlotId");
CREATE UNIQUE INDEX "ProductionOperationExecution_productionOrderId_sequence_key" ON "ProductionOperationExecution"("productionOrderId","sequence");
CREATE INDEX "ProductionOperationExecution_productionOrderId_status_sequence_idx" ON "ProductionOperationExecution"("productionOrderId","status","sequence");
CREATE INDEX "ProductionOperationExecution_workCenterId_status_plannedStartAt_idx" ON "ProductionOperationExecution"("workCenterId","status","plannedStartAt");
ALTER TABLE "ProductionOperationExecution" ADD CONSTRAINT "ProductionOperationExecution_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionOperationExecution" ADD CONSTRAINT "ProductionOperationExecution_routingOperationId_fkey" FOREIGN KEY ("routingOperationId") REFERENCES "ProductionRoutingOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOperationExecution" ADD CONSTRAINT "ProductionOperationExecution_scheduleSlotId_fkey" FOREIGN KEY ("scheduleSlotId") REFERENCES "ProductionScheduleSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOperationExecution" ADD CONSTRAINT "ProductionOperationExecution_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionOperationExecution" ADD CONSTRAINT "ProductionOperationExecution_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOperationExecution" ADD CONSTRAINT "ProductionOperationExecution_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOperationExecution" ADD CONSTRAINT "ProductionOperationExecution_qty_time_check" CHECK ("sequence" > 0 AND "plannedMinutes" >= 0 AND "actualSetupMinutes" >= 0 AND "runtimeMinutes" >= 0 AND "downtimeMinutes" >= 0 AND "goodQty" >= 0 AND "rejectQty" >= 0 AND "reworkQty" >= 0);

CREATE TABLE "ProductionDowntimeEvent" (
  "id" UUID NOT NULL,
  "executionId" UUID NOT NULL,
  "productionOrderId" UUID NOT NULL,
  "workCenterId" UUID NOT NULL,
  "category" "ProductionDowntimeCategory" NOT NULL,
  "reason" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "minutes" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductionDowntimeEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductionDowntimeEvent_executionId_endedAt_idx" ON "ProductionDowntimeEvent"("executionId","endedAt");
CREATE INDEX "ProductionDowntimeEvent_productionOrderId_startedAt_idx" ON "ProductionDowntimeEvent"("productionOrderId","startedAt");
CREATE INDEX "ProductionDowntimeEvent_workCenterId_startedAt_idx" ON "ProductionDowntimeEvent"("workCenterId","startedAt");
ALTER TABLE "ProductionDowntimeEvent" ADD CONSTRAINT "ProductionDowntimeEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ProductionOperationExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionDowntimeEvent" ADD CONSTRAINT "ProductionDowntimeEvent_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionDowntimeEvent" ADD CONSTRAINT "ProductionDowntimeEvent_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionDowntimeEvent" ADD CONSTRAINT "ProductionDowntimeEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionDowntimeEvent" ADD CONSTRAINT "ProductionDowntimeEvent_minutes_check" CHECK ("minutes" >= 0);

CREATE TABLE "ProductionLabourEntry" (
  "id" UUID NOT NULL,
  "executionId" UUID NOT NULL,
  "productionOrderId" UUID NOT NULL,
  "operatorUserId" UUID,
  "role" "ProductionLabourRole" NOT NULL DEFAULT 'OPERATOR',
  "minutes" INTEGER NOT NULL,
  "hourlyCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "labourCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "note" TEXT,
  "enteredByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductionLabourEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductionLabourEntry_executionId_createdAt_idx" ON "ProductionLabourEntry"("executionId","createdAt");
CREATE INDEX "ProductionLabourEntry_productionOrderId_createdAt_idx" ON "ProductionLabourEntry"("productionOrderId","createdAt");
CREATE INDEX "ProductionLabourEntry_operatorUserId_createdAt_idx" ON "ProductionLabourEntry"("operatorUserId","createdAt");
ALTER TABLE "ProductionLabourEntry" ADD CONSTRAINT "ProductionLabourEntry_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ProductionOperationExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionLabourEntry" ADD CONSTRAINT "ProductionLabourEntry_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionLabourEntry" ADD CONSTRAINT "ProductionLabourEntry_operatorUserId_fkey" FOREIGN KEY ("operatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionLabourEntry" ADD CONSTRAINT "ProductionLabourEntry_enteredByUserId_fkey" FOREIGN KEY ("enteredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionLabourEntry" ADD CONSTRAINT "ProductionLabourEntry_minutes_cost_check" CHECK ("minutes" > 0 AND "hourlyCost" >= 0 AND "labourCost" >= 0);
