DO $$ BEGIN
  CREATE TYPE "PaymentReconciliationStatus" AS ENUM ('UNCHECKED', 'MATCHED', 'REVIEW_REQUIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "StoreSetting"
  ADD COLUMN IF NOT EXISTS "pan" TEXT,
  ADD COLUMN IF NOT EXISTS "creditNotePrefix" TEXT NOT NULL DEFAULT 'RCN',
  ADD COLUMN IF NOT EXISTS "creditNoteNextNumber" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "sellerPan" TEXT,
  ADD COLUMN IF NOT EXISTS "placeOfSupply" TEXT;

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "collectionReference" TEXT,
  ADD COLUMN IF NOT EXISTS "reconciliationStatus" "PaymentReconciliationStatus" NOT NULL DEFAULT 'UNCHECKED',
  ADD COLUMN IF NOT EXISTS "reconciledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reconciliationNote" TEXT;

CREATE TABLE IF NOT EXISTS "CreditNote" (
  "id" UUID NOT NULL,
  "creditNoteNumber" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invoiceId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "returnRequestId" UUID,
  "reason" TEXT,
  "taxableTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "cgstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "sgstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "igstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "grandTotal" DECIMAL(12,2) NOT NULL,
  "lines" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_creditNoteNumber_key" ON "CreditNote"("creditNoteNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_sourceKey_key" ON "CreditNote"("sourceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_returnRequestId_key" ON "CreditNote"("returnRequestId");
CREATE INDEX IF NOT EXISTS "CreditNote_invoiceId_issuedAt_idx" ON "CreditNote"("invoiceId", "issuedAt");
CREATE INDEX IF NOT EXISTS "CreditNote_orderId_issuedAt_idx" ON "CreditNote"("orderId", "issuedAt");
CREATE INDEX IF NOT EXISTS "CreditNote_issuedAt_idx" ON "CreditNote"("issuedAt");

DO $$ BEGIN
  ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
