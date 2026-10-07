import type { Prisma } from "../generated/prisma/client";
import { phase90AvailableQty, phase90FefoOrder } from "./warehouse-inventory.service";

export const PHASE92_MANUFACTURING_POLICY = {
  maxBomItems: 60,
  maxProductionRuns: 100000,
  materialVariancePercent: 2,
  costVariancePercent: 5,
  maxOpenOrders: 250,
} as const;

const n = (value: unknown) => Number(value || 0);
const asInt = (value: unknown) => Math.max(0, Math.trunc(n(value)));
const round2 = (value: number) => Number(value.toFixed(2));
const round4 = (value: number) => Number(value.toFixed(4));

export function phase92MaterialRequirement(quantityPerRun: number, plannedRuns: number, wastagePercent = 0) {
  const base = Math.max(0, Math.trunc(quantityPerRun)) * Math.max(1, Math.trunc(plannedRuns));
  return Math.ceil(base * (1 + Math.max(0, n(wastagePercent)) / 100));
}

export function phase92YieldVariance(plannedOutputQty: number, actualOutputQty: number) {
  const planned = Math.max(1, asInt(plannedOutputQty));
  const actual = Math.max(0, asInt(actualOutputQty));
  return round2(((actual - planned) / planned) * 100);
}

export function phase92ProductionCost(materialCost: number, labourCost: number, overheadCost: number, outputQty: number) {
  const total = Math.max(0, n(materialCost)) + Math.max(0, n(labourCost)) + Math.max(0, n(overheadCost));
  return { total: round2(total), unit: outputQty > 0 ? round4(total / outputQty) : null };
}

export function phase92VarianceStatus(input: {
  yieldVariancePercent: number;
  yieldTolerancePercent: number;
  plannedMaterialQty: number;
  actualMaterialQty: number;
  plannedMaterialCost: number;
  actualMaterialCost: number;
}) {
  const yieldVariance = Math.abs(n(input.yieldVariancePercent)) > Math.max(0, n(input.yieldTolerancePercent));
  const materialBase = Math.max(1, n(input.plannedMaterialQty));
  const materialPct = Math.abs((n(input.actualMaterialQty) - n(input.plannedMaterialQty)) / materialBase) * 100;
  const materialVariance = materialPct > PHASE92_MANUFACTURING_POLICY.materialVariancePercent;
  const costBase = Math.max(1, n(input.plannedMaterialCost));
  const costPct = Math.abs((n(input.actualMaterialCost) - n(input.plannedMaterialCost)) / costBase) * 100;
  const costVariance = costPct > PHASE92_MANUFACTURING_POLICY.costVariancePercent;
  const flags = [yieldVariance, materialVariance, costVariance].filter(Boolean).length;
  return {
    status: flags > 1 ? "MULTIPLE_VARIANCE" : yieldVariance ? "YIELD_VARIANCE" : materialVariance ? "MATERIAL_VARIANCE" : costVariance ? "COST_VARIANCE" : "ON_TARGET",
    materialVariancePercent: round2(materialPct),
    costVariancePercent: round2(costPct),
  } as const;
}

async function writeBatchMovement(tx: any, batch: any, input: {
  type: string;
  onHandChange?: number;
  reservedChange?: number;
  blockedChange?: number;
  referenceType: string;
  referenceId: string;
  note?: string | null;
  actorUserId?: string | null;
}) {
  return tx.inventoryBatchMovement.create({ data: {
    batchId: batch.id,
    variantId: batch.variantId,
    type: input.type,
    onHandChange: input.onHandChange || 0,
    reservedChange: input.reservedChange || 0,
    blockedChange: input.blockedChange || 0,
    onHandAfter: batch.quantityOnHand,
    reservedAfter: batch.quantityReserved,
    blockedAfter: batch.quantityBlocked,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    note: input.note || null,
    actorUserId: input.actorUserId || null,
  }});
}

