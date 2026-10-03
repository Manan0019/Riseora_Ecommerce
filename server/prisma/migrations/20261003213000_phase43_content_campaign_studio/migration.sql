-- Phase 43: content/campaign studio and media library
CREATE TYPE "MediaAssetKind" AS ENUM ('PRODUCT', 'BRAND', 'CAMPAIGN', 'CATEGORY');

ALTER TABLE "Banner" ADD COLUMN "imageAlt" TEXT;

CREATE TABLE "Campaign" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "eyebrow" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "body" TEXT,
  "heroImageUrl" TEXT,
  "mobileHeroImageUrl" TEXT,
  "heroAlt" TEXT,
  "ctaText" TEXT,
  "ctaLink" TEXT,
  "secondaryCtaText" TEXT,
  "secondaryCtaLink" TEXT,
  "theme" TEXT NOT NULL DEFAULT 'HERBAL',
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignProduct" (
  "campaignId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CampaignProduct_pkey" PRIMARY KEY ("campaignId", "productId")
);

CREATE TABLE "MediaAsset" (
  "id" UUID NOT NULL,
  "kind" "MediaAssetKind" NOT NULL,
  "url" TEXT NOT NULL,
  "publicId" TEXT,
  "originalName" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "altText" TEXT,
  "storage" TEXT NOT NULL DEFAULT 'local',
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");
CREATE INDEX "Campaign_isPublished_startsAt_endsAt_idx" ON "Campaign"("isPublished", "startsAt", "endsAt");
CREATE INDEX "Campaign_isFeatured_priority_idx" ON "Campaign"("isFeatured", "priority");
CREATE INDEX "CampaignProduct_productId_idx" ON "CampaignProduct"("productId");
CREATE UNIQUE INDEX "MediaAsset_url_key" ON "MediaAsset"("url");
CREATE INDEX "MediaAsset_kind_isArchived_createdAt_idx" ON "MediaAsset"("kind", "isArchived", "createdAt");

ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
