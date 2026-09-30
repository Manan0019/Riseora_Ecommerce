-- CreateEnum
CREATE TYPE "CartRecoveryStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'DISMISSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StockAlertStatus" AS ENUM ('PENDING', 'NOTIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MerchandisingDealType" AS ENUM ('BUNDLE_DISCOUNT', 'BUY_X_GET_Y', 'GIFT_WITH_PURCHASE');

-- AlterTable
ALTER TABLE "CheckoutSession" ADD COLUMN     "automaticDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "automaticPromotionName" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "automaticDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "automaticPromotionName" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "isComplimentary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promotionLabel" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "benefits" TEXT,
ADD COLUMN     "faq" JSONB,
ADD COLUMN     "howToUse" TEXT,
ADD COLUMN     "ingredients" TEXT,
ADD COLUMN     "suitableFor" TEXT;

-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "isApproved" SET DEFAULT false;

-- AlterTable
ALTER TABLE "StoreSetting" ADD COLUMN     "logoAlt" TEXT,
ADD COLUMN     "logoMarkUrl" TEXT,
ADD COLUMN     "logoUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchandisingDeal" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "MerchandisingDealType" NOT NULL,
    "description" TEXT,
    "badge" TEXT,
    "imageUrl" TEXT,
    "discountPercent" DECIMAL(5,2),
    "bundleItems" JSONB,
    "buyVariantId" UUID,
    "giftVariantId" UUID,
    "buyQuantity" INTEGER NOT NULL DEFAULT 1,
    "giftQuantity" INTEGER NOT NULL DEFAULT 1,
    "minOrderAmount" DECIMAL(12,2),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchandisingDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartRecoverySession" (
    "id" UUID NOT NULL,
    "cartToken" TEXT NOT NULL,
    "userId" UUID,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "recoveryOptIn" BOOLEAN NOT NULL DEFAULT false,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "status" "CartRecoveryStatus" NOT NULL DEFAULT 'ACTIVE',
    "orderNumber" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartRecoverySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAlert" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" "StockAlertStatus" NOT NULL DEFAULT 'PENDING',
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchandisingDeal_slug_key" ON "MerchandisingDeal"("slug");

-- CreateIndex
CREATE INDEX "MerchandisingDeal_isActive_priority_idx" ON "MerchandisingDeal"("isActive", "priority");

-- CreateIndex
CREATE INDEX "MerchandisingDeal_startsAt_endsAt_idx" ON "MerchandisingDeal"("startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CartRecoverySession_cartToken_key" ON "CartRecoverySession"("cartToken");

-- CreateIndex
CREATE INDEX "CartRecoverySession_status_lastSeenAt_idx" ON "CartRecoverySession"("status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "CartRecoverySession_email_idx" ON "CartRecoverySession"("email");

-- CreateIndex
CREATE INDEX "CartRecoverySession_userId_idx" ON "CartRecoverySession"("userId");

-- CreateIndex
CREATE INDEX "StockAlert_status_createdAt_idx" ON "StockAlert"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StockAlert_email_idx" ON "StockAlert"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StockAlert_variantId_email_key" ON "StockAlert"("variantId", "email");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
