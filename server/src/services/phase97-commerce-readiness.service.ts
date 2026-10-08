/**
 * Phase 97: read-only launch reconciliation across money, orders and physical batches.
 * Results are aggregate counts: no customer details, addresses, payment refs, or PII.
 * This deliberately does not auto-fix, resubmit or settle any payment/order/stock.
 */
import { prisma } from '../config/prisma';

export type CommerceGate = { code: string; category: string; status: 'PASS'|'REVIEW'|'BLOCK'; affected: number|null; explanation: string; action: string };
const metrics: Array<{code:string;category:string;status:'REVIEW'|'BLOCK';sql:string;explanation:string;action:string}> = [
  {code:'ORDER_NEGATIVE_MONEY',category:'Money',status:'BLOCK',sql:`SELECT COUNT(*)::integer AS total FROM "Order" WHERE "subtotal" < 0 OR "shippingFee" < 0 OR "discountAmount" < 0 OR "totalAmount" < 0`,explanation:'Orders contain negative stored monetary amounts.',action:'Reconcile affected orders and discount/shipping logic before launch.'},
  {code:'ORDER_ITEMS_INVALID',category:'Orders',status:'BLOCK',sql:`SELECT COUNT(*)::integer AS total FROM "OrderItem" WHERE "quantity" <= 0 OR "unitPrice" < 0 OR "lineTotal" < 0 OR "discountAmount" < 0`,explanation:'Order lines contain impossible quantity or monetary values.',action:'Inspect immutable order-line snapshots and checkout validation.'},
  {code:'PAYMENT_DUPLICATE_PROVIDER_ID',category:'Money',status:'BLOCK',sql:`SELECT COUNT(*)::integer AS total FROM (SELECT "providerPaymentId" FROM "Payment" WHERE "providerPaymentId" IS NOT NULL AND BTRIM("providerPaymentId") <> '' GROUP BY "providerPaymentId" HAVING COUNT(*) > 1) duplicates`,explanation:'A provider payment ID is attached to multiple internal payments.',action:'Verify provider capture and webhook idempotency before processing orders.'},
  {code:'ONLINE_DISPATCH_UNPAID',category:'Money',status:'BLOCK',sql:`SELECT COUNT(*)::integer AS total FROM "Order" o LEFT JOIN "Payment" p ON p."orderId"=o."id" WHERE o."paymentMethod"='ONLINE' AND o."status" IN ('SHIPPED','DELIVERED') AND (p."id" IS NULL OR p."status" IN ('PENDING','FAILED','CANCELLED'))`,explanation:'Online orders were shipped with missing, failed or pending payment evidence.',action:'Hold new online dispatches and reconcile gateway settlement versus order state.'},
  {code:'CAPTURED_PAYMENT_NO_PROVIDER',category:'Money',status:'BLOCK',sql:`SELECT COUNT(*)::integer AS total FROM "Payment" WHERE "method"='ONLINE' AND "status"='PAID' AND ("providerPaymentId" IS NULL OR BTRIM("providerPaymentId")='')`,explanation:'Paid online payment is missing provider payment identity.',action:'Reconcile provider capture events; never mark as paid from client-only callbacks.'},
  {code:'PAYMENT_OVERREFUND',category:'Money',status:'BLOCK',sql:`SELECT COUNT(*)::integer AS total FROM "Payment" WHERE "refundedAmount" < 0 OR "refundedAmount" > "amount"`,explanation:'Refund totals are outside original payment amount.',action:'Audit refund idempotency and the payment ledger; do not auto-adjust.'},
  {code:'SHIPMENT_CHRONOLOGY',category:'Fulfilment',status:'BLOCK',sql:`SELECT COUNT(*)::integer AS total FROM "Shipment" WHERE "shippedAt" IS NOT NULL AND "deliveredAt" IS NOT NULL AND "deliveredAt" < "shippedAt"`,explanation:'Shipment delivered timestamp precedes shipped timestamp.',action:'Reconcile courier/webhook chronology before customer promise testing.'},
  {code:'SHIPPED_WITHOUT_SHIPMENT_EVIDENCE',category:'Fulfilment',status:'REVIEW',sql:`SELECT COUNT(*)::integer AS total FROM "Order" o LEFT JOIN "Shipment" s ON s."orderId"=o."id" WHERE o."status" IN ('SHIPPED','DELIVERED') AND (s."id" IS NULL OR s."shippedAt" IS NULL)`,explanation:'Shipped/delivered orders lack a complete shipment row or shippedAt.',action:'Review legacy shipment history and test current dispatch creation.'},
  {code:'BATCH_IMPOSSIBLE_QUANTITIES',category:'Warehouse',status:'BLOCK',sql:`SELECT COUNT(*)::integer AS total FROM "InventoryBatch" WHERE "quantityOnHand" < 0 OR "quantityReserved" < 0 OR "quantityBlocked" < 0 OR "quantityReserved"+"quantityBlocked">"quantityOnHand"`,explanation:'Batch has negative or overcommitted physical quantity.',action:'Stop stock-affecting flows until ledger/batch integrity is reconciled.'},
  {code:'EXPIRED_STOCK_SELLABLE',category:'Warehouse',status:'BLOCK',sql:`SELECT COUNT(*)::integer AS total FROM "InventoryBatch" WHERE "expiryDate" IS NOT NULL AND "expiryDate" < CURRENT_DATE AND "quantityOnHand"-"quantityReserved"-"quantityBlocked">0`,explanation:'Expired physical batches retain unblocked availability.',action:'Run a reviewed expiry hold and reconcile affected SKU aggregate stock.'},
  {code:'RECALLED_STOCK_SELLABLE',category:'Warehouse',status:'BLOCK',sql:`SELECT COUNT(*)::integer AS total FROM "InventoryBatch" WHERE "status"='RECALLED' AND "quantityOnHand"-"quantityReserved"-"quantityBlocked">0`,explanation:'Recalled batches retain sellable physical units.',action:'Quarantine/recall the free batch balance; do not release without disposition.'},
  {code:'QA_PENDING_STOCK_SELLABLE',category:'Quality',status:'BLOCK',sql:`SELECT COUNT(*)::integer AS total FROM "InventoryBatch" WHERE "qualityStatus" NOT IN ('RELEASED','CONDITIONAL_RELEASE') AND "quantityOnHand"-"quantityReserved"-"quantityBlocked">0`,explanation:'QA-held or QA-rejected batches retain unblocked availability.',action:'Inspect inbound/manufactured QA holds and release-only stock transitions.'},
  {code:'AGGREGATE_BATCH_DRIFT',category:'Warehouse',status:'REVIEW',sql:`SELECT COUNT(*)::integer AS total FROM (SELECT v."id" FROM "ProductVariant" v JOIN "InventoryBatch" b ON b."variantId"=v."id" GROUP BY v."id",v."stockQuantity" HAVING v."stockQuantity" <> SUM(b."quantityOnHand"-b."quantityReserved"-b."quantityBlocked")) differences`,explanation:'Variant sellable stock does not match total physical batch availability. May need baseline/legacy reconciliation.',action:'Compare aggregate movements, reservation releases, QA holds, and legacy batches before enabling checkout.'},
];

