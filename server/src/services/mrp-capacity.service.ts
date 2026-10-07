import { phase92MaterialRequirement } from "./manufacturing-control.service";

export const PHASE93_MRP_POLICY = {
  minHorizonDays: 7,
  maxHorizonDays: 120,
  maxPlanItems: 500,
  maxScheduleDays: 60,
  defaultDayStartHour: 8,
  maxWorkCenters: 100,
} as const;

const n=(v:unknown)=>Number(v||0);
const i=(v:unknown)=>Math.max(0,Math.trunc(n(v)));
const round2=(v:number)=>Number(v.toFixed(2));

export function phase93NetRequirement(gross:number, stock:number, safety:number, scheduled:number){
  return Math.max(0,i(gross)+i(safety)-i(stock)-i(scheduled));
}

export function phase93PlannedRuns(netRequirement:number, outputPerRun:number){
  const out=Math.max(1,i(outputPerRun));
  return Math.max(0,Math.ceil(i(netRequirement)/out));
}

export function phase93OperationMinutes(input:{setupMinutes:number;runMinutesPerUnit:number;outputQty:number;efficiencyPercent:number;queueMinutes?:number}){
  const efficiency=Math.max(1,n(input.efficiencyPercent))/100;
  return Math.max(1,Math.ceil(i(input.setupMinutes)+i(input.queueMinutes||0)+(Math.max(0,n(input.runMinutesPerUnit))*i(input.outputQty))/efficiency));
}

async function scheduledReceiptFor(db:any, variantId:string, inventoryRole:string){
  if(inventoryRole==="FINISHED_GOOD"){
    const orders=await db.productionOrder.findMany({where:{outputVariantId:variantId,status:{in:["DRAFT","APPROVED","MATERIAL_ISSUED","IN_PRODUCTION","QA_PENDING"]}},select:{plannedOutputQty:true,actualOutputQty:true,status:true}});
    return orders.reduce((sum:number,row:any)=>sum+(row.status==="QA_PENDING"?i(row.actualOutputQty||row.plannedOutputQty):i(row.plannedOutputQty)),0);
  }
  const rows=await db.purchaseOrderItem.findMany({where:{variantId,purchaseOrder:{status:{in:["APPROVED","SENT","PARTIALLY_RECEIVED"]}}},select:{orderedQty:true,receivedQty:true}});
  return rows.reduce((sum:number,row:any)=>sum+Math.max(0,i(row.orderedQty)-i(row.receivedQty)),0);
}

