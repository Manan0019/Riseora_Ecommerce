-- Phase 90 · Warehouse, Batch, Expiry, Cycle Count & Recall Control V2
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE','HOLD','INACTIVE');
CREATE TYPE "WarehouseBinKind" AS ENUM ('PICK','BULK','QUARANTINE','RETURNS');
CREATE TYPE "InventoryBatchStatus" AS ENUM ('AVAILABLE','QUARANTINED','RECALLED','EXPIRED','DEPLETED');
CREATE TYPE "InventoryBatchMovementType" AS ENUM ('RECEIPT','RESERVATION','RELEASE','SHIPMENT','RETURN_RESTOCK','ADJUSTMENT','QUARANTINE','RELEASE_QUARANTINE','WRITE_OFF','CYCLE_COUNT','RECALL','EXPIRY_HOLD');
CREATE TYPE "CycleCountStatus" AS ENUM ('DRAFT','REVIEW_REQUIRED','APPROVED','POSTED','CANCELLED');
CREATE TYPE "InventoryRecallStatus" AS ENUM ('DRAFT','ACTIVE','COMPLETED','CANCELLED');
ALTER TYPE "InventoryMovementType" ADD VALUE 'WAREHOUSE_QUARANTINE';
ALTER TYPE "InventoryMovementType" ADD VALUE 'WAREHOUSE_RELEASE';
ALTER TYPE "InventoryMovementType" ADD VALUE 'WAREHOUSE_WRITE_OFF';
ALTER TYPE "InventoryMovementType" ADD VALUE 'WAREHOUSE_COUNT_ADJUSTMENT';
ALTER TYPE "InventoryMovementSource" ADD VALUE 'WAREHOUSE';

CREATE TABLE "Warehouse" (
  "id" UUID NOT NULL,"code" TEXT NOT NULL,"name" TEXT NOT NULL,"status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',"isDefault" BOOLEAN NOT NULL DEFAULT false,"addressLine1" TEXT,"city" TEXT,"state" TEXT,"postalCode" TEXT,"notes" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");
CREATE INDEX "Warehouse_status_isDefault_idx" ON "Warehouse"("status","isDefault");

