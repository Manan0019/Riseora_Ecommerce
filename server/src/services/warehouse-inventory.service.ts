import type { Prisma } from "../generated/prisma/client";

export const PHASE90_WAREHOUSE_POLICY = {
  nearExpiryDays: 30,
  expirySweepMaxBatches: 500,
  cycleCountMaxItems: 1000,
  recallMaxBatches: 100,
} as const;

const dayMs = 24 * 60 * 60 * 1000;
const asInt = (value: unknown) => Math.max(0, Math.trunc(Number(value || 0)));
const cleanCode = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 80);

export type Phase90BatchLike = {
  id: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityBlocked: number;
  expiryDate?: Date | string | null;
  receivedAt?: Date | string | null;
  status?: string | null;
};

export function phase90AvailableQty(batch: Phase90BatchLike) {
  return Math.max(0, asInt(batch.quantityOnHand) - asInt(batch.quantityReserved) - asInt(batch.quantityBlocked));
}

export function phase90ExpiryState(expiryDate: Date | string | null | undefined, now = new Date()) {
  if (!expiryDate) return "NO_EXPIRY" as const;
  const expiry = new Date(expiryDate);
  const days = Math.floor((expiry.getTime() - now.getTime()) / dayMs);
  if (days < 0) return "EXPIRED" as const;
  if (days <= PHASE90_WAREHOUSE_POLICY.nearExpiryDays) return "NEAR_EXPIRY" as const;
  return "HEALTHY" as const;
}

export function phase90FefoOrder<T extends Phase90BatchLike>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const ae = a.expiryDate ? new Date(a.expiryDate).getTime() : Number.MAX_SAFE_INTEGER;
    const be = b.expiryDate ? new Date(b.expiryDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (ae !== be) return ae - be;
    const ar = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
    const br = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
    return ar - br;
  });
}

export function phase90CycleCountVariance(systemQty: number, countedQty: number, reservedQty = 0, blockedQty = 0) {
  const system = asInt(systemQty);
  const counted = asInt(countedQty);
  const reserved = asInt(reservedQty);
  const blocked = asInt(blockedQty);
  const minimumPhysical = reserved + blocked;
  const variance = counted - system;
  return {
    variance,
    minimumPhysical,
    blocked: counted < minimumPhysical,
    availableBefore: Math.max(0, system - reserved - blocked),
    availableAfter: Math.max(0, counted - reserved - blocked),
  };
}

async function defaultWarehouse(tx: any) {
  const warehouse = await tx.warehouse.findFirst({ where: { status: "ACTIVE", isDefault: true }, orderBy: { createdAt: "asc" } })
    || await tx.warehouse.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!warehouse) throw new Error("WAREHOUSE_DEFAULT_MISSING");
  const pickBin = await tx.warehouseBin.findFirst({ where: { warehouseId: warehouse.id, isActive: true, kind: "PICK" }, orderBy: { createdAt: "asc" } });
  return { warehouse, pickBin };
}

async function writeBatchMovement(tx: any, batch: any, input: {
  type: string;
  onHandChange?: number;
  reservedChange?: number;
  blockedChange?: number;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
  actorUserId?: string | null;
}) {
  return tx.inventoryBatchMovement.create({ data: {
    batchId: batch.id,
    variantId: batch.variantId,
    type: input.type as any,
    onHandChange: input.onHandChange || 0,
    reservedChange: input.reservedChange || 0,
    blockedChange: input.blockedChange || 0,
    onHandAfter: batch.quantityOnHand,
    reservedAfter: batch.quantityReserved,
    blockedAfter: batch.quantityBlocked,
    referenceType: input.referenceType || null,
    referenceId: input.referenceId || null,
    note: input.note || null,
    actorUserId: input.actorUserId || null,
  }});
}

async function availableBatches(tx: any, variantId: string) {
  const rows = await tx.inventoryBatch.findMany({
    where: { variantId, status: "AVAILABLE", qualityStatus: { in: ["RELEASED", "CONDITIONAL_RELEASE"] } },
    orderBy: { receivedAt: "asc" },
  });
  const now = Date.now();
  return phase90FefoOrder(rows.filter((row: any) => phase90AvailableQty(row) > 0 && (!row.expiryDate || new Date(row.expiryDate).getTime() >= now)));
}

