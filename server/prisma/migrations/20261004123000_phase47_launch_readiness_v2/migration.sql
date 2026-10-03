ALTER TABLE "StoreSetting"
  ADD COLUMN "maintenanceEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maintenanceMessage" TEXT,
  ADD COLUMN "maintenanceStartsAt" TIMESTAMP(3),
  ADD COLUMN "maintenanceEndsAt" TIMESTAMP(3);
