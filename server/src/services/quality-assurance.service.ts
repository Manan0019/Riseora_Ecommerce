import type { Prisma } from "../generated/prisma/client";

export const PHASE91_QUALITY_POLICY = {
  defaultSampleQty: 1,
  defaultMinShelfLifeDays: 90,
  supplierScoreLookbackDays: 180,
  supplierWatchScore: 75,
  supplierHoldScore: 55,
  maxTestsPerInspection: 30,
} as const;

const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
const n=(v:unknown)=>Number(v||0);
const days=(a:Date,b:Date)=>Math.floor((a.getTime()-b.getTime())/86400000);
export type QaTestLike={result:string;critical?:boolean};

export function phase91InspectionDecision(tests:QaTestLike[], docs:{coaRequired?:boolean;coaPresent?:boolean;labRequired?:boolean;labPresent?:boolean}, shelf:{expiryDate?:Date|string|null;receivedAt?:Date|string|null;minShelfLifeDays?:number}){
  const criticalFail=tests.some(t=>t.critical&&t.result==="FAIL");
  const anyFail=tests.some(t=>t.result==="FAIL");
  const anyWarn=tests.some(t=>t.result==="WARN");
  const incomplete=tests.some(t=>t.result==="NOT_TESTED");
  const documentFail=!!docs.coaRequired&&!docs.coaPresent||!!docs.labRequired&&!docs.labPresent;
  let shelfDays:number|null=null;let shelfFail=false;
  if(shelf.expiryDate){const received=shelf.receivedAt?new Date(shelf.receivedAt):new Date();shelfDays=days(new Date(shelf.expiryDate),received);shelfFail=shelfDays<Number(shelf.minShelfLifeDays||0);}
  const releasable=!criticalFail&&!anyFail&&!incomplete&&!documentFail&&!shelfFail;
  const conditional=releasable&&anyWarn;
  return {releasable,conditional,criticalFail,anyFail,anyWarn,incomplete,documentFail,shelfFail,shelfDays,disposition:releasable?(conditional?"CONDITIONAL_RELEASE":"RELEASE"):"HOLD"};
}

export function phase91SupplierQualityScore(input:{acceptedQty:number;rejectedQty:number;inspections:number;failedInspections:number;costVarianceItems:number;receiptItems:number;recalls:number;openCriticalIncidents:number}){
  const physical=Math.max(1,input.acceptedQty+input.rejectedQty);
  const rejectionRate=input.rejectedQty/physical;
  const qaFailRate=input.inspections?input.failedInspections/input.inspections:0;
  const costVarianceRate=input.receiptItems?input.costVarianceItems/input.receiptItems:0;
  let score=100-rejectionRate*35-qaFailRate*35-costVarianceRate*10-Math.min(20,input.recalls*10)-Math.min(30,input.openCriticalIncidents*15);
  score=Math.round(clamp(score));
  const recommendation=score<PHASE91_QUALITY_POLICY.supplierHoldScore?"HOLD":score<PHASE91_QUALITY_POLICY.supplierWatchScore?"WATCH":"APPROVED";
  return {score,recommendation,rejectionRate:Number((rejectionRate*100).toFixed(1)),qaFailRate:Number((qaFailRate*100).toFixed(1)),costVarianceRate:Number((costVarianceRate*100).toFixed(1))};
}

async function defaultWarehouse(tx:any){
  const warehouse=await tx.warehouse.findFirst({where:{status:"ACTIVE"},orderBy:[{isDefault:"desc"},{createdAt:"asc"}]});
  if(!warehouse)throw new Error("WAREHOUSE_DEFAULT_REQUIRED");
  const quarantine=await tx.warehouseBin.findFirst({where:{warehouseId:warehouse.id,isActive:true,kind:"QUARANTINE"},orderBy:{createdAt:"asc"}});
  return {warehouse,quarantine};
}

async function batchMovement(tx:any,batch:any,data:any){return tx.inventoryBatchMovement.create({data:{batchId:batch.id,variantId:batch.variantId,type:data.type,onHandChange:data.onHandChange||0,reservedChange:data.reservedChange||0,blockedChange:data.blockedChange||0,onHandAfter:batch.quantityOnHand,reservedAfter:batch.quantityReserved,blockedAfter:batch.quantityBlocked,referenceType:data.referenceType||null,referenceId:data.referenceId||null,note:data.note||null,actorUserId:data.actorUserId||null}})}

