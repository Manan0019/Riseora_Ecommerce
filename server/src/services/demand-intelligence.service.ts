export const PHASE88_DEMAND_POLICY = {
  minHorizonDays: 7,
  maxHorizonDays: 90,
  minLeadTimeDays: 1,
  maxLeadTimeDays: 60,
  maxBufferDays: 30,
  recentCampaignWindowDays: 14,
  campaignBufferPerRecentCampaign: 0.05,
  maxCampaignBuffer: 0.20,
  overstockCoverDays: 90,
} as const;

const n = (value: unknown) => Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0;
const round2 = (value: number) => Math.round(value * 100) / 100;

export type Phase88DemandInput = {
  variantId:string; sku:string; productName:string; variantName?:string|null;
  stockQuantity:number; safetyStock:number; lowStockThreshold:number;
  sellingPrice:unknown; costPrice?:unknown;
  sold7d:number; sold30d:number; dueRefillQty:number; pendingStockAlerts:number;
};

export function phase88DemandRow(input:Phase88DemandInput, options:{horizonDays:number;leadTimeDays:number;bufferDays:number;recentCampaignCount:number}) {
  const horizonDays = Math.max(PHASE88_DEMAND_POLICY.minHorizonDays, Math.min(PHASE88_DEMAND_POLICY.maxHorizonDays, Math.round(n(options.horizonDays))));
  const leadTimeDays = Math.max(PHASE88_DEMAND_POLICY.minLeadTimeDays, Math.min(PHASE88_DEMAND_POLICY.maxLeadTimeDays, Math.round(n(options.leadTimeDays))));
  const bufferDays = Math.max(0, Math.min(PHASE88_DEMAND_POLICY.maxBufferDays, Math.round(n(options.bufferDays))));
  const sold7d = Math.max(0, Math.round(n(input.sold7d))), sold30d = Math.max(0, Math.round(n(input.sold30d)));
  const v7 = sold7d / 7, v30 = sold30d / 30;
  const dailyVelocity = v7 > 0 && v30 > 0 ? (v7 * 0.65 + v30 * 0.35) : Math.max(v7, v30);
  const campaignBuffer = Math.min(PHASE88_DEMAND_POLICY.maxCampaignBuffer, Math.max(0, n(options.recentCampaignCount)) * PHASE88_DEMAND_POLICY.campaignBufferPerRecentCampaign);
  const baselineDemand = Math.ceil(dailyVelocity * horizonDays + Math.max(0, n(input.dueRefillQty)));
  const projectedDemand = Math.ceil(baselineDemand * (1 + campaignBuffer));
  const currentStock = Math.max(0, Math.round(n(input.stockQuantity))), safetyStock = Math.max(0, Math.round(n(input.safetyStock)));
  const availableToSell = Math.max(0, currentStock - safetyStock);
  const targetStock = Math.ceil(projectedDemand + dailyVelocity * (leadTimeDays + bufferDays) + safetyStock);
  const recommendedReorderQty = Math.max(0, targetStock - currentStock);
  const coverDays = dailyVelocity > 0 ? round2(availableToSell / dailyVelocity) : null;
  const overstockThresholdDays = Math.max(PHASE88_DEMAND_POLICY.overstockCoverDays, horizonDays * 2);
  let risk:'OUT_OF_STOCK'|'CRITICAL'|'LOW'|'HEALTHY'|'OVERSTOCK'|'DORMANT' = 'HEALTHY';
  if (currentStock <= 0 && (projectedDemand > 0 || input.pendingStockAlerts > 0)) risk = 'OUT_OF_STOCK';
  else if (dailyVelocity === 0 && projectedDemand === 0 && input.pendingStockAlerts === 0 && currentStock > 0) risk = 'DORMANT';
  else if (currentStock <= safetyStock || (coverDays != null && coverDays < leadTimeDays)) risk = 'CRITICAL';
  else if (currentStock <= input.lowStockThreshold || (coverDays != null && coverDays < leadTimeDays + bufferDays)) risk = 'LOW';
  else if (coverDays != null && coverDays > overstockThresholdDays && currentStock > Math.max(targetStock, safetyStock + 1)) risk = 'OVERSTOCK';
  let action:'REORDER'|'PROTECT_STOCK'|'MONITOR'|'PROMOTE_OVERSTOCK'|'DORMANT_REVIEW' = 'MONITOR';
  if (risk === 'OUT_OF_STOCK' || risk === 'CRITICAL') action = 'REORDER';
  else if (risk === 'LOW') action = 'PROTECT_STOCK';
  else if (risk === 'OVERSTOCK') action = 'PROMOTE_OVERSTOCK';
  else if (risk === 'DORMANT') action = 'DORMANT_REVIEW';
  const sellingPrice=n(input.sellingPrice), costPrice=n(input.costPrice);
  const inventoryValue=round2(currentStock * costPrice);
  const recommendedPurchaseValue=round2(recommendedReorderQty * costPrice);
  const shortageUnits=Math.max(0, projectedDemand-availableToSell);
  const potentialLostRevenue=round2(shortageUnits * sellingPrice);
  const overstockUnits=Math.max(0,currentStock-targetStock);
  const overstockCapital=round2(overstockUnits * costPrice);
  const reasons:string[]=[];
  if (input.dueRefillQty > 0) reasons.push(`${input.dueRefillQty} refill unit(s) due inside horizon`);
  if (input.pendingStockAlerts > 0) reasons.push(`${input.pendingStockAlerts} pending back-in-stock signal(s)`);
  if (campaignBuffer > 0) reasons.push(`${Math.round(campaignBuffer*100)}% store-wide recent campaign pressure buffer`);
  if (risk==='OUT_OF_STOCK') reasons.push('No physical stock for observed/latent demand');
  if (risk==='CRITICAL') reasons.push('Sellable cover is below supplier lead time or safety stock');
  if (risk==='LOW') reasons.push('Stock cover is inside the lead-time + buffer window');
  if (risk==='OVERSTOCK') reasons.push('Sellable cover exceeds the overstock planning threshold');
  if (risk==='DORMANT') reasons.push('Stock exists without recent order velocity or refill demand');
  return {
    ...input, currentStock, safetyStock, availableToSell, sold7d, sold30d,
    dailyVelocity:round2(dailyVelocity), campaignBufferPercent:round2(campaignBuffer*100), projectedDemand, targetStock,
    recommendedReorderQty, recommendedPurchaseValue, coverDays, risk, action, inventoryValue, potentialLostRevenue, overstockCapital,
    reason:reasons.join(' · ') || 'Stock and demand are within the current planning envelope',
  };
}

export function phase88DemandSummary(rows:ReturnType<typeof phase88DemandRow>[]) {
  const sum=(key:string)=>round2(rows.reduce((total:any,row:any)=>total+n(row[key]),0));
  const count=(risk:string)=>rows.filter((row)=>row.risk===risk).length;
  return {
    variants:rows.length,
    projectedUnits:Math.round(sum('projectedDemand')),
    recommendedUnits:Math.round(sum('recommendedReorderQty')),
    inventoryValue:sum('inventoryValue'),
    recommendedPurchaseValue:sum('recommendedPurchaseValue'),
    potentialLostRevenue:sum('potentialLostRevenue'),
    overstockCapital:sum('overstockCapital'),
    dueRefillUnits:Math.round(sum('dueRefillQty')),
    pendingStockAlerts:Math.round(sum('pendingStockAlerts')),
    stockoutRisk:count('OUT_OF_STOCK'), criticalRisk:count('CRITICAL'), lowRisk:count('LOW'), healthy:count('HEALTHY'), overstock:count('OVERSTOCK'), dormant:count('DORMANT'),
  };
}