export function phase97SummarizeGates(gates: CommerceGate[]) {
  const blockers = gates.filter(g=>g.status==='BLOCK').length;
  const reviews = gates.filter(g=>g.status==='REVIEW').length;
  return {decision:blockers?'NO_GO':reviews?'REVIEW':'GO',blockers,reviews,passing:gates.length-blockers-reviews,checked:gates.length};
}

export async function phase97CommerceReadinessSnapshot(db: typeof prisma=prisma) {
  const client:any=db;
  const gates:CommerceGate[]=[];
  // Database exceptions are BLOCK, not silently treated as zero violations.
  for(const m of metrics){
    try {
      const rows:any[]=await client.$queryRawUnsafe(m.sql);
      const affected=Number(rows?.[0]?.total);
      if(!Number.isInteger(affected)||affected<0)throw Error('Unusable count');
      gates.push({code:m.code,category:m.category,status:affected?m.status:'PASS',affected,explanation:affected?m.explanation:'No inconsistent records found.',action:affected?m.action:'No action required.'});
    }catch{
      gates.push({code:m.code,category:m.category,status:'BLOCK',affected:null,explanation:'Read-only reconciliation query unavailable. A missing table, permission, or schema drift cannot be treated as PASS.',action:'Check migration state, database permissions and service logs.'});
    }
  }
  return {version:'97.0',readOnly:true,generatedAt:new Date().toISOString(),...phase97SummarizeGates(gates),gates,note:'Read-only counts, no customer PII. A GO here does NOT prove live gateway settlement, refunds, COD delivery, restore drill, or human launch acceptance.'};
}