export async function phase91CreateInboundQaHold(tx:Prisma.TransactionClient,input:{variantId:string;quantity:number;batchCode:string;expiryDate?:Date|null;unitCost?:number|null;goodsReceiptItemId:string;referenceId:string;actorUserId?:string|null}){
  const client:any=tx;const {warehouse,quarantine}=await defaultWarehouse(client);const batch=await client.inventoryBatch.create({data:{variantId:input.variantId,warehouseId:warehouse.id,binId:quarantine?.id||null,goodsReceiptItemId:input.goodsReceiptItemId,batchCode:input.batchCode,status:"QUARANTINED",qualityStatus:"PENDING",quantityOnHand:input.quantity,quantityReserved:0,quantityBlocked:input.quantity,unitCost:input.unitCost??null,expiryDate:input.expiryDate||null,sourceType:"PURCHASE_RECEIPT",sourceReference:input.referenceId}});
  await batchMovement(client,batch,{type:"RECEIPT",onHandChange:input.quantity,referenceType:"GOODS_RECEIPT",referenceId:input.referenceId,note:"Physical receipt captured on QA hold",actorUserId:input.actorUserId});
  await batchMovement(client,batch,{type:"QA_HOLD",blockedChange:input.quantity,referenceType:"QUALITY",referenceId:input.goodsReceiptItemId,note:"Phase 91 inbound QA hold — not sellable until release",actorUserId:input.actorUserId});
  return batch;
}