async function syntheticBatch(tx: any, input: {
  variantId: string;
  quantity: number;
  batchCode?: string | null;
  expiryDate?: Date | null;
  unitCost?: number | null;
  goodsReceiptItemId?: string | null;
  sourceType?: string | null;
  sourceReference?: string | null;
}) {
  const { warehouse, pickBin } = await defaultWarehouse(tx);
  const base = input.batchCode?.trim() || `${input.sourceType || "STOCK"}-${(input.sourceReference || Date.now().toString()).slice(0, 24)}`;
  const batchCode = cleanCode(base) || `STOCK-${Date.now()}`;
  const existing = await tx.inventoryBatch.findFirst({ where: { warehouseId: warehouse.id, variantId: input.variantId, batchCode } });
  if (existing) {
    const updated = await tx.inventoryBatch.update({
      where: { id: existing.id },
      data: {
        quantityOnHand: { increment: input.quantity },
        ...(input.expiryDate && !existing.expiryDate ? { expiryDate: input.expiryDate } : {}),
        ...(input.unitCost != null ? { unitCost: input.unitCost } : {}),
        ...(input.goodsReceiptItemId && !existing.goodsReceiptItemId ? { goodsReceiptItemId: input.goodsReceiptItemId } : {}),
        status: "AVAILABLE",
      },
    });
    return updated;
  }
  return tx.inventoryBatch.create({ data: {
    variantId: input.variantId,
    warehouseId: warehouse.id,
    binId: pickBin?.id || null,
    goodsReceiptItemId: input.goodsReceiptItemId || null,
    batchCode,
    status: "AVAILABLE",
    quantityOnHand: input.quantity,
    quantityReserved: 0,
    quantityBlocked: 0,
    unitCost: input.unitCost ?? null,
    expiryDate: input.expiryDate || null,
    sourceType: input.sourceType || null,
    sourceReference: input.sourceReference || null,
  }});
}

