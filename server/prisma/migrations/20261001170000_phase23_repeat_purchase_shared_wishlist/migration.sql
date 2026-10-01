CREATE TABLE IF NOT EXISTS "WishlistShare" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "title" TEXT,
    "productIds" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WishlistShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WishlistShare_token_key" ON "WishlistShare"("token");
CREATE INDEX IF NOT EXISTS "WishlistShare_expiresAt_idx" ON "WishlistShare"("expiresAt");
