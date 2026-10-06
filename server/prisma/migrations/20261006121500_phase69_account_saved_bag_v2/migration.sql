-- Phase 69: persistent signed-in Saved Bag for cross-device cart continuity.
CREATE TABLE "AccountCart" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "lastMergedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountCart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountCart_userId_key" ON "AccountCart"("userId");
CREATE INDEX "AccountCart_updatedAt_idx" ON "AccountCart"("updatedAt");

ALTER TABLE "AccountCart"
ADD CONSTRAINT "AccountCart_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
