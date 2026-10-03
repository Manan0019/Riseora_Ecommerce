-- Phase 39 — Inventory Control & Availability V2

CREATE TYPE "InventoryMovementType" AS ENUM (
  'OPENING_STOCK',
  'ADMIN_ADJUSTMENT',
  'ORDER_RESERVATION',
  'ORDER_RELEASE',
  'ORDER_CANCELLATION',
  'RETURN_RESTOCK',
  'REFUND_RESTOCK',
  'ERP_SYNC',
  'CORRECTION'
);

CREATE TYPE "InventoryMovementSource" AS ENUM (
  'ADMIN',
  'CHECKOUT',
  'ORDER',
  'RETURN',
  'ERP',
  'SYSTEM'
);

ALTER TABLE "ProductVariant"
ADD COLUMN "safetyStock" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "InventoryMovement" (
  "id" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "type" "InventoryMovementType" NOT NULL,
  "source" "InventoryMovementSource" NOT NULL,
  "quantityChange" INTEGER NOT NULL,
  "stockBefore" INTEGER NOT NULL,
  "stockAfter" INTEGER NOT NULL,
  "safetyStockSnapshot" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "actorUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InventoryMovement"
ADD CONSTRAINT "InventoryMovement_variantId_fkey"
FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "InventoryMovement_variantId_createdAt_idx" ON "InventoryMovement"("variantId", "createdAt");
CREATE INDEX "InventoryMovement_type_createdAt_idx" ON "InventoryMovement"("type", "createdAt");
CREATE INDEX "InventoryMovement_referenceType_referenceId_idx" ON "InventoryMovement"("referenceType", "referenceId");
CREATE INDEX "InventoryMovement_actorUserId_createdAt_idx" ON "InventoryMovement"("actorUserId", "createdAt");
CREATE INDEX "ProductVariant_safetyStock_idx" ON "ProductVariant"("safetyStock");

-- Establish an auditable opening balance for existing stock without changing stock itself.
INSERT INTO "InventoryMovement" (
  "id", "variantId", "type", "source", "quantityChange", "stockBefore", "stockAfter", "safetyStockSnapshot", "reason", "referenceType", "referenceId", "createdAt"
)
SELECT
  gen_random_uuid(),
  "id",
  'OPENING_STOCK'::"InventoryMovementType",
  'SYSTEM'::"InventoryMovementSource",
  "stockQuantity",
  0,
  "stockQuantity",
  0,
  'Phase 39 opening inventory balance',
  'MIGRATION',
  'phase39',
  CURRENT_TIMESTAMP
FROM "ProductVariant"
WHERE "stockQuantity" <> 0;
