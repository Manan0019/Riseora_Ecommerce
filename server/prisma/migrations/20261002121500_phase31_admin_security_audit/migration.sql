DO $$ BEGIN
  CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'OPERATIONS', 'CATALOG', 'MARKETING', 'SUPPORT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminRole" "AdminRole";
UPDATE "User" SET "adminRole" = 'OWNER' WHERE "role" = 'ADMIN' AND "adminRole" IS NULL;

CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
  "id" UUID NOT NULL,
  "actorUserId" UUID,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "durationMs" INTEGER,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "AdminAuditLog_actorUserId_createdAt_idx" ON "AdminAuditLog"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_statusCode_createdAt_idx" ON "AdminAuditLog"("statusCode", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