export async function phase90ApplyInventoryMutation(tx: Prisma.TransactionClient, input: {
  variantId: string;
  delta: number;
  inventoryType: string;
  referenceType?: string | null;
  referenceId?: string | null;
  actorUserId?: string | null;
  reason?: string | null;
  batchCode?: string | null;
  expiryDate?: Date | null;
  unitCost?: number | null;
  goodsReceiptItemId?: string | null;
}) {
  const client: any = tx;
  const delta = Math.trunc(input.delta);
  if (!delta) return;

  if (delta < 0) {
    let remaining = Math.abs(delta);
    const rows = await availableBatches(client, input.variantId);
    const reservation = input.inventoryType === "ORDER_RESERVATION";
    const directShipment = input.inventoryType === "RETURN_REPLACEMENT";
    for (const row of rows) {
      if (remaining <= 0) break;
      const free = phase90AvailableQty(row);
      const take = Math.min(remaining, free);
      if (!take) continue;
      const updated = await client.inventoryBatch.update({
        where: { id: row.id },
        data: reservation
          ? { quantityReserved: { increment: take } }
          : { quantityOnHand: { decrement: take }, ...(row.quantityOnHand - take === 0 ? { status: "DEPLETED" } : {}) },
      });
      await writeBatchMovement(client, updated, {
        type: reservation ? "RESERVATION" : directShipment ? "SHIPMENT" : "ADJUSTMENT",
        onHandChange: reservation ? 0 : -take,
        reservedChange: reservation ? take : 0,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        note: input.reason,
        actorUserId: input.actorUserId,
      });
      remaining -= take;
    }
    if (remaining > 0) throw new Error(`BATCH_STOCK_INSUFFICIENT:${input.variantId}:${remaining}`);
    return { effectiveDelta: delta };
  }

  if (["ORDER_RELEASE", "ORDER_CANCELLATION"].includes(input.inventoryType) && input.referenceId) {
    let remaining = delta;
    let effectiveDelta = 0;
    let reservationReferenceType = input.referenceType || null;
    let reservationReferenceId = input.referenceId;
    if (input.inventoryType === "ORDER_CANCELLATION" && input.referenceType === "ORDER") {
      const order = await client.order.findUnique({ where: { id: input.referenceId }, select: { checkoutRequestKey: true } });
      if (order?.checkoutRequestKey) { reservationReferenceType = "CHECKOUT_REQUEST"; reservationReferenceId = order.checkoutRequestKey; }
    }
    const reservations = await client.inventoryBatchMovement.findMany({
      where: { variantId: input.variantId, type: "RESERVATION", referenceType: reservationReferenceType, referenceId: reservationReferenceId },
      orderBy: { createdAt: "asc" },
    });
    const releases = await client.inventoryBatchMovement.findMany({
      where: { variantId: input.variantId, type: "RELEASE", OR: [{ referenceId: input.referenceId }, { referenceId: reservationReferenceId }] },
    });
    const releasedByBatch = new Map<string, number>();
    for (const row of releases) releasedByBatch.set(row.batchId, (releasedByBatch.get(row.batchId) || 0) + Math.abs(asInt(row.reservedChange)));
    for (const row of reservations) {
      if (remaining <= 0) break;
      const already = releasedByBatch.get(row.batchId) || 0;
      const reserv = Math.max(0, asInt(row.reservedChange) - already);
      if (!reserv) continue;
      const batch = await client.inventoryBatch.findUnique({ where: { id: row.batchId } });
      if (!batch) continue;
      const release = Math.min(remaining, reserv, asInt(batch.quantityReserved));
      if (!release) continue;
      const remainsBlocked = ["RECALLED", "EXPIRED", "QUARANTINED"].includes(String(batch.status));
      const updated = await client.inventoryBatch.update({ where: { id: batch.id }, data: remainsBlocked
        ? { quantityReserved: { decrement: release }, quantityBlocked: { increment: release } }
        : { quantityReserved: { decrement: release }, ...(batch.status === "DEPLETED" && batch.quantityOnHand > 0 ? { status: "AVAILABLE" } : {}) } });
      await writeBatchMovement(client, updated, { type: "RELEASE", reservedChange: -release, blockedChange: remainsBlocked ? release : 0, referenceType: input.referenceType, referenceId: input.referenceId, note: remainsBlocked ? `${input.reason || "Stock release"} · retained on warehouse hold (${batch.status})` : input.reason, actorUserId: input.actorUserId });
      if (!remainsBlocked) effectiveDelta += release;
      remaining -= release;
    }
    if (remaining <= 0) return { effectiveDelta };
    const legacy = await syntheticBatch(client, { variantId: input.variantId, quantity: remaining, batchCode: `LEGACY-RESTORE-${input.referenceId.slice(0, 12)}`, sourceType: input.inventoryType, sourceReference: input.referenceId });
    await writeBatchMovement(client, legacy, { type: "RELEASE", onHandChange: remaining, referenceType: input.referenceType, referenceId: input.referenceId, note: `${input.reason || "Stock release"} · legacy trace restoration`, actorUserId: input.actorUserId });
    effectiveDelta += remaining;
    return { effectiveDelta };
  }

  const batch = await syntheticBatch(client, {
    variantId: input.variantId,
    quantity: delta,
    batchCode: input.batchCode,
    expiryDate: input.expiryDate,
    unitCost: input.unitCost,
    goodsReceiptItemId: input.goodsReceiptItemId,
    sourceType: input.inventoryType,
    sourceReference: input.referenceId || null,
  });
  await writeBatchMovement(client, batch, {
    type: input.inventoryType === "PURCHASE_RECEIPT" ? "RECEIPT" : ["RETURN_RESTOCK", "REFUND_RESTOCK"].includes(input.inventoryType) ? "RETURN_RESTOCK" : "ADJUSTMENT",
    onHandChange: delta,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    note: input.reason,
    actorUserId: input.actorUserId,
  });
  return { effectiveDelta: delta };
}

