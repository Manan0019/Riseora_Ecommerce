ALTER TABLE "Order" ADD COLUMN "checkoutRequestKey" TEXT;
ALTER TABLE "CheckoutSession" ADD COLUMN "checkoutRequestKey" TEXT;
ALTER TABLE "CheckoutSession" ADD COLUMN "paymentAttemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CheckoutSession" ADD COLUMN "lastPaymentStatus" TEXT;
ALTER TABLE "CheckoutSession" ADD COLUMN "lastPaymentError" TEXT;
ALTER TABLE "CheckoutSession" ADD COLUMN "lastPaymentActivityAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Order_checkoutRequestKey_key" ON "Order"("checkoutRequestKey");
CREATE UNIQUE INDEX "CheckoutSession_checkoutRequestKey_key" ON "CheckoutSession"("checkoutRequestKey");
CREATE INDEX "CheckoutSession_status_createdAt_idx" ON "CheckoutSession"("status", "createdAt");
