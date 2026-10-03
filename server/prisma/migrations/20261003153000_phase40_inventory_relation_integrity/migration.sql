-- Phase 40 — repair InventoryMovement actor relation omitted by Phase 39 schema.
-- Phase 39 already created actorUserId, so this migration only repairs referential integrity.

UPDATE "InventoryMovement" AS movement
SET "actorUserId" = NULL
WHERE "actorUserId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" AS app_user WHERE app_user."id" = movement."actorUserId");

ALTER TABLE "InventoryMovement"
ADD CONSTRAINT "InventoryMovement_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