async function writeAggregateMovement(tx: any, input: {
  variantId: string;
  delta: number;
  type: "PRODUCTION_ISSUE" | "PRODUCTION_RETURN";
  referenceId: string;
  actorUserId?: string | null;
  reason: string;
}) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`inventory:${input.variantId}`}))`;
  const variant = await tx.productVariant.findUnique({ where: { id: input.variantId }, select: { stockQuantity: true, safetyStock: true } });
  if (!variant) throw new Error("VARIANT_NOT_FOUND");
  const before = asInt(variant.stockQuantity);
  const after = before + input.delta;
  if (after < 0) throw new Error("PRODUCTION_MATERIAL_STOCK_BLOCKED");
  await tx.productVariant.update({ where: { id: input.variantId }, data: { stockQuantity: after } });
  await tx.inventoryMovement.create({ data: {
    variantId: input.variantId,
    type: input.type,
    source: "MANUFACTURING",
    quantityChange: input.delta,
    stockBefore: before,
    stockAfter: after,
    safetyStockSnapshot: asInt(variant.safetyStock),
    reason: input.reason,
    referenceType: "PRODUCTION_ORDER",
    referenceId: input.referenceId,
    actorUserId: input.actorUserId || null,
  }});
}

async function activeMaterialBatches(tx: any, warehouseId: string, variantId: string) {
  const now = Date.now();
  const rows = await tx.inventoryBatch.findMany({
    where: { warehouseId, variantId, status: "AVAILABLE", qualityStatus: { in: ["RELEASED", "CONDITIONAL_RELEASE"] } },
    orderBy: { receivedAt: "asc" },
  });
  return phase90FefoOrder(rows.filter((row: any) => phase90AvailableQty(row) > 0 && (!row.expiryDate || new Date(row.expiryDate).getTime() >= now)));
}

export async function phase92MaterialAvailability(db: any, warehouseId: string, lines: Array<{componentVariantId: string; plannedQty: number}>) {
  const out = [] as any[];
  for (const line of lines) {
    const variant = await db.productVariant.findUnique({ where: { id: line.componentVariantId }, select: { id: true, sku: true, name: true, stockQuantity: true, safetyStock: true, inventoryRole: true } });
    const batches = variant ? await activeMaterialBatches(db, warehouseId, variant.id) : [];
    const batchAvailable = batches.reduce((sum: number, row: any) => sum + phase90AvailableQty(row), 0);
    const aggregateAvailable = variant ? Math.max(0, asInt(variant.stockQuantity) - asInt(variant.safetyStock)) : 0;
    const available = Math.min(batchAvailable, aggregateAvailable);
    out.push({ ...line, variant, availableQty: available, shortageQty: Math.max(0, line.plannedQty - available), ready: available >= line.plannedQty });
  }
  return out;
}

export async function phase92IssueProductionMaterials(tx: Prisma.TransactionClient, productionOrderId: string, actorUserId?: string | null) {
  const db: any = tx;
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`production:${productionOrderId}`}))`;
  const order = await db.productionOrder.findUnique({ where: { id: productionOrderId }, include: { materials: { include: { componentVariant: true, allocations: true } }, bom: true } });
  if (!order) throw new Error("PRODUCTION_ORDER_NOT_FOUND");
  if (order.status !== "APPROVED") throw new Error("PRODUCTION_MATERIAL_ISSUE_STATUS_BLOCKED");

  const availability = await phase92MaterialAvailability(db, order.warehouseId, order.materials.map((x: any) => ({ componentVariantId: x.componentVariantId, plannedQty: asInt(x.plannedQty) })));
  const shortages = availability.filter((x: any) => !x.ready);
  if (shortages.length) throw new Error(`PRODUCTION_MATERIAL_SHORTAGE:${shortages.map((x: any) => `${x.variant?.sku || x.componentVariantId}:${x.shortageQty}`).join(",")}`);

  let plannedMaterialCost = 0;
  for (const line of order.materials) {
    let remaining = asInt(line.plannedQty);
    let totalCost = 0;
    const batches = await activeMaterialBatches(db, order.warehouseId, line.componentVariantId);
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, phase90AvailableQty(batch));
      if (!take) continue;
      const unitCost = batch.unitCost == null ? n(line.componentVariant.costPrice) : n(batch.unitCost);
      const updated = await db.inventoryBatch.update({ where: { id: batch.id }, data: { quantityOnHand: { decrement: take }, ...(asInt(batch.quantityOnHand) - take === 0 ? { status: "DEPLETED" } : {}) } });
      await writeBatchMovement(db, updated, { type: "PRODUCTION_ISSUE", onHandChange: -take, referenceType: "PRODUCTION_ORDER", referenceId: order.id, actorUserId, note: `Material issue · ${order.productionNumber}` });
      await db.productionMaterialAllocation.create({ data: { materialLineId: line.id, batchId: batch.id, quantityIssued: take, unitCostSnapshot: unitCost || null } });
      totalCost += take * unitCost;
      remaining -= take;
    }
    if (remaining > 0) throw new Error(`PRODUCTION_BATCH_SHORTAGE:${line.componentVariant.sku}:${remaining}`);
    await writeAggregateMovement(db, { variantId: line.componentVariantId, delta: -asInt(line.plannedQty), type: "PRODUCTION_ISSUE", referenceId: order.id, actorUserId, reason: `Issued to ${order.productionNumber}` });
    const averageCost = line.plannedQty > 0 ? totalCost / asInt(line.plannedQty) : 0;
    plannedMaterialCost += totalCost;
    await db.productionOrderMaterial.update({ where: { id: line.id }, data: { issuedQty: line.plannedQty, unitCostSnapshot: round4(averageCost) } });
  }

  return db.productionOrder.update({ where: { id: order.id }, data: { status: "MATERIAL_ISSUED", plannedMaterialCost: round2(plannedMaterialCost) }, include: { materials: { include: { componentVariant: { include: { product: true } }, allocations: { include: { batch: true } } } }, outputVariant: { include: { product: true } }, bom: true } });
}

