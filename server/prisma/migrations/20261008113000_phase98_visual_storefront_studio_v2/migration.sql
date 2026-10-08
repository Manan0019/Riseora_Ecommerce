-- Phase 98: draft/published document separation and immutable publication history.
-- No existing orders, products, stock, payments, content or migrations are modified.
CREATE TABLE "StorefrontExperience" (
  "id" TEXT NOT NULL DEFAULT 'primary',
  "draft" JSONB NOT NULL,
  "published" JSONB,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "publishedRevision" INTEGER NOT NULL DEFAULT 0,
  "updatedByUserId" UUID,
  "publishedByUserId" UUID,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorefrontExperience_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StorefrontExperience_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "StorefrontExperience_publication_check" CHECK ("publishedRevision" >= 0)
);
CREATE TABLE "StorefrontExperiencePublication" (
  "id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "actorUserId" UUID,
  "action" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorefrontExperiencePublication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StorefrontExperiencePublication_revision_key" ON "StorefrontExperiencePublication"("revision");
CREATE INDEX "StorefrontExperiencePublication_publishedAt_idx" ON "StorefrontExperiencePublication"("publishedAt");
