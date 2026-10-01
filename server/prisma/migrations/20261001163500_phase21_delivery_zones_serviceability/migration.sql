-- Phase 21: delivery-zone serviceability, PIN-specific shipping/COD/ETA and order delivery snapshots.
ALTER TABLE "StoreSetting"
  ADD COLUMN IF NOT EXISTS "requireServiceablePostalCode" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "shippingZoneName" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryEstimate" JSONB;

ALTER TABLE "CheckoutSession"
  ADD COLUMN IF NOT EXISTS "shippingZoneName" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryEstimate" JSONB;

CREATE TABLE IF NOT EXISTS "ShippingZone" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "postalPrefixes" JSONB NOT NULL,
  "city" TEXT,
  "state" TEXT,
  "shippingFee" DECIMAL(12,2),
  "freeShippingThreshold" DECIMAL(12,2),
  "codAllowed" BOOLEAN NOT NULL DEFAULT true,
  "deliveryMinDays" INTEGER,
  "deliveryMaxDays" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShippingZone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShippingZone_isActive_priority_idx" ON "ShippingZone"("isActive", "priority");