export async function phase93BuildMrpPreview(db:any,input:{warehouseId:string;demandPlanId:string;horizonStart:Date;horizonEnd:Date}){
  const demand=await db.demandPlan.findUnique({where:{id:input.demandPlanId},include:{items:{include:{variant:{include:{product:true,manufacturingBomOutputs:{where:{status:"ACTIVE"},include:{items:{include:{componentVariant:true}}},orderBy:{version:"desc"},take:1}}}}}}});
  if(!demand||demand.status!=="APPROVED") throw new Error("MRP_APPROVED_DEMAND_PLAN_REQUIRED");
  const warehouse=await db.warehouse.findUnique({where:{id:input.warehouseId}});
  if(!warehouse||warehouse.status!=="ACTIVE") throw new Error("MRP_ACTIVE_WAREHOUSE_REQUIRED");
  const byVariant=new Map<string,any>();
  const add=async(variant:any,gross:number,action:"MAKE"|"BUY"|"NONE",bom:any|null,reason:string)=>{
    const existing=byVariant.get(variant.id);
    if(existing){existing.grossRequirementQty+=i(gross);existing.sourceReason=[existing.sourceReason,reason].filter(Boolean).join(" · ");return existing;}
    const scheduledReceiptQty=await scheduledReceiptFor(db,variant.id,variant.inventoryRole);
    const availableStockQty=i(variant.stockQuantity),safetyStockQty=i(variant.safetyStock);
    const netRequirementQty=phase93NetRequirement(gross,availableStockQty,safetyStockQty,scheduledReceiptQty);
    const plannedRuns=action==="MAKE"&&bom?phase93PlannedRuns(netRequirementQty,bom.outputQuantity):0;
    const plannedSupplyQty=action==="MAKE"&&bom?plannedRuns*i(bom.outputQuantity):netRequirementQty;
    const row={variantId:variant.id,sku:variant.sku,productName:variant.product?.name||"",variantName:variant.name,inventoryRole:variant.inventoryRole,supplyAction:netRequirementQty>0?action:"NONE",grossRequirementQty:i(gross),availableStockQty,safetyStockQty,scheduledReceiptQty,netRequirementQty,plannedSupplyQty,requiredBy:input.horizonEnd,bomId:bom?.id||null,bom,plannedRuns,sourceReason:reason};
    byVariant.set(variant.id,row);return row;
  };
  for(const item of demand.items){
    const v=item.variant;if(v.inventoryRole!=="FINISHED_GOOD")continue;
    const gross=Math.max(0,i(item.targetStock)-i(item.safetyStock));if(i(item.recommendedReorderQty)<=0&&gross<=0)continue;
    const bom=v.manufacturingBomOutputs?.[0]||null;
    const fg=await add(v,gross,bom?"MAKE":"BUY",bom,`Phase 88 ${demand.name} · ${item.risk}`);
    if(fg.supplyAction==="MAKE"&&bom&&fg.plannedRuns>0){
      for(const bi of bom.items){
        const req=phase92MaterialRequirement(i(bi.quantityPerRun),fg.plannedRuns,n(bi.wastagePercent));
        await add(bi.componentVariant,req,"BUY",null,`Component for ${v.sku} · ${fg.plannedRuns} run(s)`);
      }
    }
  }
  const rows=[...byVariant.values()].map(row=>{if(row.grossRequirementQty!==undefined){row.netRequirementQty=phase93NetRequirement(row.grossRequirementQty,row.availableStockQty,row.safetyStockQty,row.scheduledReceiptQty);if(row.supplyAction!=="NONE"&&row.inventoryRole!=="FINISHED_GOOD")row.plannedSupplyQty=row.netRequirementQty;}return row;}).sort((a,b)=>b.netRequirementQty-a.netRequirementQty);
  const summary={items:rows.length,makeLines:rows.filter(x=>x.supplyAction==="MAKE").length,buyLines:rows.filter(x=>x.supplyAction==="BUY").length,makeUnits:rows.filter(x=>x.supplyAction==="MAKE").reduce((s,x)=>s+i(x.plannedSupplyQty),0),buyUnits:rows.filter(x=>x.supplyAction==="BUY").reduce((s,x)=>s+i(x.plannedSupplyQty),0),shortageCount:rows.filter(x=>x.netRequirementQty>0).length,scheduledReceipts:rows.reduce((s,x)=>s+i(x.scheduledReceiptQty),0)};
  return {warehouse,demandPlan:demand,rows,summary};
}

function dayStart(date:Date){const d=new Date(date);d.setHours(PHASE93_MRP_POLICY.defaultDayStartHour,0,0,0);return d;}
function nextDay(date:Date){const d=dayStart(date);d.setDate(d.getDate()+1);return d;}

export function phase93ScheduleSlots(input:{orders:any[];workCenters:any[];startAt:Date;horizonEnd:Date}){
  const centers=new Map(input.workCenters.map((w:any)=>[w.id,w]));
  const cursor=new Map<string,Date>();
  const slots:any[]=[];let totalMinutes=0,lateRiskCount=0,overloadCount=0;
  const touchedDays=new Map<string,Set<string>>();
  const orders=[...input.orders].sort((a,b)=>Number(b.priority||50)-Number(a.priority||50)||new Date(a.dueAt||"2999-12-31").getTime()-new Date(b.dueAt||"2999-12-31").getTime());
  for(const order of orders){
    const ops=order.routing?.operations||[];let predecessor=dayStart(input.startAt);
    for(const op of ops){
      const center:any=centers.get(op.workCenterId);if(!center||center.status!=="ACTIVE")throw new Error(`SCHEDULE_WORK_CENTER_UNAVAILABLE:${op.workCenterId}`);
      const minutes=phase93OperationMinutes({setupMinutes:Number(op.setupMinutes||center.defaultSetupMinutes||0),runMinutesPerUnit:Number(op.runMinutesPerUnit||0),outputQty:i(order.plannedOutputQty),efficiencyPercent:Number(center.efficiencyPercent||100),queueMinutes:Number(op.queueMinutes||0)});
      if(minutes>i(center.dailyCapacityMinutes)) overloadCount++;
      let current=new Date(Math.max(predecessor.getTime(),(cursor.get(center.id)||dayStart(input.startAt)).getTime()));
      const firstShift=dayStart(current);if(current<firstShift)current=firstShift;
      let firstStart:Date|null=null,remaining=minutes;
      while(remaining>0){
        const shiftStart=dayStart(current);const shiftEnd=new Date(shiftStart.getTime()+i(center.dailyCapacityMinutes)*60000);
        if(current<shiftStart)current=shiftStart;
        if(current>=shiftEnd){current=nextDay(current);continue;}
        if(!firstStart)firstStart=new Date(current);
        const free=Math.max(0,Math.floor((shiftEnd.getTime()-current.getTime())/60000));const take=Math.min(remaining,free);
        const dayKey=shiftStart.toISOString().slice(0,10);if(!touchedDays.has(center.id))touchedDays.set(center.id,new Set());touchedDays.get(center.id)!.add(dayKey);
        current=new Date(current.getTime()+take*60000);remaining-=take;if(remaining>0)current=nextDay(current);
      }
      const slotStart=firstStart||dayStart(input.startAt),slotEnd=current;
      const lateRisk=!!order.dueAt&&slotEnd.getTime()>new Date(order.dueAt).getTime();if(lateRisk)lateRiskCount++;if(slotEnd.getTime()>input.horizonEnd.getTime())overloadCount++;
      slots.push({productionOrderId:order.id,productionNumber:order.productionNumber,workCenterId:center.id,workCenterCode:center.code,workCenterName:center.name,routingOperationId:op.id,sequence:op.sequence,operationName:op.name,plannedStartAt:slotStart,plannedEndAt:slotEnd,plannedMinutes:minutes,lateRisk});
      totalMinutes+=minutes;cursor.set(center.id,slotEnd);predecessor=slotEnd;
    }
  }
  const capacity=input.workCenters.map((c:any)=>{const centerSlots=slots.filter(x=>x.workCenterId===c.id);const planned=centerSlots.reduce((s,x)=>s+i(x.plannedMinutes),0);const days=Math.max(1,touchedDays.get(c.id)?.size||0);const nominal=i(c.dailyCapacityMinutes)*days;return {workCenterId:c.id,code:c.code,name:c.name,plannedMinutes:planned,capacityMinutes:nominal,loadPercent:nominal?round2(planned/nominal*100):0,days};}).filter((x:any)=>x.plannedMinutes>0);
  return {slots,totalMinutes,lateRiskCount,overloadCount,capacity};
}

