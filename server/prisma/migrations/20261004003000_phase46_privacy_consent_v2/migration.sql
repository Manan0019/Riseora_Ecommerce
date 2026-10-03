-- Phase 46 — consent ledger, marketing preferences and privacy request operations.
CREATE TYPE "ConsentPurpose" AS ENUM ('ANALYTICS', 'NEWSLETTER', 'EMAIL_MARKETING', 'SMS_MARKETING', 'WHATSAPP_MARKETING');
CREATE TYPE "ConsentDecision" AS ENUM ('GRANTED', 'WITHDRAWN');
CREATE TYPE "PrivacyRequestType" AS ENUM ('ERASURE', 'CORRECTION', 'OTHER');
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'CANCELLED');

ALTER TABLE "NewsletterSubscriber" ADD COLUMN "consentVersion" TEXT NOT NULL DEFAULT '2026-10';
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "consentSource" TEXT;
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "unsubscribeToken" UUID;
UPDATE "NewsletterSubscriber" SET "unsubscribeToken" = gen_random_uuid() WHERE "unsubscribeToken" IS NULL;
ALTER TABLE "NewsletterSubscriber" ALTER COLUMN "unsubscribeToken" SET NOT NULL;
CREATE UNIQUE INDEX "NewsletterSubscriber_unsubscribeToken_key" ON "NewsletterSubscriber"("unsubscribeToken");

ALTER TABLE "StoreSetting" ADD COLUMN "privacyPolicyVersion" TEXT NOT NULL DEFAULT '2026-10';

CREATE TABLE "MarketingPreference" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "emailMarketing" BOOLEAN NOT NULL DEFAULT false,
  "smsMarketing" BOOLEAN NOT NULL DEFAULT false,
  "whatsappMarketing" BOOLEAN NOT NULL DEFAULT false,
  "lastSource" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketingPreference_userId_key" ON "MarketingPreference"("userId");
ALTER TABLE "MarketingPreference" ADD CONSTRAINT "MarketingPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConsentEvent" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "email" TEXT,
  "purpose" "ConsentPurpose" NOT NULL,
  "decision" "ConsentDecision" NOT NULL,
  "source" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConsentEvent_userId_createdAt_idx" ON "ConsentEvent"("userId", "createdAt");
CREATE INDEX "ConsentEvent_email_createdAt_idx" ON "ConsentEvent"("email", "createdAt");
CREATE INDEX "ConsentEvent_purpose_decision_createdAt_idx" ON "ConsentEvent"("purpose", "decision", "createdAt");
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PrivacyRequest" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" "PrivacyRequestType" NOT NULL,
  "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'OPEN',
  "message" TEXT,
  "adminNote" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrivacyRequest_userId_createdAt_idx" ON "PrivacyRequest"("userId", "createdAt");
CREATE INDEX "PrivacyRequest_status_requestedAt_idx" ON "PrivacyRequest"("status", "requestedAt");
CREATE INDEX "PrivacyRequest_type_status_requestedAt_idx" ON "PrivacyRequest"("type", "status", "requestedAt");
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing newsletter consent state for registered customers.
INSERT INTO "MarketingPreference" ("id", "userId", "emailMarketing", "smsMarketing", "whatsappMarketing", "lastSource", "createdAt", "updatedAt")
SELECT gen_random_uuid(), u."id", true, false, false, 'phase46-newsletter-backfill', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
JOIN "NewsletterSubscriber" n ON lower(n."email") = lower(u."email")
WHERE n."isActive" = true
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO "ConsentEvent" ("id", "userId", "email", "purpose", "decision", "source", "policyVersion", "createdAt")
SELECT gen_random_uuid(), u."id", n."email", 'NEWSLETTER', 'GRANTED', 'legacy-newsletter-backfill', 'legacy', COALESCE(n."subscribedAt", CURRENT_TIMESTAMP)
FROM "NewsletterSubscriber" n
LEFT JOIN "User" u ON lower(u."email") = lower(n."email")
WHERE n."isActive" = true;

INSERT INTO "ConsentEvent" ("id", "userId", "email", "purpose", "decision", "source", "policyVersion", "createdAt")
SELECT gen_random_uuid(), u."id", n."email", 'EMAIL_MARKETING', 'GRANTED', 'legacy-newsletter-backfill', 'legacy', COALESCE(n."subscribedAt", CURRENT_TIMESTAMP)
FROM "NewsletterSubscriber" n
JOIN "User" u ON lower(u."email") = lower(n."email")
WHERE n."isActive" = true;
