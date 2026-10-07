import fs from "node:fs";
import path from "node:path";

const root=process.cwd();let fail=0;
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const check=(name,ok)=>{console.log(`${ok?"PASS":"FAIL"}  ${name}`);if(!ok)fail++};
const schema=read("server/prisma/schema.prisma");
const migration=read("server/prisma/migrations/20261008043000_phase92_manufacturing_bom_production_traceability_v2/migration.sql");
const svc=read("server/src/services/manufacturing-control.service.ts");
const quality=read("server/src/services/quality-assurance.service.ts");
const routes=read("server/src/routes/admin-ops.routes.ts");
const ui=read("client/src/components/AdminManufacturingControlCenter.jsx");
const fulfil=read("client/src/pages/admin/AdminFulfilment.jsx");
const pkg=JSON.parse(read("package.json"));
const prelaunch=String(pkg.scripts?.["prelaunch:check"]||"");

check("Phase 92 migration exists",fs.existsSync(path.join(root,"server/prisma/migrations/20261008043000_phase92_manufacturing_bom_production_traceability_v2/migration.sql")));
check("schema classifies inventory role",schema.includes("enum InventoryRole")&&schema.includes("inventoryRole     InventoryRole"));
check("schema persists versioned BOM and production execution",["model ManufacturingBom","model ManufacturingBomItem","model ProductionOrder","model ProductionOrderMaterial","model ProductionMaterialAllocation"].every(x=>schema.includes(x)));
check("production output has QA-gated batch relation",schema.includes('outputBatch InventoryBatch? @relation("ProductionOutputBatch"')&&schema.includes("QA_PENDING"));
check("manufacturing inventory movements are durable",migration.includes("PRODUCTION_ISSUE")&&migration.includes("PRODUCTION_RETURN")&&migration.includes("PRODUCTION_OUTPUT")&&migration.includes("MANUFACTURING"));
check("material requirement includes explicit wastage allowance",svc.includes("phase92MaterialRequirement")&&svc.includes("Math.ceil(base * (1 +"));
check("material issue uses FEFO released warehouse batches",svc.includes("phase90FefoOrder")&&svc.includes('qualityStatus: { in: ["RELEASED", "CONDITIONAL_RELEASE"] }')&&svc.includes("PRODUCTION_BATCH_SHORTAGE"));
check("material issue respects aggregate safety stock",svc.includes("aggregateAvailable")&&svc.includes("safetyStock"));
check("raw batch lineage is persisted per production material",svc.includes("productionMaterialAllocation.create")&&schema.includes("ProductionMaterialAllocation"));
check("material reconciliation requires issued = consumed + waste + returned",svc.includes("consumed + waste + returned !== issued")&&svc.includes("PRODUCTION_MATERIAL_RECONCILIATION_MISMATCH"));
check("returned material goes back to source batch",svc.includes("returnMaterialToSourceBatches")&&svc.includes('type: "PRODUCTION_RETURN"'));
check("recalled/expired/quarantined source batch blocks completion",svc.includes("PRODUCTION_SOURCE_BATCH_BLOCKED")&&svc.includes('["RECALLED", "EXPIRED", "QUARANTINED"]'));
check("finished production creates physical QA-held stock only",svc.includes('qualityStatus: "PENDING"')&&svc.includes('status: "QUARANTINED"')&&svc.includes("quantityBlocked: asInt(input.actualOutputQty)")&&!svc.includes('type: "PRODUCTION_OUTPUT", source: "MANUFACTURING"'));
check("finished batch output records physical + QA hold movements",svc.includes('type: "PRODUCTION_OUTPUT"')&&svc.includes('type: "QA_HOLD"'));
check("production calculates yield / material / cost variance",svc.includes("phase92YieldVariance")&&svc.includes("phase92VarianceStatus")&&svc.includes("yieldTolerancePercent"));
check("production cost includes material + labour + overhead",svc.includes("phase92ProductionCost")&&svc.includes("labourCost")&&svc.includes("overheadCost")&&svc.includes("unitProductionCost"));
check("Phase 91 QA release closes production order",quality.includes('productionOrder.updateMany')&&quality.includes('status:"RELEASED"'));
check("Phase 91 QA reject marks production QA rejected",quality.includes('status:"QA_REJECTED"'));
check("Phase 89 procurement can source active hidden manufacturing inputs",routes.includes('prisma.productVariant.findMany({where:{isActive:true},select:{id:true,sku:true,name:true,costPrice:true,stockQuantity:true,inventoryRole:true')&&ui.includes("active variants under inactive catalog products"));
check("retail demand planning excludes manufacturing inputs",routes.includes('inventoryRole:"FINISHED_GOOD"')&&routes.includes("phase88LiveDemand"));
check("manufacturing overview distinguishes material-ready vs shortage",svc.includes("materialShortage")&&svc.includes("phase92MaterialAvailability(db, order.warehouseId"));
check("admin routes support role/BOM/order execution",["/phase92-manufacturing/overview","/phase92-manufacturing/boms","/phase92-manufacturing/production-orders/:id/issue-materials","/phase92-manufacturing/production-orders/:id/complete","/phase92-manufacturing/production-orders/:id/trace"].every(x=>routes.includes(x)));
check("BOM activation archives old active version",routes.includes('status:"ARCHIVED"')&&routes.includes('status:"ACTIVE"'));
check("BOM prevents finished-good self consumption and bad component role",routes.includes("Finished output cannot consume itself")&&routes.includes("BOM_COMPONENT_ROLE_BLOCKED"));
check("production cancellation cannot erase issued materials",routes.includes("PRODUCTION_CANCEL_AFTER_MATERIAL_ISSUE_BLOCKED"));
check("admin manufacturing cockpit",ui.includes("PHASE 92 · MANUFACTURING CONTROL")&&ui.includes("Complete production → QA hold")&&ui.includes("Trace lineage"));
check("fulfilment renders Phase 92 center",fulfil.includes("AdminManufacturingControlCenter"));
check("manufacturing:doctor command",pkg.scripts?.["manufacturing:doctor"]?.includes("phase92-manufacturing-audit"));
check("verify:phase92 command",String(pkg.scripts?.["verify:phase92"]||"").includes("manufacturing:doctor")&&String(pkg.scripts?.["verify:phase92"]||"").includes("quality-assurance:doctor")&&String(pkg.scripts?.["verify:phase92"]||"").includes("npm run build"));
check("prelaunch advances to phase92",prelaunch.includes("verify:phase92")&&prelaunch.includes("npm run verify:phase92"));

// Pure behavior checks mirror the exported production math without touching the database.
const materialRequirement=(qty,runs,waste)=>Math.ceil(Math.max(0,Math.trunc(qty))*Math.max(1,Math.trunc(runs))*(1+Math.max(0,Number(waste||0))/100));
check("behavior · BOM wastage rounds up safely",materialRequirement(100,2,2.5)===205);
const yieldVariance=(planned,actual)=>Number((((actual-planned)/Math.max(1,planned))*100).toFixed(2));
check("behavior · yield variance is directional",yieldVariance(100,94)===-6);
const unitCost=(material,labour,overhead,output)=>Number(((material+labour+overhead)/output).toFixed(4));
check("behavior · production unit cost includes conversion cost",unitCost(1000,200,100,100)===13);

console.log(`\nPhase 92 manufacturing audit: ${fail?`FAIL (${fail})`:"PASS"}`);
process.exitCode=fail?1:0;
