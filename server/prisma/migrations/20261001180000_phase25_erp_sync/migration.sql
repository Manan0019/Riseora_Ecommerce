-- Phase 25: ERP synchronization foundation

CREATE TYPE "ErpSyncDirection" AS ENUM ('ERP_TO_ECOMMERCE', 'ECOMMERCE_TO_ERP');
CREATE TYPE "ErpSyncKind" AS ENUM ('CATALOG', 'ORDERS');
CREATE TYPE "ErpSyncStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

ALTER TABLE "Category" ADD COLUMN "erpId" TEXT, ADD COLUMN "erpManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "erpId" TEXT, ADD COLUMN "erpManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductVariant" ADD COLUMN "erpId" TEXT, ADD COLUMN "erpManaged" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Category_erpId_key" ON "Category"("erpId");
CREATE UNIQUE INDEX "Product_erpId_key" ON "Product"("erpId");
CREATE UNIQUE INDEX "ProductVariant_erpId_key" ON "ProductVariant"("erpId");

CREATE TABLE "ErpSyncState" (
    "id" TEXT NOT NULL DEFAULT 'primary',
    "lastCatalogSyncAt" TIMESTAMP(3),
    "lastCatalogSyncId" TEXT,
    "lastOrderPullAt" TIMESTAMP(3),
    "lastOrderAckAt" TIMESTAMP(3),
    "lastAcknowledgedCursor" TEXT,
    "lastClientId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ErpSyncState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ErpSyncLog" (
    "id" UUID NOT NULL,
    "direction" "ErpSyncDirection" NOT NULL,
    "kind" "ErpSyncKind" NOT NULL,
    "status" "ErpSyncStatus" NOT NULL,
    "syncId" TEXT,
    "clientId" TEXT,
    "receivedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErpSyncLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ErpSyncLog_syncId_key" ON "ErpSyncLog"("syncId");
CREATE INDEX "ErpSyncLog_kind_createdAt_idx" ON "ErpSyncLog"("kind", "createdAt");
CREATE INDEX "ErpSyncLog_status_createdAt_idx" ON "ErpSyncLog"("status", "createdAt");