export async function phase91ReleaseBatch(tx:Prisma.TransactionClient,input:{batchId:string;inspectionId:string;actorUserId?:string|null;conditional?:boolean}){
  const client:any=tx;await client.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`qa-batch:${input.batchId}`}))`;
  const batch=await client.inventoryBatch.findUnique({where:{id:input.batchId}});if(!batch)throw new Error("QA_BATCH_NOT_FOUND");
  if(["RECALLED","EXPIRED","DEPLETED"].includes(batch.status))throw new Error("QA_RELEASE_BATCH_BLOCKED");
  if(!["PENDING","SAMPLING","UNDER_REVIEW","FAILED"].includes(batch.qualityStatus))return batch;
  const releaseQty=Math.max(0,Math.min(batch.quantityBlocked,batch.quantityOnHand-batch.quantityReserved));if(releaseQty<=0)throw new Error("QA_RELEASE_NO_FREE_QUANTITY");
  const variant=await client.productVariant.findUnique({where:{id:batch.variantId},select:{stockQuantity:true,costPrice:true,safetyStock:true}});if(!variant)throw new Error("VARIANT_NOT_FOUND");
  const nextQuality=input.conditional?"CONDITIONAL_RELEASE":"RELEASED";const updated=await client.inventoryBatch.update({where:{id:batch.id},data:{quantityBlocked:{decrement:releaseQty},status:"AVAILABLE",qualityStatus:nextQuality}});
  await batchMovement(client,updated,{type:"QA_RELEASE",blockedChange:-releaseQty,referenceType:"QUALITY_INSPECTION",referenceId:input.inspectionId,note:input.conditional?"Conditional QA release":"QA release to sellable stock",actorUserId:input.actorUserId});
  const before=n(variant.stockQuantity),after=before+releaseQty;const nextCost=batch.unitCost==null?variant.costPrice:(before<=0||variant.costPrice==null?n(batch.unitCost):Number(((before*n(variant.costPrice)+releaseQty*n(batch.unitCost))/(before+releaseQty)).toFixed(2)));await client.productVariant.update({where:{id:batch.variantId},data:{stockQuantity:after,costPrice:nextCost}});
  await client.inventoryMovement.create({data:{variantId:batch.variantId,type:"QA_RELEASE",source:"QUALITY",quantityChange:releaseQty,stockBefore:before,stockAfter:after,safetyStockSnapshot:Math.max(0,n(variant.safetyStock)),reason:input.conditional?"Conditional QA batch release":"QA batch release",referenceType:"QUALITY_INSPECTION",referenceId:input.inspectionId,actorUserId:input.actorUserId||null}});
  return updated;
}

export async function phase91RejectBatch(tx:Prisma.TransactionClient,input:{batchId:string;inspectionId:string;actorUserId?:string|null;disposition:"RETURN_TO_SUPPLIER"|"DESTROY"|"HOLD";note?:string|null}){
  const client:any=tx;const batch=await client.inventoryBatch.findUnique({where:{id:input.batchId}});if(!batch)throw new Error("QA_BATCH_NOT_FOUND");
  if(batch.quantityReserved>0)throw new Error("QA_REJECT_RESERVED_STOCK_BLOCKED");
  if(input.disposition==="HOLD")return client.inventoryBatch.update({where:{id:batch.id},data:{status:["RECALLED","EXPIRED"].includes(String(batch.status))?batch.status:"QUARANTINED",qualityStatus:"FAILED",quantityBlocked:batch.quantityOnHand}});
  const qty=batch.quantityOnHand;const updated=await client.inventoryBatch.update({where:{id:batch.id},data:{quantityOnHand:0,quantityBlocked:0,status:"DEPLETED",qualityStatus:"FAILED"}});
  await batchMovement(client,updated,{type:"QA_REJECT",onHandChange:-qty,blockedChange:-Math.min(qty,batch.quantityBlocked),referenceType:"QUALITY_INSPECTION",referenceId:input.inspectionId,note:`${input.disposition}: ${input.note||"QA rejection disposition"}`,actorUserId:input.actorUserId});
  return updated;
}

export async function phase91SupplierScorecard(db:any,supplierId:string){
  const since=new Date(Date.now()-PHASE91_QUALITY_POLICY.supplierScoreLookbackDays*86400000);
  const [receiptItems,inspections,recalls,criticalIncidents]=await Promise.all([
    db.goodsReceiptItem.findMany({where:{goodsReceipt:{purchaseOrder:{supplierId},receivedAt:{gte:since}}},select:{acceptedQty:true,rejectedQty:true,varianceStatus:true}}),
    db.qualityInspection.findMany({where:{supplierId,createdAt:{gte:since}},select:{status:true,severity:true}}),
    db.inventoryRecallBatch.count({where:{batch:{goodsReceiptItem:{goodsReceipt:{purchaseOrder:{supplierId}}}},recall:{createdAt:{gte:since}}}}),
    db.supplierQualityIncident.count({where:{supplierId,status:{not:"CLOSED"},severity:"CRITICAL",createdAt:{gte:since}}}),
  ]);
  const metrics=phase91SupplierQualityScore({acceptedQty:receiptItems.reduce((a:any,r:any)=>a+n(r.acceptedQty),0),rejectedQty:receiptItems.reduce((a:any,r:any)=>a+n(r.rejectedQty),0),inspections:inspections.length,failedInspections:inspections.filter((x:any)=>x.status==="REJECTED").length,costVarianceItems:receiptItems.filter((x:any)=>["COST_VARIANCE","COST_AND_QUALITY_VARIANCE"].includes(x.varianceStatus)).length,receiptItems:receiptItems.length,recalls,openCriticalIncidents:criticalIncidents});
  return {...metrics,lookbackDays:PHASE91_QUALITY_POLICY.supplierScoreLookbackDays,receipts:receiptItems.length,inspections:inspections.length,recalls,openCriticalIncidents:criticalIncidents};
}

export async function phase91QualityOverview(db:any){
  const [pending,review,failed,released,incidentCount,openIncidentRows,suppliers]=await Promise.all([
    db.inventoryBatch.count({where:{qualityStatus:{in:["PENDING","SAMPLING"]}}}),db.qualityInspection.count({where:{status:"UNDER_REVIEW"}}),db.inventoryBatch.count({where:{qualityStatus:"FAILED"}}),db.inventoryBatch.count({where:{qualityStatus:{in:["RELEASED","CONDITIONAL_RELEASE"]}}}),db.supplierQualityIncident.count({where:{status:{not:"CLOSED"}}}),db.supplierQualityIncident.findMany({where:{status:{not:"CLOSED"}},include:{supplier:{select:{id:true,name:true,status:true}},batch:{select:{id:true,batchCode:true}}},orderBy:[{severity:"desc"},{createdAt:"desc"}],take:30}),db.supplier.findMany({where:{status:{not:"INACTIVE"}},select:{id:true,name:true,status:true,isPreferred:true}})
  ]);
  const scorecards=[] as any[];for(const supplier of suppliers.slice(0,40))scorecards.push({...supplier,...await phase91SupplierScorecard(db,supplier.id)});
  return {pendingBatches:pending,underReview:review,failedBatches:failed,releasedBatches:released,openIncidents:incidentCount,incidents:openIncidentRows,supplierScorecards:scorecards.sort((a,b)=>a.score-b.score)};
}