async function returnMaterialToSourceBatches(db: any, line: any, returnQty: number, actorUserId: string | null | undefined, productionOrderId: string) {
  let remaining = asInt(returnQty);
  const returnedByAllocation = new Map<string, number>();
  if (!remaining) return returnedByAllocation;
  const allocations = [...line.allocations].reverse();
  for (const alloc of allocations) {
    if (remaining <= 0) break;
    const capacity = Math.max(0, asInt(alloc.quantityIssued) - asInt(alloc.quantityReturned));
    const giveBack = Math.min(remaining, capacity);
    if (!giveBack) continue;
    const batch = await db.inventoryBatch.findUnique({ where: { id: alloc.batchId } });
    if (!batch) throw new Error("PRODUCTION_SOURCE_BATCH_NOT_FOUND");
    if (["RECALLED", "EXPIRED", "QUARANTINED"].includes(String(batch.status))) throw new Error(`PRODUCTION_SOURCE_BATCH_BLOCKED:${batch.batchCode}`);
    const updated = await db.inventoryBatch.update({ where: { id: batch.id }, data: { quantityOnHand: { increment: giveBack }, ...(batch.status === "DEPLETED" ? { status: "AVAILABLE" } : {}) } });
    await writeBatchMovement(db, updated, { type: "PRODUCTION_RETURN", onHandChange: giveBack, referenceType: "PRODUCTION_ORDER", referenceId: productionOrderId, actorUserId, note: "Unused production material returned" });
    await db.productionMaterialAllocation.update({ where: { id: alloc.id }, data: { quantityReturned: { increment: giveBack } } });
    returnedByAllocation.set(alloc.id, giveBack);
    remaining -= giveBack;
  }
  if (remaining > 0) throw new Error("PRODUCTION_RETURN_ALLOCATION_BLOCKED");
  await writeAggregateMovement(db, { variantId: line.componentVariantId, delta: asInt(returnQty), type: "PRODUCTION_RETURN", referenceId: productionOrderId, actorUserId, reason: "Unused production material returned" });
  return returnedByAllocation;
}

