-- Phase 22: visual reviews and moderated customer product questions.
ALTER TABLE "Review"
  ADD COLUMN IF NOT EXISTS "images" JSONB;

CREATE TABLE IF NOT EXISTS "ProductQuestion" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "answeredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductQuestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductQuestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProductQuestion_productId_isPublished_createdAt_idx"
  ON "ProductQuestion"("productId", "isPublished", "createdAt");

CREATE INDEX IF NOT EXISTS "ProductQuestion_userId_createdAt_idx"
  ON "ProductQuestion"("userId", "createdAt");
