-- Riseora E-Commerce Phase 18 database repair
-- Safe/idempotent repair for Phase 17 + Phase 18 columns that are present
-- in schema.prisma but missing from an existing PostgreSQL database.

ALTER TABLE "StoreSetting"
  ADD COLUMN IF NOT EXISTS "dispatchWithinDays" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "deliveryMinDays" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "deliveryMaxDays" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS "lowStockUrgencyThreshold" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "Category"
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "maxPurchaseQuantity" INTEGER;
