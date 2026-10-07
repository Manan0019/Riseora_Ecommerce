export const PHASE89_PROCUREMENT_POLICY = {
  maxPlanPurchaseOrders: 25,
  maxItemsPerPurchaseOrder: 250,
  maxSuppliers: 250,
  maxLeadTimeDays: 120,
  costVariancePercent: 0.03,
  overdueGraceDays: 2,
} as const;

const n=(v:unknown)=>Number.isFinite(Number(v??0))?Number(v??0):0;
const money=(v:number)=>Math.round(v*100)/100;

export function phase89RoundOrderQty(requiredQty:number, minimumOrderQty:number, packSize:number){
  const required=Math.max(0,Math.ceil(n(requiredQty)));
  if(required===0)return 0;
  const moq=Math.max(1,Math.ceil(n(minimumOrderQty)||1));
  const pack=Math.max(1,Math.ceil(n(packSize)||1));
  const base=Math.max(required,moq);
  return Math.ceil(base/pack)*pack;
}

export type Phase89SupplierOffer={id:string;supplierId:string;supplierName:string;unitCost:unknown;minimumOrderQty:number;packSize:number;leadTimeDays:number;isPreferred:boolean;supplierPreferred?:boolean;supplierStatus?:string;supplierSku?:string|null;supplierMinimumOrderValue?:number};

export function phase89RankSupplierOffers(offers:Phase89SupplierOffer[],requiredQty:number){
  return offers.filter(o=>o.supplierStatus!=='HOLD'&&o.supplierStatus!=='INACTIVE').map(o=>{
    const orderQty=phase89RoundOrderQty(requiredQty,o.minimumOrderQty,o.packSize);
    const unitCost=Math.max(0,n(o.unitCost));
    const purchaseValue=money(orderQty*unitCost);
    const lead=Math.max(1,Math.min(PHASE89_PROCUREMENT_POLICY.maxLeadTimeDays,Math.round(n(o.leadTimeDays)||14)));
    const preferredBonus=(o.isPreferred?30:0)+(o.supplierPreferred?15:0);
    // Lower is better: cost dominates, then lead-time; preferred flags break close ties.
    const score=money(purchaseValue+(lead*unitCost*0.05)-preferredBonus);
    return {...o,orderQty,unitCost,purchaseValue,leadTimeDays:lead,score};
  }).sort((a,b)=>a.score-b.score||a.leadTimeDays-b.leadTimeDays||a.unitCost-b.unitCost);
}

export function phase89ReceiptVariance(input:{expectedUnitCost:unknown;actualUnitCost:unknown;rejectedQty:number}){
  const expected=Math.max(0,n(input.expectedUnitCost)), actual=Math.max(0,n(input.actualUnitCost));
  const costVariance=expected>0?Math.abs(actual-expected)/expected>PHASE89_PROCUREMENT_POLICY.costVariancePercent:actual>0;
  const qualityVariance=Math.max(0,Math.round(n(input.rejectedQty)))>0;
  const status=costVariance&&qualityVariance?'COST_AND_QUALITY_VARIANCE':costVariance?'COST_VARIANCE':qualityVariance?'QUALITY_VARIANCE':'MATCHED';
  return {status,costVariancePercent:expected>0?money(((actual-expected)/expected)*100):null,qualityVariance};
}

export function phase89PurchaseTotals(items:Array<{qty:number;unitCost:unknown;gstRate:unknown}>){
  return items.reduce((acc,item)=>{const subtotal=money(Math.max(0,n(item.qty))*Math.max(0,n(item.unitCost)));const tax=money(subtotal*Math.max(0,n(item.gstRate))/100);acc.subtotal=money(acc.subtotal+subtotal);acc.taxAmount=money(acc.taxAmount+tax);acc.totalAmount=money(acc.totalAmount+subtotal+tax);return acc},{subtotal:0,taxAmount:0,totalAmount:0});
}

export function phase89WeightedAverageCost(input:{stockBefore:number;existingCost:unknown;acceptedQty:number;actualUnitCost:unknown}){
  const oldQty=Math.max(0,Math.round(n(input.stockBefore))),addQty=Math.max(0,Math.round(n(input.acceptedQty))),actual=Math.max(0,n(input.actualUnitCost));
  if(addQty<=0)return input.existingCost==null?null:money(n(input.existingCost));
  const existing=input.existingCost==null?actual:Math.max(0,n(input.existingCost));
  const total=oldQty+addQty;return total>0?money((oldQty*existing+addQty*actual)/total):money(actual);
}
