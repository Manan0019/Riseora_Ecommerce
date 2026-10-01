-- Phase 25 migration recovery
-- ShippingZone may not exist when older migrations are replayed.
-- Safe guard for environments with partial migration history.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ShippingZone') THEN
    ALTER TABLE "ShippingZone" ALTER COLUMN "updatedAt" DROP DEFAULT;
  END IF;
END $$;