export async function phase93Overview(db:any){
  const [warehouses,workCenters,routings,mrpPlans,schedules,demandPlans,orders,finishedVariants]=await Promise.all([
    db.warehouse.findMany({where:{status:"ACTIVE"},orderBy:{name:"asc"}}),
    db.workCenter.findMany({include:{warehouse:true},orderBy:{code:"asc"}}),
    db.productionRouting.findMany({include:{warehouse:true,outputVariant:{include:{product:true}},operations:{include:{workCenter:true},orderBy:{sequence:"asc"}}},orderBy:[{outputVariantId:"asc"},{version:"desc"}]}),
    db.mrpPlan.findMany({include:{warehouse:true,demandPlan:true,items:{include:{variant:{include:{product:true}},productionOrder:true,bom:true}}},orderBy:{createdAt:"desc"},take:20}),
    db.productionSchedule.findMany({include:{warehouse:true,slots:{include:{productionOrder:{include:{outputVariant:{include:{product:true}}}},workCenter:true},orderBy:{plannedStartAt:"asc"}}},orderBy:{createdAt:"desc"},take:12}),
    db.demandPlan.findMany({where:{status:"APPROVED"},orderBy:{createdAt:"desc"},take:30}),
    db.productionOrder.findMany({where:{status:{in:["DRAFT","APPROVED","MATERIAL_ISSUED","IN_PRODUCTION"]}},include:{outputVariant:{include:{product:true}},routing:{include:{operations:{include:{workCenter:true},orderBy:{sequence:"asc"}}}},bom:true},orderBy:[{priority:"desc"},{dueAt:"asc"}],take:100}),
    db.productVariant.findMany({where:{inventoryRole:"FINISHED_GOOD",isActive:true},include:{product:true},orderBy:{sku:"asc"},take:250}),
  ]);
  const unscheduled=orders.filter((o:any)=>!o.routing||!o.routing.operations?.length).length;
  return {warehouses,workCenters,routings,mrpPlans,schedules,demandPlans,orders,finishedVariants,summary:{activeWorkCenters:workCenters.filter((x:any)=>x.status==="ACTIVE").length,activeRoutings:routings.filter((x:any)=>x.status==="ACTIVE").length,openMrp:mrpPlans.filter((x:any)=>["DRAFT","APPROVED"].includes(x.status)).length,buyShortage:mrpPlans.filter((x:any)=>["DRAFT","APPROVED"].includes(x.status)).flatMap((x:any)=>x.items).filter((x:any)=>x.supplyAction==="BUY"&&x.netRequirementQty>0).length,openProduction:orders.length,unscheduledRouting:unscheduled,publishedSchedules:schedules.filter((x:any)=>x.status==="PUBLISHED").length}};
}
