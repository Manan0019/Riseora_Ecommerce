-- Phase 89 · Supplier Procurement, Purchase Orders & Goods Receipt Control V2
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE','INACTIVE','HOLD');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT','APPROVED','SENT','PARTIALLY_RECEIVED','RECEIVED','CANCELLED');
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('POSTED','CANCELLED');
CREATE TYPE "PurchaseVarianceStatus" AS ENUM ('MATCHED','COST_VARIANCE','QUALITY_VARIANCE','COST_AND_QUALITY_VARIANCE');
ALTER TYPE "InventoryMovementType" ADD VALUE 'PURCHASE_RECEIPT';
ALTER TYPE "InventoryMovementSource" ADD VALUE 'PURCHASE';

CREATE TABLE "Supplier" (
 "id" UUID NOT NULL,"name" TEXT NOT NULL,"contactName" TEXT,"email" TEXT,"phone" TEXT,"gstin" TEXT,"addressLine1" TEXT,"addressLine2" TEXT,"city" TEXT,"state" TEXT,"postalCode" TEXT,"country" TEXT NOT NULL DEFAULT 'India',"status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',"defaultLeadTimeDays" INTEGER NOT NULL DEFAULT 14,"minimumOrderValue" DECIMAL(14,2) NOT NULL DEFAULT 0,"paymentTermsDays" INTEGER NOT NULL DEFAULT 0,"isPreferred" BOOLEAN NOT NULL DEFAULT false,"notes" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");
CREATE INDEX "Supplier_status_isPreferred_name_idx" ON "Supplier"("status","isPreferred","name");

