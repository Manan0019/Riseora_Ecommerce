CREATE TYPE "PriceAlertStatus" AS ENUM ('PENDING', 'NOTIFIED', 'CANCELLED');

CREATE TABLE "PriceAlert" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "subscribedPrice" DECIMAL(12,2) NOT NULL,
    "targetPrice" DECIMAL(12,2),
    "status" "PriceAlertStatus" NOT NULL DEFAULT 'PENDING',
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PriceAlert_variantId_email_key" ON "PriceAlert"("variantId", "email");
CREATE INDEX "PriceAlert_status_createdAt_idx" ON "PriceAlert"("status", "createdAt");
CREATE INDEX "PriceAlert_email_idx" ON "PriceAlert"("email");
CREATE INDEX "PriceAlert_variantId_status_idx" ON "PriceAlert"("variantId", "status");

ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_variantId_fkey"
FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
