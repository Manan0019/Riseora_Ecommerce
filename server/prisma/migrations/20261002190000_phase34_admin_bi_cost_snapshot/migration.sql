-- Phase 34 — Business intelligence cost snapshots.
-- Existing orders are backfilled from the CURRENT variant cost where available.
-- Future orders persist the cost at checkout time so later cost-price edits do not rewrite margin history.
ALTER TABLE "OrderItem" ADD COLUMN "unitCost" DECIMAL(12,2);

UPDATE "OrderItem" AS oi
SET "unitCost" = pv."costPrice"
FROM "ProductVariant" AS pv
WHERE oi."variantId" = pv."id"
  AND pv."costPrice" IS NOT NULL;

CREATE INDEX "OrderItem_unitCost_idx" ON "OrderItem"("unitCost");
