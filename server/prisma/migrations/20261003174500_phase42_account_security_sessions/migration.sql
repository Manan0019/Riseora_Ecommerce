-- Phase 42 — account security, session management and security history.
CREATE TYPE "AuthSecurityEventType" AS ENUM (
  'ACCOUNT_CREATED',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGIN_BLOCKED',
  'LOGOUT',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'SESSION_REVOKED',
  'SESSIONS_REVOKED',
  'DATA_EXPORT'
);

ALTER TABLE "User" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastPasswordChangedAt" TIMESTAMP(3);

CREATE TABLE "AuthSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenVersion" INTEGER NOT NULL,
  "deviceLabel" TEXT,
  "userAgent" TEXT,
  "ipHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" TEXT,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthSession_userId_revokedAt_lastSeenAt_idx" ON "AuthSession"("userId", "revokedAt", "lastSeenAt");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AuthSecurityEvent" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "type" "AuthSecurityEventType" NOT NULL,
  "sessionId" UUID,
  "identityHash" TEXT,
  "deviceLabel" TEXT,
  "userAgent" TEXT,
  "ipHash" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthSecurityEvent_userId_createdAt_idx" ON "AuthSecurityEvent"("userId", "createdAt");
CREATE INDEX "AuthSecurityEvent_type_createdAt_idx" ON "AuthSecurityEvent"("type", "createdAt");
CREATE INDEX "AuthSecurityEvent_identityHash_createdAt_idx" ON "AuthSecurityEvent"("identityHash", "createdAt");
ALTER TABLE "AuthSecurityEvent" ADD CONSTRAINT "AuthSecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
