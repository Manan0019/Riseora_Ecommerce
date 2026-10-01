-- Phase 19: rich campaign typography, reusable suitability values and advanced coupon controls.
DO $$ BEGIN
  CREATE TYPE "CouponScope" AS ENUM ('ORDER', 'PRODUCT', 'CATEGORY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CouponApplication" AS ENUM ('ORDER_TOTAL', 'ELIGIBLE_ITEMS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Coupon"
  ADD COLUMN IF NOT EXISTS "scope" "CouponScope" NOT NULL DEFAULT 'ORDER',
  ADD COLUMN IF NOT EXISTS "application" "CouponApplication" NOT NULL DEFAULT 'ORDER_TOTAL',
  ADD COLUMN IF NOT EXISTS "perCustomerUsageLimit" INTEGER DEFAULT 1;

ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "Banner"
  ADD COLUMN IF NOT EXISTS "titleFontFamily" TEXT,
  ADD COLUMN IF NOT EXISTS "titleFontWeight" INTEGER NOT NULL DEFAULT 900,
  ADD COLUMN IF NOT EXISTS "titleFontStyle" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "titleTextAlign" TEXT NOT NULL DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS "titleSize" TEXT NOT NULL DEFAULT 'XL',
  ADD COLUMN IF NOT EXISTS "descriptionFontFamily" TEXT,
  ADD COLUMN IF NOT EXISTS "descriptionTextAlign" TEXT NOT NULL DEFAULT 'left';

CREATE TABLE IF NOT EXISTS "SuitabilityOption" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SuitabilityOption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SuitabilityOption_name_key" ON "SuitabilityOption"("name");
CREATE INDEX IF NOT EXISTS "SuitabilityOption_isActive_sortOrder_idx" ON "SuitabilityOption"("isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "CouponProduct" (
  "couponId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  CONSTRAINT "CouponProduct_pkey" PRIMARY KEY ("couponId", "productId")
);
CREATE INDEX IF NOT EXISTS "CouponProduct_productId_idx" ON "CouponProduct"("productId");

CREATE TABLE IF NOT EXISTS "CouponCategory" (
  "couponId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  CONSTRAINT "CouponCategory_pkey" PRIMARY KEY ("couponId", "categoryId")
);
CREATE INDEX IF NOT EXISTS "CouponCategory_categoryId_idx" ON "CouponCategory"("categoryId");

CREATE TABLE IF NOT EXISTS "CouponRedemption" (
  "id" UUID NOT NULL,
  "couponId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "userId" UUID,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CouponRedemption_orderId_key" ON "CouponRedemption"("orderId");
CREATE INDEX IF NOT EXISTS "CouponRedemption_couponId_userId_idx" ON "CouponRedemption"("couponId", "userId");
CREATE INDEX IF NOT EXISTS "CouponRedemption_couponId_customerEmail_idx" ON "CouponRedemption"("couponId", "customerEmail");
CREATE INDEX IF NOT EXISTS "CouponRedemption_couponId_customerPhone_idx" ON "CouponRedemption"("couponId", "customerPhone");

DO $$ BEGIN
  ALTER TABLE "CouponProduct" ADD CONSTRAINT "CouponProduct_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CouponProduct" ADD CONSTRAINT "CouponProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CouponCategory" ADD CONSTRAINT "CouponCategory_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CouponCategory" ADD CONSTRAINT "CouponCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "SuitabilityOption" ("id", "name", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), valueset.name, valueset.sort_order, CURRENT_TIMESTAMP
FROM (VALUES ('Men', 10), ('Women', 20), ('Unisex', 30), ('All', 40)) AS valueset(name, sort_order)
ON CONFLICT ("name") DO NOTHING;
