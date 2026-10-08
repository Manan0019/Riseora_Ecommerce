/** Phase 96: read-only, bounded go-live signals. Never mutates commerce or warehouse state. */
import { prisma } from "../config/prisma";

export type LaunchSignal = { code: string; name: string; status: "PASS" | "WARN" | "BLOCK"; observed: number | string | null; detail: string };
const signal = (code: string, name: string, status: LaunchSignal["status"], observed: LaunchSignal["observed"], detail: string): LaunchSignal => ({code,name,status,observed,detail});
const freshness = (value: string | null, expected: string) => Boolean(value && value >= expected);
const EXPECTED_HEAD = "20261008094000_phase95_maintenance_reliability_spares_v2";

export function phase96ClassifySignals(signals: LaunchSignal[]) {
  const blocked = signals.filter(s => s.status === "BLOCK").length;
  const warnings = signals.filter(s => s.status === "WARN").length;
  return { decision: blocked ? "NO_GO" : warnings ? "REVIEW" : "GO", blocked, warnings, passing: signals.length - blocked - warnings, checked: signals.length };
}

export async function phase96LaunchReadinessSnapshot(db: typeof prisma = prisma) {
  const client: any = db;
  const now = new Date();
  const signals: LaunchSignal[] = [];
  const add = (s: LaunchSignal) => signals.push(s);
  const guarded = async (code: string, name: string, work: () => Promise<number>, assess: (count: number) => LaunchSignal) => {
    try { const count = await work(); add(assess(count)); }
    catch { add(signal(code,name,"BLOCK",null,"Health query unavailable. Investigate database permissions/schema before launch; no data was changed.")); }
  };

  await guarded("DATABASE", "Database connectivity", async () => {
    await client.$queryRawUnsafe("SELECT 1"); return 1;
  }, () => signal("DATABASE","Database connectivity","PASS",1,"Read-only connectivity probe succeeded."));

  try {
    const rows: Array<{migration_name:string}> = await client.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1');
    const head = rows?.[0]?.migration_name ?? null;
    add(signal("MIGRATION_HEAD","Database migration head",freshness(head,EXPECTED_HEAD)?"PASS":"BLOCK",head,"Expected Phase 95 or a forward-compatible later migration; pending/failed migrations must be reviewed separately."));
  } catch { add(signal("MIGRATION_HEAD","Database migration head","BLOCK",null,"Cannot read applied migrations.")); }
  await guarded("FAILED_MIGRATIONS", "Incomplete/failed database migrations", async () => {
    const rows: Array<{total:number}> = await client.$queryRawUnsafe('SELECT COUNT(*)::integer AS total FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL');
    return Number(rows?.[0]?.total ?? 0);
  }, (n) => signal("FAILED_MIGRATIONS","Incomplete/failed database migrations",n ? "BLOCK":"PASS",n,n ? "Resolve migration state before launch." : "No incomplete migration records."));

  await guarded("NEGATIVE_STOCK","Negative sellable SKU quantities",()=>client.productVariant.count({where:{stockQuantity:{lt:0}}}),n=>signal("NEGATIVE_STOCK","Negative sellable SKU quantities",n?"BLOCK":"PASS",n,n?"Reconcile SKU stock before accepting orders.":"No negative SKU quantities."));
  await guarded("BATCH_QUANTITIES","Impossible physical/reserved/blocked batch quantities",async()=>{
    const rows: Array<{total:number}> = await client.$queryRawUnsafe('SELECT COUNT(*)::integer AS total FROM "InventoryBatch" WHERE "quantityOnHand" < 0 OR "quantityReserved" < 0 OR "quantityBlocked" < 0 OR "quantityReserved" + "quantityBlocked" > "quantityOnHand"');
    return Number(rows?.[0]?.total ?? 0);
  },n=>signal("BATCH_QUANTITIES","Impossible batch quantities",n?"BLOCK":"PASS",n,n?"Physical warehouse quantities are inconsistent.":"Batch on-hand/reserved/blocked constraints look valid."));
  await guarded("PAYMENT_TOTALS","Order and payment face-value mismatches",async()=>{
    const rows: Array<{total:number}> = await client.$queryRawUnsafe('SELECT COUNT(*)::integer AS total FROM "Payment" p JOIN "Order" o ON o."id" = p."orderId" WHERE p."amount" <> o."totalAmount"');
    return Number(rows?.[0]?.total ?? 0);
  },n=>signal("PAYMENT_TOTALS","Order and payment face-value mismatches",n?"BLOCK":"PASS",n,n?"Paid/expected amounts differ from source order totals.":"Stored order and payment face values match."));
  await guarded("REFUND_LIMITS","Payments refunded beyond their original amount",async()=>{
    const rows: Array<{total:number}> = await client.$queryRawUnsafe('SELECT COUNT(*)::integer AS total FROM "Payment" WHERE "refundedAmount" < 0 OR "refundedAmount" > "amount"');
    return Number(rows?.[0]?.total ?? 0);
  },n=>signal("REFUND_LIMITS","Refund amounts exceed collected payment",n?"BLOCK":"PASS",n,n?"Financial reconciliation is required before accepting new funds.":"Refund totals are inside payment bounds."));
  await guarded("QA_HOLD_SALE","QA-held/rejected stock still available in physical batches",async()=>{
    const rows: Array<{total:number}> = await client.$queryRawUnsafe(`SELECT COUNT(*)::integer AS total FROM "InventoryBatch" WHERE "qualityStatus" IN ('PENDING','SAMPLING','UNDER_REVIEW','FAILED') AND "quantityOnHand" - "quantityReserved" - "quantityBlocked" > 0`);
    return Number(rows?.[0]?.total ?? 0);
  },n=>signal("QA_HOLD_SALE","QA-held/rejected stock still available",n?"BLOCK":"PASS",n,n?"Unreleased batches have unblocked physical stock; isolate the SKUs.":"QA-held batches are physically blocked."));
  await guarded("DISPATCH_BACKLOG","Past-due unshipped orders",()=>client.order.count({where:{status:{in:["CONFIRMED","PROCESSING"]},dispatchDueAt:{lt:now}}}),n=>signal("DISPATCH_BACKLOG","Past-due unshipped orders",n?"WARN":"PASS",n,"Review fulfilment backlog; not a release safety blocker by itself."));
  await guarded("ONLINE_PAYMENT_TRACE","Paid online payments without provider reference",()=>client.payment.count({where:{method:"ONLINE",status:"PAID",providerPaymentId:null}}),n=>signal("ONLINE_PAYMENT_TRACE","Paid online payments without provider reference",n?"WARN":"PASS",n,"Review payments/reconciliation before launching new promotions."));
  await guarded("QA_HOLDS","Physical batches awaiting QA",()=>client.inventoryBatch.count({where:{qualityStatus:{in:["PENDING","SAMPLING","UNDER_REVIEW","FAILED"]},quantityOnHand:{gt:0}}}),n=>signal("QA_HOLDS","Physical batches awaiting QA",n?"WARN":"PASS",n,"QA holds are correctly non-sellable. Resolve their workflow as appropriate."));
  await guarded("ACTIVE_RECALLS","Active inventory recalls",()=>client.inventoryRecall.count({where:{status:"ACTIVE"}}),n=>signal("ACTIVE_RECALLS","Active inventory recalls",n?"WARN":"PASS",n,"Open recalls require operational monitoring; do not release affected stock."));
  await guarded("SUPPORT_SLA","Open support cases past SLA",()=>client.contactMessage.count({where:{status:{in:["NEW","IN_PROGRESS"]},slaDueAt:{lt:now}}}),n=>signal("SUPPORT_SLA","Open support cases past SLA",n?"WARN":"PASS",n,"Assign and resolve overdue support cases."));
  await guarded("MAINTENANCE_BACKLOG","Unfinished maintenance work past due",()=>client.maintenanceWorkOrder.count({where:{status:{in:["DRAFT","APPROVED","IN_PROGRESS"]},dueAt:{lt:now}}}),n=>signal("MAINTENANCE_BACKLOG","Unfinished maintenance work past due",n?"WARN":"PASS",n,"Check reliability capacity before new production commitments."));

  try {
    const cfg = await client.storeSetting.findUnique({where:{id:"primary"},select:{privacyPolicy:true,termsPolicy:true,shippingPolicy:true,returnPolicy:true,supportEmail:true,siteUrl:true}});
    const missing = cfg ? ["privacyPolicy","termsPolicy","shippingPolicy","returnPolicy","supportEmail","siteUrl"].filter(k=>!String(cfg[k]||"").trim()) : ["storeSetting"];
    add(signal("STORE_POLICIES","Store policy/contact completeness",missing.length?"WARN":"PASS",missing.length,missing.length?`Review ${missing.join(", ")} before public launch.`:"Store legal/support policy fields populated."));
  } catch { add(signal("STORE_POLICIES","Store policy/contact completeness","BLOCK",null,"Could not read store settings; check schema and admin configuration.")); }
  const mode = process.env.NODE_ENV || "development";
  if (mode !== "production") add(signal("RUNTIME_MODE","Production runtime mode","WARN",mode,"Local preview is not production evidence."));
  else add(signal("RUNTIME_MODE","Production runtime mode","PASS",mode,"Runtime is configured for production."));
  const summary = phase96ClassifySignals(signals);
  return { version:"96.0", readOnly:true, environment:mode, generatedAt:now.toISOString(), expectedMinimumMigrationHead: EXPECTED_HEAD, ...summary, signals, note:"NO_GO means launch must not proceed. REVIEW requires operator decision. This dashboard does not check external payment gateway credentials or perform test transactions." };
}
