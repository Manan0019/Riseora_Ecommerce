/*
  Warnings:

  - A unique constraint covering the columns `[refundId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('HOME_HERO', 'HOME_STRIP');

-- CreateEnum
CREATE TYPE "CheckoutSessionStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PICKUP_PENDING', 'IN_TRANSIT', 'RECEIVED', 'REFUNDING', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('ORIGINAL_PAYMENT', 'BANK_TRANSFER', 'UPI', 'STORE_CREDIT', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDING';
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hsnCode" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refundId" TEXT,
ADD COLUMN     "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "badge" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hsnCode" TEXT;

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutSession" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "couponCode" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "shippingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "items" JSONB NOT NULL,
    "status" "CheckoutSessionStatus" NOT NULL DEFAULT 'PENDING',
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "stockReserved" BOOLEAN NOT NULL DEFAULT false,
    "orderId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSetting" (
    "id" TEXT NOT NULL DEFAULT 'primary',
    "storeName" TEXT NOT NULL DEFAULT 'Riseora Herbals',
    "legalName" TEXT,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "gstin" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'RISE',
    "invoiceNextNumber" INTEGER NOT NULL DEFAULT 1,
    "freeShippingThreshold" DECIMAL(12,2),
    "flatShippingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "codFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "returnsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "returnWindowDays" INTEGER NOT NULL DEFAULT 7,
    "returnPolicy" TEXT,
    "shippingPolicy" TEXT,
    "privacyPolicy" TEXT,
    "termsPolicy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingPartner" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "trackingUrlTemplate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sellerName" TEXT NOT NULL,
    "sellerGstin" TEXT,
    "sellerAddress" JSONB NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerAddress" JSONB NOT NULL,
    "taxableTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cgstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sgstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" UUID NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "userId" UUID,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "customerNote" TEXT,
    "adminNote" TEXT,
    "refundMethod" "RefundMethod",
    "refundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "providerRefundId" TEXT,
    "refundReference" TEXT,
    "reverseCarrier" TEXT,
    "reverseTrackingNumber" TEXT,
    "reverseTrackingUrl" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "restockedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRequestItem" (
    "id" UUID NOT NULL,
    "returnRequestId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitRefundAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "comment" TEXT NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" UUID NOT NULL,
    "placement" "BannerPlacement" NOT NULL DEFAULT 'HOME_HERO',
    "eyebrow" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "mobileImageUrl" TEXT,
    "ctaText" TEXT,
    "ctaLink" TEXT,
    "background" TEXT,
    "textColor" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_providerOrderId_key" ON "CheckoutSession"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_providerPaymentId_key" ON "CheckoutSession"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_orderId_key" ON "CheckoutSession"("orderId");

-- CreateIndex
CREATE INDEX "CheckoutSession_status_expiresAt_idx" ON "CheckoutSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CheckoutSession_userId_idx" ON "CheckoutSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_eventId_key" ON "PaymentWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_provider_eventType_idx" ON "PaymentWebhookEvent"("provider", "eventType");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_providerOrderId_idx" ON "PaymentWebhookEvent"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingPartner_name_key" ON "ShippingPartner"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingPartner_code_key" ON "ShippingPartner"("code");

-- CreateIndex
CREATE INDEX "ShippingPartner_isActive_sortOrder_idx" ON "ShippingPartner"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_returnNumber_key" ON "ReturnRequest"("returnNumber");

-- CreateIndex
CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");

-- CreateIndex
CREATE INDEX "ReturnRequest_userId_idx" ON "ReturnRequest"("userId");

-- CreateIndex
CREATE INDEX "ReturnRequest_status_requestedAt_idx" ON "ReturnRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "ReturnRequestItem_orderItemId_idx" ON "ReturnRequestItem"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequestItem_returnRequestId_orderItemId_key" ON "ReturnRequestItem"("returnRequestId", "orderItemId");

-- CreateIndex
CREATE INDEX "Review_productId_isApproved_idx" ON "Review"("productId", "isApproved");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_productId_key" ON "Review"("userId", "productId");

-- CreateIndex
CREATE INDEX "Banner_placement_isActive_priority_idx" ON "Banner"("placement", "isActive", "priority");

-- CreateIndex
CREATE INDEX "Banner_startsAt_endsAt_idx" ON "Banner"("startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_refundId_key" ON "Payment"("refundId");

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequestItem" ADD CONSTRAINT "ReturnRequestItem_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequestItem" ADD CONSTRAINT "ReturnRequestItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