export async function phase92CompleteProduction(tx: Prisma.TransactionClient, input: {
  productionOrderId: string;
  actualOutputQty: number;
  outputBatchCode: string;
  manufacturedAt?: Date | null;
  expiryDate?: Date | null;
  labourCost?: number;
  overheadCost?: number;
  materials: Array<{ materialLineId: string; consumedQty: number; wasteQty: number; returnedQty: number }>;
  actorUserId?: string | null;
}) {
  const db: any = tx;
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`production:${input.productionOrderId}`}))`;
  const order = await db.productionOrder.findUnique({ where: { id: input.productionOrderId }, include: { bom: true, outputVariant: true, materials: { include: { componentVariant: true, allocations: { include: { batch: true } } } } } });
  if (!order) throw new Error("PRODUCTION_ORDER_NOT_FOUND");
  if (order.status !== "IN_PRODUCTION") throw new Error("PRODUCTION_COMPLETE_STATUS_BLOCKED");
  if (asInt(input.actualOutputQty) <= 0) throw new Error("PRODUCTION_OUTPUT_REQUIRED");
  if (order.outputBatchId) return order;

  const actualMap = new Map(input.materials.map(x => [x.materialLineId, x]));
  let actualMaterialCost = 0;
  let plannedMaterialQty = 0;
  let actualMaterialQty = 0;
  for (const line of order.materials) {
    const actual = actualMap.get(line.id);
    if (!actual) throw new Error(`PRODUCTION_MATERIAL_RECONCILIATION_REQUIRED:${line.id}`);
    const consumed = asInt(actual.consumedQty), waste = asInt(actual.wasteQty), returned = asInt(actual.returnedQty), issued = asInt(line.issuedQty);
    if (consumed + waste + returned !== issued) throw new Error(`PRODUCTION_MATERIAL_RECONCILIATION_MISMATCH:${line.componentVariant.sku}`);
    for (const alloc of line.allocations) {
      if (["RECALLED", "EXPIRED", "QUARANTINED"].includes(String(alloc.batch.status))) throw new Error(`PRODUCTION_SOURCE_BATCH_BLOCKED:${alloc.batch.batchCode}`);
    }
    const returnedByAllocation = await returnMaterialToSourceBatches(db, line, returned, input.actorUserId, order.id);
    const used = consumed + waste;
    let lineCost = 0;
    for (const alloc of line.allocations) {
      const returnedFromThisBatch = returnedByAllocation.get(alloc.id) || 0;
      const usedFromThisBatch = Math.max(0, asInt(alloc.quantityIssued) - returnedFromThisBatch);
      lineCost += usedFromThisBatch * n(alloc.unitCostSnapshot ?? line.unitCostSnapshot);
    }
    lineCost = round2(lineCost);
    actualMaterialCost += lineCost;
    plannedMaterialQty += asInt(line.plannedQty);
    actualMaterialQty += used;
    await db.productionOrderMaterial.update({ where: { id: line.id }, data: { consumedQty: consumed, wasteQty: waste, returnedQty: returned, actualCost: lineCost } });

    let remainingConsumed = consumed;
    let remainingWaste = waste;
    for (const alloc of line.allocations) {
      const returnedFromThisBatch = returnedByAllocation.get(alloc.id) || 0;
      const availableForUse = Math.max(0, asInt(alloc.quantityIssued) - returnedFromThisBatch);
      const consume = Math.min(remainingConsumed, availableForUse);
      const wasteTake = Math.min(remainingWaste, Math.max(0, availableForUse - consume));
      await db.productionMaterialAllocation.update({ where: { id: alloc.id }, data: { quantityConsumed: consume } });
      if (wasteTake > 0) {
        const depletedBatch = await db.inventoryBatch.findUnique({ where: { id: alloc.batchId } });
        if (depletedBatch) await writeBatchMovement(db, depletedBatch, { type: "PRODUCTION_WASTE", referenceType: "PRODUCTION_ORDER", referenceId: order.id, actorUserId: input.actorUserId, note: `${wasteTake} unit(s) recorded as process waste` });
      }
      remainingConsumed -= consume;
      remainingWaste -= wasteTake;
    }
    if (remainingConsumed > 0 || remainingWaste > 0) throw new Error(`PRODUCTION_MATERIAL_ALLOCATION_MISMATCH:${line.componentVariant.sku}`);
  }

  const labourCost = Math.max(0, n(input.labourCost));
  const overheadCost = Math.max(0, n(input.overheadCost));
  const cost = phase92ProductionCost(actualMaterialCost, labourCost, overheadCost, asInt(input.actualOutputQty));
  const yieldVariancePercent = phase92YieldVariance(order.plannedOutputQty, input.actualOutputQty);
  const variance = phase92VarianceStatus({
    yieldVariancePercent,
    yieldTolerancePercent: n(order.bom.yieldTolerancePercent),
    plannedMaterialQty,
    actualMaterialQty,
    plannedMaterialCost: n(order.plannedMaterialCost),
    actualMaterialCost,
  });

  const quarantine = await db.warehouseBin.findFirst({ where: { warehouseId: order.warehouseId, isActive: true, kind: "QUARANTINE" }, orderBy: { createdAt: "asc" } });
  const duplicate = await db.inventoryBatch.findFirst({ where: { warehouseId: order.warehouseId, variantId: order.outputVariantId, batchCode: input.outputBatchCode.trim() } });
  if (duplicate) throw new Error("PRODUCTION_OUTPUT_BATCH_DUPLICATE");
  const batch = await db.inventoryBatch.create({ data: {
    variantId: order.outputVariantId,
    warehouseId: order.warehouseId,
    binId: quarantine?.id || null,
    batchCode: input.outputBatchCode.trim(),
    status: "QUARANTINED",
    qualityStatus: "PENDING",
    quantityOnHand: asInt(input.actualOutputQty),
    quantityReserved: 0,
    quantityBlocked: asInt(input.actualOutputQty),
    unitCost: cost.unit,
    manufacturedAt: input.manufacturedAt || new Date(),
    expiryDate: input.expiryDate || null,
    sourceType: "MANUFACTURING",
    sourceReference: order.productionNumber,
  }});
  await writeBatchMovement(db, batch, { type: "PRODUCTION_OUTPUT", onHandChange: asInt(input.actualOutputQty), referenceType: "PRODUCTION_ORDER", referenceId: order.id, actorUserId: input.actorUserId, note: `Finished production output · ${order.productionNumber}` });
  await writeBatchMovement(db, batch, { type: "QA_HOLD", blockedChange: asInt(input.actualOutputQty), referenceType: "PRODUCTION_ORDER", referenceId: order.id, actorUserId: input.actorUserId, note: "Finished production batch held for Phase 91 QA release" });

  return db.productionOrder.update({ where: { id: order.id }, data: {
    status: "QA_PENDING",
    actualOutputQty: asInt(input.actualOutputQty),
    actualMaterialCost: round2(actualMaterialCost),
    labourCost: round2(labourCost),
    overheadCost: round2(overheadCost),
    totalProductionCost: cost.total,
    unitProductionCost: cost.unit,
    yieldVariancePercent,
    varianceStatus: variance.status,
    outputBatchCode: input.outputBatchCode.trim(),
    outputBatchId: batch.id,
    expiryDate: input.expiryDate || null,
    completedAt: new Date(),
    completedByUserId: input.actorUserId || null,
  }, include: { outputBatch: true, outputVariant: { include: { product: true } }, materials: { include: { componentVariant: { include: { product: true } }, allocations: { include: { batch: true } } } }, bom: true } });
}

export async function phase92ProductionTrace(db: any, productionOrderId: string) {
  const order = await db.productionOrder.findUnique({ where: { id: productionOrderId }, include: {
    bom: true,
    outputVariant: { include: { product: true } },
    outputBatch: { include: { orderAllocations: { include: { order: { select: { id: true, orderNumber: true, customerName: true, status: true } } } }, qualityInspections: { include: { tests: true }, orderBy: { createdAt: "desc" }, take: 2 } } },
    materials: { include: { componentVariant: { include: { product: true } }, allocations: { include: { batch: { include: { goodsReceiptItem: { include: { goodsReceipt: { include: { purchaseOrder: { include: { supplier: true } } } } } } } } } } } },
  }});
  if (!order) throw new Error("PRODUCTION_ORDER_NOT_FOUND");
  return order;
}

export async function phase92ManufacturingOverview(db: any) {
  const [boms, orders, variants, warehouses] = await Promise.all([
    db.manufacturingBom.findMany({ include: { outputVariant: { include: { product: true } }, items: { include: { componentVariant: { include: { product: true } } }, orderBy: { sortOrder: "asc" } } }, orderBy: [{ outputVariantId: "asc" }, { version: "desc" }], take: 200 }),
    db.productionOrder.findMany({ include: { outputVariant: { include: { product: true } }, warehouse: true, bom: true, outputBatch: true, materials: { include: { componentVariant: { include: { product: true } }, allocations: true } } }, orderBy: { createdAt: "desc" }, take: PHASE92_MANUFACTURING_POLICY.maxOpenOrders }),
    db.productVariant.findMany({ include: { product: true }, orderBy: [{ product: { name: "asc" } }, { name: "asc" }], take: 1000 }),
    db.warehouse.findMany({ where: { status: "ACTIVE" }, include: { bins: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
  ]);
  const activeOrders = orders.filter((o: any) => !["RELEASED", "QA_REJECTED", "CANCELLED"].includes(o.status));
  const orderReadiness = new Map<string, any>();
  const approvedOrders = activeOrders.filter((o: any) => o.status === "APPROVED");
  for (const order of approvedOrders.slice(0, 60)) {
    const lines = await phase92MaterialAvailability(db, order.warehouseId, order.materials || []);
    orderReadiness.set(order.id, { lines, ready: lines.every((x: any) => x.ready), shortageQty: lines.reduce((sum: number, x: any) => sum + asInt(x.shortageQty), 0) });
  }
  const hydratedOrders = orders.map((o: any) => ({ ...o, materialAvailability: orderReadiness.get(o.id) || null }));
  const readyApproved = approvedOrders.filter((o: any) => orderReadiness.get(o.id)?.ready === true).length;
  const shortageApproved = approvedOrders.filter((o: any) => orderReadiness.get(o.id)?.ready === false).length;
  const materialReviewPending = Math.max(0, approvedOrders.length - orderReadiness.size);
  const summary = {
    activeBoms: boms.filter((b: any) => b.status === "ACTIVE").length,
    openOrders: activeOrders.length,
    materialReady: readyApproved,
    materialShortage: shortageApproved,
    materialReviewPending,
    inProduction: activeOrders.filter((o: any) => ["MATERIAL_ISSUED", "IN_PRODUCTION"].includes(o.status)).length,
    qaPending: orders.filter((o: any) => o.status === "QA_PENDING").length,
    released: orders.filter((o: any) => o.status === "RELEASED").length,
    yieldVariance: orders.filter((o: any) => ["YIELD_VARIANCE", "MULTIPLE_VARIANCE"].includes(o.varianceStatus)).length,
  };
  return { summary, boms, orders: hydratedOrders, variants, warehouses };
}
