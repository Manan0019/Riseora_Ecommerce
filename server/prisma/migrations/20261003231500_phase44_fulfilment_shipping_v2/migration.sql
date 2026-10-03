-- Phase 44: fulfilment SLA + shipping rules V2
ALTER TABLE "Order" ADD COLUMN "dispatchDueAt" TIMESTAMP(3);
CREATE INDEX "Order_status_dispatchDueAt_idx" ON "Order"("status", "dispatchDueAt");

ALTER TABLE "ShippingZone"
  ADD COLUMN "codFee" DECIMAL(12,2),
  ADD COLUMN "codMaxOrderAmount" DECIMAL(12,2),
  ADD COLUMN "dispatchWithinDays" INTEGER,
  ADD COLUMN "maxWeightGrams" INTEGER,
  ADD COLUMN "preferredShippingPartnerId" UUID;

ALTER TABLE "ShippingPartner"
  ADD COLUMN "supportsCod" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "maxWeightGrams" INTEGER;

ALTER TABLE "Shipment" ADD COLUMN "shippingPartnerId" UUID;

CREATE INDEX "ShippingZone_preferredShippingPartnerId_idx" ON "ShippingZone"("preferredShippingPartnerId");
CREATE INDEX "Shipment_shippingPartnerId_idx" ON "Shipment"("shippingPartnerId");

ALTER TABLE "ShippingZone"
  ADD CONSTRAINT "ShippingZone_preferredShippingPartnerId_fkey"
  FOREIGN KEY ("preferredShippingPartnerId") REFERENCES "ShippingPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Shipment"
  ADD CONSTRAINT "Shipment_shippingPartnerId_fkey"
  FOREIGN KEY ("shippingPartnerId") REFERENCES "ShippingPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