export async function phase90CommitOrderReservations(tx: Prisma.TransactionClient, orderId: string) {
  const client: any = tx;
  const order = await client.order.findUnique({ where: { id: orderId }, select: { checkoutRequestKey: true } });
  const reservationReferenceType = order?.checkoutRequestKey ? "CHECKOUT_REQUEST" : "ORDER";
  const reservationReferenceId = order?.checkoutRequestKey || orderId;
  const reservations = await client.inventoryBatchMovement.findMany({ where: { type: "RESERVATION", referenceType: reservationReferenceType, referenceId: reservationReferenceId }, orderBy: { createdAt: "asc" } });
  if (!reservations.length) return { allocations: 0, quantity: 0, legacyTraceGap: true };
  const shipments = await client.inventoryBatchMovement.findMany({ where: { type: "SHIPMENT", referenceType: "ORDER", referenceId: orderId } });
  const shipped = new Map<string, number>();
  for (const row of shipments) shipped.set(row.batchId, (shipped.get(row.batchId) || 0) + Math.abs(asInt(row.onHandChange)));
  let allocationCount = 0, quantity = 0;
  for (const row of reservations) {
    const already = shipped.get(row.batchId) || 0;
    const outstanding = Math.max(0, asInt(row.reservedChange) - already);
    if (!outstanding) continue;
    const batch = await client.inventoryBatch.findUnique({ where: { id: row.batchId } });
    if (!batch || batch.status !== "AVAILABLE" || !["RELEASED","CONDITIONAL_RELEASE"].includes(String(batch.qualityStatus)) || batch.quantityReserved < outstanding || batch.quantityOnHand < outstanding) throw new Error("BATCH_RESERVATION_INTEGRITY_BLOCKED");
    const updated = await client.inventoryBatch.update({ where: { id: batch.id }, data: { quantityOnHand: { decrement: outstanding }, quantityReserved: { decrement: outstanding }, ...(batch.quantityOnHand - outstanding === 0 ? { status: "DEPLETED" } : {}) } });
    await writeBatchMovement(client, updated, { type: "SHIPMENT", onHandChange: -outstanding, reservedChange: -outstanding, referenceType: "ORDER", referenceId: orderId, note: "FEFO batch committed to shipped order" });
    await client.orderBatchAllocation.upsert({
      where: { orderId_variantId_batchId: { orderId, variantId: row.variantId, batchId: row.batchId } },
      create: { orderId, variantId: row.variantId, batchId: row.batchId, quantity: outstanding },
      update: { quantity: { increment: outstanding }, shippedAt: new Date() },
    });
    allocationCount += 1; quantity += outstanding;
  }
  return { allocations: allocationCount, quantity, legacyTraceGap: false };
}

