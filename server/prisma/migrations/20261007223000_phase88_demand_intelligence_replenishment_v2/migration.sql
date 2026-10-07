-- Phase 88 · Demand Intelligence, Replenishment Planning & Merchandising Control V2
CREATE TYPE "DemandRisk" AS ENUM ('OUT_OF_STOCK', 'CRITICAL', 'LOW', 'HEALTHY', 'OVERSTOCK', 'DORMANT');
CREATE TYPE "DemandPlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');
CREATE TYPE "MerchandisingAction" AS ENUM ('REORDER', 'PROTECT_STOCK', 'MONITOR', 'PROMOTE_OVERSTOCK', 'DORMANT_REVIEW');

CREATE TABLE "DemandPlan" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "status" "DemandPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "horizonDays" INTEGER NOT NULL,
  "leadTimeDays" INTEGER NOT NULL,
  "bufferDays" INTEGER NOT NULL,
  "recentCampaignCount" INTEGER NOT NULL DEFAULT 0,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "projectedUnits" INTEGER NOT NULL DEFAULT 0,
  "recommendedUnits" INTEGER NOT NULL DEFAULT 0,
  "recommendedPurchaseValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "stockoutRiskCount" INTEGER NOT NULL DEFAULT 0,
  "criticalRiskCount" INTEGER NOT NULL DEFAULT 0,
  "overstockCount" INTEGER NOT NULL DEFAULT 0,
  "dormantCount" INTEGER NOT NULL DEFAULT 0,
  "inventoryValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "potentialLostRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "overstockCapital" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "generatedByUserId" UUID,
  "approvedByUserId" UUID,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DemandPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DemandPlanItem" (
  "id" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "risk" "DemandRisk" NOT NULL,
  "action" "MerchandisingAction" NOT NULL,
  "currentStock" INTEGER NOT NULL,
  "safetyStock" INTEGER NOT NULL,
  "lowStockThreshold" INTEGER NOT NULL,
  "availableToSell" INTEGER NOT NULL,
  "sold7d" INTEGER NOT NULL,
  "sold30d" INTEGER NOT NULL,
  "dueRefillQty" INTEGER NOT NULL,
  "pendingStockAlerts" INTEGER NOT NULL,
  "dailyVelocity" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "campaignBufferPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "projectedDemand" INTEGER NOT NULL,
  "targetStock" INTEGER NOT NULL,
  "recommendedReorderQty" INTEGER NOT NULL,
  "recommendedPurchaseValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "coverDays" DECIMAL(10,2),
  "inventoryValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "potentialLostRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "overstockCapital" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DemandPlanItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemandPlan_status_createdAt_idx" ON "DemandPlan"("status", "createdAt");
CREATE INDEX "DemandPlan_generatedByUserId_createdAt_idx" ON "DemandPlan"("generatedByUserId", "createdAt");
CREATE UNIQUE INDEX "DemandPlanItem_planId_variantId_key" ON "DemandPlanItem"("planId", "variantId");
CREATE INDEX "DemandPlanItem_variantId_createdAt_idx" ON "DemandPlanItem"("variantId", "createdAt");
CREATE INDEX "DemandPlanItem_planId_risk_idx" ON "DemandPlanItem"("planId", "risk");
CREATE INDEX "DemandPlanItem_risk_action_idx" ON "DemandPlanItem"("risk", "action");


ALTER TABLE "DemandPlan" ADD CONSTRAINT "DemandPlan_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DemandPlan" ADD CONSTRAINT "DemandPlan_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DemandPlanItem" ADD CONSTRAINT "DemandPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DemandPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DemandPlanItem" ADD CONSTRAINT "DemandPlanItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