CREATE TABLE "SupplierVariant" (
 "id" UUID NOT NULL,"supplierId" UUID NOT NULL,"variantId" UUID NOT NULL,"supplierSku" TEXT,"unitCost" DECIMAL(14,2) NOT NULL,"minimumOrderQty" INTEGER NOT NULL DEFAULT 1,"packSize" INTEGER NOT NULL DEFAULT 1,"leadTimeDays" INTEGER NOT NULL DEFAULT 14,"isPreferred" BOOLEAN NOT NULL DEFAULT false,"isActive" BOOLEAN NOT NULL DEFAULT true,"lastQuotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "SupplierVariant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierVariant_supplierId_variantId_key" ON "SupplierVariant"("supplierId","variantId");
CREATE INDEX "SupplierVariant_variantId_isActive_unitCost_idx" ON "SupplierVariant"("variantId","isActive","unitCost");
CREATE INDEX "SupplierVariant_supplierId_isActive_idx" ON "SupplierVariant"("supplierId","isActive");

CREATE TABLE "PurchaseOrder" (
 "id" UUID NOT NULL,"poNumber" TEXT NOT NULL,"supplierId" UUID NOT NULL,"demandPlanId" UUID,"status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',"expectedAt" TIMESTAMP(3),"paymentTermsDays" INTEGER NOT NULL DEFAULT 0,"subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,"taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,"totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,"notes" TEXT,"createdByUserId" UUID,"approvedByUserId" UUID,"sentByUserId" UUID,"approvedAt" TIMESTAMP(3),"sentAt" TIMESTAMP(3),"closedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");
CREATE INDEX "PurchaseOrder_status_expectedAt_idx" ON "PurchaseOrder"("status","expectedAt");
CREATE INDEX "PurchaseOrder_supplierId_status_createdAt_idx" ON "PurchaseOrder"("supplierId","status","createdAt");
CREATE INDEX "PurchaseOrder_demandPlanId_status_idx" ON "PurchaseOrder"("demandPlanId","status");

CREATE TABLE "PurchaseOrderItem" (
 "id" UUID NOT NULL,"purchaseOrderId" UUID NOT NULL,"variantId" UUID NOT NULL,"supplierVariantId" UUID,"demandPlanItemId" UUID,"orderedQty" INTEGER NOT NULL,"receivedQty" INTEGER NOT NULL DEFAULT 0,"rejectedQty" INTEGER NOT NULL DEFAULT 0,"unitCost" DECIMAL(14,2) NOT NULL,"gstRate" DECIMAL(6,2) NOT NULL DEFAULT 0,"lineSubtotal" DECIMAL(14,2) NOT NULL,"taxAmount" DECIMAL(14,2) NOT NULL,"lineTotal" DECIMAL(14,2) NOT NULL,"supplierSkuSnapshot" TEXT,"leadTimeDaysSnapshot" INTEGER NOT NULL,"notes" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PurchaseOrderItem_purchaseOrderId_variantId_key" ON "PurchaseOrderItem"("purchaseOrderId","variantId");
CREATE INDEX "PurchaseOrderItem_variantId_purchaseOrderId_idx" ON "PurchaseOrderItem"("variantId","purchaseOrderId");
CREATE INDEX "PurchaseOrderItem_demandPlanItemId_idx" ON "PurchaseOrderItem"("demandPlanItemId");

CREATE TABLE "GoodsReceipt" (
 "id" UUID NOT NULL,"receiptKey" UUID NOT NULL,"grnNumber" TEXT NOT NULL,"purchaseOrderId" UUID NOT NULL,"status" "GoodsReceiptStatus" NOT NULL DEFAULT 'POSTED',"supplierInvoiceNumber" TEXT,"supplierInvoiceDate" TIMESTAMP(3),"receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"totalAcceptedQty" INTEGER NOT NULL DEFAULT 0,"totalRejectedQty" INTEGER NOT NULL DEFAULT 0,"varianceItemCount" INTEGER NOT NULL DEFAULT 0,"notes" TEXT,"createdByUserId" UUID,"postedByUserId" UUID,"postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoodsReceipt_receiptKey_key" ON "GoodsReceipt"("receiptKey");
CREATE UNIQUE INDEX "GoodsReceipt_grnNumber_key" ON "GoodsReceipt"("grnNumber");
CREATE INDEX "GoodsReceipt_purchaseOrderId_createdAt_idx" ON "GoodsReceipt"("purchaseOrderId","createdAt");
CREATE INDEX "GoodsReceipt_status_receivedAt_idx" ON "GoodsReceipt"("status","receivedAt");

CREATE TABLE "GoodsReceiptItem" (
 "id" UUID NOT NULL,"goodsReceiptId" UUID NOT NULL,"purchaseOrderItemId" UUID NOT NULL,"variantId" UUID NOT NULL,"acceptedQty" INTEGER NOT NULL,"rejectedQty" INTEGER NOT NULL DEFAULT 0,"expectedUnitCost" DECIMAL(14,2) NOT NULL,"actualUnitCost" DECIMAL(14,2) NOT NULL,"varianceStatus" "PurchaseVarianceStatus" NOT NULL DEFAULT 'MATCHED',"batchNumber" TEXT,"expiryDate" TIMESTAMP(3),"qualityNote" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GoodsReceiptItem_goodsReceiptId_variantId_idx" ON "GoodsReceiptItem"("goodsReceiptId","variantId");
CREATE INDEX "GoodsReceiptItem_purchaseOrderItemId_idx" ON "GoodsReceiptItem"("purchaseOrderItemId");
CREATE INDEX "GoodsReceiptItem_varianceStatus_createdAt_idx" ON "GoodsReceiptItem"("varianceStatus","createdAt");

ALTER TABLE "SupplierVariant" ADD CONSTRAINT "SupplierVariant_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierVariant" ADD CONSTRAINT "SupplierVariant_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_demandPlanId_fkey" FOREIGN KEY ("demandPlanId") REFERENCES "DemandPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_supplierVariantId_fkey" FOREIGN KEY ("supplierVariantId") REFERENCES "SupplierVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_demandPlanItemId_fkey" FOREIGN KEY ("demandPlanItemId") REFERENCES "DemandPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_defaultLeadTimeDays_check" CHECK ("defaultLeadTimeDays" > 0 AND "paymentTermsDays" >= 0 AND "minimumOrderValue" >= 0);
ALTER TABLE "SupplierVariant" ADD CONSTRAINT "SupplierVariant_terms_check" CHECK ("unitCost" > 0 AND "minimumOrderQty" > 0 AND "packSize" > 0 AND "leadTimeDays" > 0);
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_qty_check" CHECK ("orderedQty" > 0 AND "receivedQty" >= 0 AND "rejectedQty" >= 0);
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_qty_check" CHECK ("acceptedQty" >= 0 AND "rejectedQty" >= 0 AND ("acceptedQty" + "rejectedQty") > 0);