async function directAggregateMovement(tx: any, input: { variantId: string; delta: number; type: string; reason: string; referenceType: string; referenceId: string; actorUserId?: string | null }) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`inventory:${input.variantId}`}))`;
  const before = await tx.productVariant.findUnique({ where: { id: input.variantId }, select: { stockQuantity: true, safetyStock: true } });
  if (!before) throw new Error("VARIANT_NOT_FOUND");
  const stockAfter = Number(before.stockQuantity) + input.delta;
  if (stockAfter < 0) throw new Error("WAREHOUSE_AGGREGATE_STOCK_BLOCKED");
  await tx.productVariant.update({ where: { id: input.variantId }, data: { stockQuantity: stockAfter } });
  await tx.inventoryMovement.create({ data: { variantId: input.variantId, type: input.type as any, source: "WAREHOUSE" as any, quantityChange: input.delta, stockBefore: Number(before.stockQuantity), stockAfter, safetyStockSnapshot: Math.max(0, Number(before.safetyStock || 0)), reason: input.reason, referenceType: input.referenceType, referenceId: input.referenceId, actorUserId: input.actorUserId || null } });
}

export async function phase90BlockBatch(tx: Prisma.TransactionClient, input: { batchId: string; mode: "QUARANTINE" | "RECALL" | "EXPIRED"; referenceType: string; referenceId: string; actorUserId?: string | null; note?: string | null }) {
  const client: any = tx;
  const batch = await client.inventoryBatch.findUnique({ where: { id: input.batchId } });
  if (!batch) throw new Error("BATCH_NOT_FOUND");
  const available = phase90AvailableQty(batch);
  if (available <= 0) {
    if (input.mode === "RECALL" && batch.status !== "DEPLETED" && batch.status !== "RECALLED") {
      const recalled = await client.inventoryBatch.update({ where: { id: batch.id }, data: { status: "RECALLED" } });
      await writeBatchMovement(client, recalled, { type: "RECALL", referenceType: input.referenceType, referenceId: input.referenceId, actorUserId: input.actorUserId, note: input.note });
      return { batch: recalled, blockedQty: 0 };
    }
    return { batch, blockedQty: 0 };
  }
  await directAggregateMovement(client, { variantId: batch.variantId, delta: -available, type: "WAREHOUSE_QUARANTINE", reason: input.note || `${input.mode} stock hold`, referenceType: input.referenceType, referenceId: input.referenceId, actorUserId: input.actorUserId });
  const status = input.mode === "RECALL" ? "RECALLED" : input.mode === "EXPIRED" ? "EXPIRED" : "QUARANTINED";
  const updated = await client.inventoryBatch.update({ where: { id: batch.id }, data: { quantityBlocked: { increment: available }, status } });
  await writeBatchMovement(client, updated, { type: input.mode === "RECALL" ? "RECALL" : input.mode === "EXPIRED" ? "EXPIRY_HOLD" : "QUARANTINE", blockedChange: available, referenceType: input.referenceType, referenceId: input.referenceId, actorUserId: input.actorUserId, note: input.note });
  return { batch: updated, blockedQty: available };
}

export async function phase90ReleaseQuarantine(tx: Prisma.TransactionClient, batchId: string, actorUserId: string | null, note?: string | null) {
  const client: any = tx;
  const batch = await client.inventoryBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error("BATCH_NOT_FOUND");
  if (batch.status !== "QUARANTINED") throw new Error("BATCH_RELEASE_BLOCKED");
  if (!["RELEASED","CONDITIONAL_RELEASE"].includes(String(batch.qualityStatus))) throw new Error("BATCH_QA_RELEASE_REQUIRED");
  if (batch.expiryDate && new Date(batch.expiryDate).getTime() < Date.now()) throw new Error("BATCH_EXPIRED_RELEASE_BLOCKED");
  const qty = asInt(batch.quantityBlocked);
  if (!qty) return batch;
  await directAggregateMovement(client, { variantId: batch.variantId, delta: qty, type: "WAREHOUSE_RELEASE", reason: note || "Warehouse quarantine released", referenceType: "BATCH", referenceId: batch.id, actorUserId });
  const updated = await client.inventoryBatch.update({ where: { id: batch.id }, data: { quantityBlocked: 0, status: "AVAILABLE" } });
  await writeBatchMovement(client, updated, { type: "RELEASE_QUARANTINE", blockedChange: -qty, referenceType: "BATCH", referenceId: batch.id, actorUserId, note });
  return updated;
}

export async function phase90WriteOffBatch(tx: Prisma.TransactionClient, batchId: string, qty: number, actorUserId: string | null, note: string) {
  const client: any = tx;
  const batch = await client.inventoryBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error("BATCH_NOT_FOUND");
  const quantity = asInt(qty);
  if (!quantity || quantity > asInt(batch.quantityOnHand) - asInt(batch.quantityReserved)) throw new Error("BATCH_WRITEOFF_BLOCKED");
  const blockedConsumed = Math.min(quantity, asInt(batch.quantityBlocked));
  const availableConsumed = quantity - blockedConsumed;
  if (availableConsumed > 0) await directAggregateMovement(client, { variantId: batch.variantId, delta: -availableConsumed, type: "WAREHOUSE_WRITE_OFF", reason: note, referenceType: "BATCH", referenceId: batch.id, actorUserId });
  const updated = await client.inventoryBatch.update({ where: { id: batch.id }, data: { quantityOnHand: { decrement: quantity }, ...(blockedConsumed ? { quantityBlocked: { decrement: blockedConsumed } } : {}), ...(batch.quantityOnHand - quantity === 0 ? { status: "DEPLETED" } : {}) } });
  await writeBatchMovement(client, updated, { type: "WRITE_OFF", onHandChange: -quantity, blockedChange: -blockedConsumed, referenceType: "BATCH", referenceId: batch.id, actorUserId, note });
  return updated;
}

export async function phase90WarehouseOverview(prisma: any) {
  const now = new Date();
  const near = new Date(now.getTime() + PHASE90_WAREHOUSE_POLICY.nearExpiryDays * dayMs);
  const [warehouses, batches, counts, recalls] = await Promise.all([
    prisma.warehouse.findMany({ include: { bins: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    prisma.inventoryBatch.findMany({ include: { variant: { select: { sku: true, name: true, product: { select: { name: true } } } }, warehouse: { select: { code: true, name: true } }, bin: { select: { code: true, name: true } } }, orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }], take: 500 }),
    prisma.cycleCount.findMany({ include: { warehouse: { select: { code: true, name: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.inventoryRecall.findMany({ include: { batches: { include: { batch: { include: { variant: { select: { sku: true, product: { select: { name: true } } } } } } } } }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);
  const summary = { batches: batches.length, sellableUnits: 0, reservedUnits: 0, blockedUnits: 0, expiredBatches: 0, nearExpiryBatches: 0, quarantinedBatches: 0, recalledBatches: 0, openCounts: counts.filter((x: any) => !["POSTED", "CANCELLED"].includes(x.status)).length, activeRecalls: recalls.filter((x: any) => x.status === "ACTIVE").length };
  for (const batch of batches) {
    summary.sellableUnits += phase90AvailableQty(batch);
    summary.reservedUnits += asInt(batch.quantityReserved);
    summary.blockedUnits += asInt(batch.quantityBlocked);
    const expiry = phase90ExpiryState(batch.expiryDate, now);
    if (expiry === "EXPIRED") summary.expiredBatches += 1;
    if (expiry === "NEAR_EXPIRY") summary.nearExpiryBatches += 1;
    if (batch.status === "QUARANTINED") summary.quarantinedBatches += 1;
    if (batch.status === "RECALLED") summary.recalledBatches += 1;
  }
  return { summary, warehouses, batches: batches.map((b: any) => ({ ...b, availableQty: phase90AvailableQty(b), expiryState: phase90ExpiryState(b.expiryDate, now), nearExpiryAt: near })), counts, recalls };
}

export async function phase90PostCycleCount(tx: Prisma.TransactionClient, countId: string, actorUserId: string | null) {
  const client: any = tx;
  const count = await client.cycleCount.findUnique({ where: { id: countId }, include: { items: { include: { batch: true } } } });
  if (!count) throw new Error("CYCLE_COUNT_NOT_FOUND");
  if (count.status !== "APPROVED") throw new Error("CYCLE_COUNT_NOT_APPROVED");
  for (const item of count.items) {
    if (item.countedQty == null) throw new Error("CYCLE_COUNT_INCOMPLETE");
    const batch = item.batch;
    if (Number(batch.quantityOnHand) !== Number(item.systemQty)) throw new Error("CYCLE_COUNT_STALE_SNAPSHOT");
    const variance = phase90CycleCountVariance(item.systemQty, item.countedQty, batch.quantityReserved, batch.quantityBlocked);
    if (variance.blocked) throw new Error("CYCLE_COUNT_RESERVED_BLOCKED");
    if (variance.variance === 0) continue;
    const aggregateDelta = variance.availableAfter - variance.availableBefore;
    if (aggregateDelta !== 0) await directAggregateMovement(client, { variantId: item.variantId, delta: aggregateDelta, type: "WAREHOUSE_COUNT_ADJUSTMENT", reason: item.reason || `Cycle count ${count.countNumber}`, referenceType: "CYCLE_COUNT", referenceId: count.id, actorUserId });
    const updated = await client.inventoryBatch.update({ where: { id: batch.id }, data: { quantityOnHand: item.countedQty, ...(item.countedQty === 0 ? { status: "DEPLETED" } : {}) } });
    await writeBatchMovement(client, updated, { type: "CYCLE_COUNT", onHandChange: variance.variance, referenceType: "CYCLE_COUNT", referenceId: count.id, actorUserId, note: item.reason || null });
  }
  return client.cycleCount.update({ where: { id: count.id }, data: { status: "POSTED", postedAt: new Date(), postedByUserId: actorUserId }, include: { items: true } });
}