CREATE TABLE "WarehouseBin" (
  "id" UUID NOT NULL,"warehouseId" UUID NOT NULL,"code" TEXT NOT NULL,"name" TEXT NOT NULL,"kind" "WarehouseBinKind" NOT NULL DEFAULT 'PICK',"isActive" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WarehouseBin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WarehouseBin_warehouseId_code_key" ON "WarehouseBin"("warehouseId","code");
CREATE INDEX "WarehouseBin_warehouseId_kind_isActive_idx" ON "WarehouseBin"("warehouseId","kind","isActive");

CREATE TABLE "InventoryBatch" (
  "id" UUID NOT NULL,"variantId" UUID NOT NULL,"warehouseId" UUID NOT NULL,"binId" UUID,"goodsReceiptItemId" UUID,"batchCode" TEXT NOT NULL,"status" "InventoryBatchStatus" NOT NULL DEFAULT 'AVAILABLE',"quantityOnHand" INTEGER NOT NULL DEFAULT 0,"quantityReserved" INTEGER NOT NULL DEFAULT 0,"quantityBlocked" INTEGER NOT NULL DEFAULT 0,"unitCost" DECIMAL(14,2),"manufacturedAt" TIMESTAMP(3),"expiryDate" TIMESTAMP(3),"receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"sourceType" TEXT,"sourceReference" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryBatch_goodsReceiptItemId_key" ON "InventoryBatch"("goodsReceiptItemId");
CREATE UNIQUE INDEX "InventoryBatch_warehouseId_variantId_batchCode_key" ON "InventoryBatch"("warehouseId","variantId","batchCode");
CREATE INDEX "InventoryBatch_variantId_status_expiryDate_idx" ON "InventoryBatch"("variantId","status","expiryDate");
CREATE INDEX "InventoryBatch_warehouseId_binId_status_idx" ON "InventoryBatch"("warehouseId","binId","status");

CREATE TABLE "InventoryBatchMovement" (
  "id" UUID NOT NULL,"batchId" UUID NOT NULL,"variantId" UUID NOT NULL,"type" "InventoryBatchMovementType" NOT NULL,"onHandChange" INTEGER NOT NULL DEFAULT 0,"reservedChange" INTEGER NOT NULL DEFAULT 0,"blockedChange" INTEGER NOT NULL DEFAULT 0,"onHandAfter" INTEGER NOT NULL,"reservedAfter" INTEGER NOT NULL,"blockedAfter" INTEGER NOT NULL,"referenceType" TEXT,"referenceId" TEXT,"note" TEXT,"actorUserId" UUID,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryBatchMovement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InventoryBatchMovement_batchId_createdAt_idx" ON "InventoryBatchMovement"("batchId","createdAt");
CREATE INDEX "InventoryBatchMovement_variantId_type_createdAt_idx" ON "InventoryBatchMovement"("variantId","type","createdAt");
CREATE INDEX "InventoryBatchMovement_referenceType_referenceId_variantId_idx" ON "InventoryBatchMovement"("referenceType","referenceId","variantId");

CREATE TABLE "OrderBatchAllocation" (
  "id" UUID NOT NULL,"orderId" UUID NOT NULL,"variantId" UUID NOT NULL,"batchId" UUID NOT NULL,"quantity" INTEGER NOT NULL,"shippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderBatchAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrderBatchAllocation_orderId_variantId_batchId_key" ON "OrderBatchAllocation"("orderId","variantId","batchId");
CREATE INDEX "OrderBatchAllocation_batchId_shippedAt_idx" ON "OrderBatchAllocation"("batchId","shippedAt");
CREATE INDEX "OrderBatchAllocation_orderId_variantId_idx" ON "OrderBatchAllocation"("orderId","variantId");

CREATE TABLE "CycleCount" (
  "id" UUID NOT NULL,"countNumber" TEXT NOT NULL,"warehouseId" UUID NOT NULL,"status" "CycleCountStatus" NOT NULL DEFAULT 'DRAFT',"notes" TEXT,"createdByUserId" UUID,"approvedByUserId" UUID,"postedByUserId" UUID,"approvedAt" TIMESTAMP(3),"postedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CycleCount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CycleCount_countNumber_key" ON "CycleCount"("countNumber");
CREATE INDEX "CycleCount_warehouseId_status_createdAt_idx" ON "CycleCount"("warehouseId","status","createdAt");

CREATE TABLE "CycleCountItem" (
  "id" UUID NOT NULL,"cycleCountId" UUID NOT NULL,"batchId" UUID NOT NULL,"variantId" UUID NOT NULL,"systemQty" INTEGER NOT NULL,"countedQty" INTEGER,"varianceQty" INTEGER NOT NULL DEFAULT 0,"reason" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CycleCountItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CycleCountItem_cycleCountId_batchId_key" ON "CycleCountItem"("cycleCountId","batchId");
CREATE INDEX "CycleCountItem_variantId_cycleCountId_idx" ON "CycleCountItem"("variantId","cycleCountId");

CREATE TABLE "InventoryRecall" (
  "id" UUID NOT NULL,"recallNumber" TEXT NOT NULL,"status" "InventoryRecallStatus" NOT NULL DEFAULT 'DRAFT',"reason" TEXT NOT NULL,"customerMessage" TEXT,"noticePublishedAt" TIMESTAMP(3),"createdByUserId" UUID,"activatedByUserId" UUID,"completedByUserId" UUID,"activatedAt" TIMESTAMP(3),"completedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryRecall_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryRecall_recallNumber_key" ON "InventoryRecall"("recallNumber");
CREATE INDEX "InventoryRecall_status_createdAt_idx" ON "InventoryRecall"("status","createdAt");

CREATE TABLE "InventoryRecallBatch" (
  "id" UUID NOT NULL,"recallId" UUID NOT NULL,"batchId" UUID NOT NULL,"quantityAtRecall" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryRecallBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryRecallBatch_recallId_batchId_key" ON "InventoryRecallBatch"("recallId","batchId");
CREATE INDEX "InventoryRecallBatch_batchId_recallId_idx" ON "InventoryRecallBatch"("batchId","recallId");

ALTER TABLE "WarehouseBin" ADD CONSTRAINT "WarehouseBin_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_binId_fkey" FOREIGN KEY ("binId") REFERENCES "WarehouseBin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_goodsReceiptItemId_fkey" FOREIGN KEY ("goodsReceiptItemId") REFERENCES "GoodsReceiptItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryBatchMovement" ADD CONSTRAINT "InventoryBatchMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatchMovement" ADD CONSTRAINT "InventoryBatchMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatchMovement" ADD CONSTRAINT "InventoryBatchMovement_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderBatchAllocation" ADD CONSTRAINT "OrderBatchAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderBatchAllocation" ADD CONSTRAINT "OrderBatchAllocation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderBatchAllocation" ADD CONSTRAINT "OrderBatchAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CycleCount" ADD CONSTRAINT "CycleCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CycleCount" ADD CONSTRAINT "CycleCount_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CycleCount" ADD CONSTRAINT "CycleCount_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CycleCount" ADD CONSTRAINT "CycleCount_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CycleCountItem" ADD CONSTRAINT "CycleCountItem_cycleCountId_fkey" FOREIGN KEY ("cycleCountId") REFERENCES "CycleCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CycleCountItem" ADD CONSTRAINT "CycleCountItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CycleCountItem" ADD CONSTRAINT "CycleCountItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryRecall" ADD CONSTRAINT "InventoryRecall_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryRecall" ADD CONSTRAINT "InventoryRecall_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryRecall" ADD CONSTRAINT "InventoryRecall_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryRecallBatch" ADD CONSTRAINT "InventoryRecallBatch_recallId_fkey" FOREIGN KEY ("recallId") REFERENCES "InventoryRecall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryRecallBatch" ADD CONSTRAINT "InventoryRecallBatch_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_qty_check" CHECK ("quantityOnHand" >= 0 AND "quantityReserved" >= 0 AND "quantityBlocked" >= 0 AND ("quantityReserved" + "quantityBlocked") <= "quantityOnHand");
ALTER TABLE "OrderBatchAllocation" ADD CONSTRAINT "OrderBatchAllocation_qty_check" CHECK ("quantity" > 0);
ALTER TABLE "CycleCountItem" ADD CONSTRAINT "CycleCountItem_qty_check" CHECK ("systemQty" >= 0 AND ("countedQty" IS NULL OR "countedQty" >= 0));

-- Seed one operational warehouse/bin without inventing stock movements.
INSERT INTO "Warehouse" ("id","code","name","status","isDefault","createdAt","updatedAt")
VALUES ('00000000-0000-4000-8000-000000000090','MAIN','Main Warehouse','ACTIVE',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "WarehouseBin" ("id","warehouseId","code","name","kind","isActive","createdAt","updatedAt")
SELECT '00000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000090','PICK-01','Primary Pick Bin','PICK',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Warehouse" WHERE "id"='00000000-0000-4000-8000-000000000090')
ON CONFLICT ("warehouseId","code") DO NOTHING;
INSERT INTO "WarehouseBin" ("id","warehouseId","code","name","kind","isActive","createdAt","updatedAt")
SELECT '00000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000090','QUAR-01','Quarantine Bin','QUARANTINE',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Warehouse" WHERE "id"='00000000-0000-4000-8000-000000000090')
ON CONFLICT ("warehouseId","code") DO NOTHING;

-- Existing aggregate sellable stock becomes one traceable legacy batch per SKU.
INSERT INTO "InventoryBatch" ("id","variantId","warehouseId","binId","batchCode","status","quantityOnHand","quantityReserved","quantityBlocked","unitCost","receivedAt","sourceType","sourceReference","createdAt","updatedAt")
SELECT md5(v."id"::text || ':phase90:legacy')::uuid,v."id",'00000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000091',
       'LEGACY-' || upper(substr(replace(v."id"::text,'-',''),1,12)),'AVAILABLE',v."stockQuantity",0,0,v."costPrice",CURRENT_TIMESTAMP,'LEGACY','PHASE90_BACKFILL',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "ProductVariant" v
WHERE v."stockQuantity" > 0
ON CONFLICT ("warehouseId","variantId","batchCode") DO NOTHING;
