import type { Prisma } from "../generated/prisma/client";
import { phase90ApplyInventoryMutation } from "./warehouse-inventory.service";

export type InventoryMovementTypeName =
  | "OPENING_STOCK"
  | "ADMIN_ADJUSTMENT"
  | "ORDER_RESERVATION"
  | "ORDER_RELEASE"
  | "ORDER_CANCELLATION"
  | "RETURN_RESTOCK"
  | "RETURN_REPLACEMENT"
  | "REFUND_RESTOCK"
  | "PURCHASE_RECEIPT"
  | "WAREHOUSE_QUARANTINE"
  | "WAREHOUSE_RELEASE"
  | "WAREHOUSE_WRITE_OFF"
  | "WAREHOUSE_COUNT_ADJUSTMENT"
  | "QA_RELEASE"
  | "QA_REJECT"
  | "PRODUCTION_ISSUE"
  | "PRODUCTION_RETURN"
  | "MAINTENANCE_ISSUE"
  | "ERP_SYNC"
  | "CORRECTION";

export type InventoryMovementSourceName = "ADMIN" | "CHECKOUT" | "ORDER" | "RETURN" | "PURCHASE" | "WAREHOUSE" | "QUALITY" | "MANUFACTURING" | "MAINTENANCE" | "ERP" | "SYSTEM";

export function availableToSell(variant: { stockQuantity?: number | null; safetyStock?: number | null }) {
  return Math.max(0, Number(variant.stockQuantity || 0) - Math.max(0, Number(variant.safetyStock || 0)));
}

export function inventoryState(variant: { stockQuantity?: number | null; safetyStock?: number | null; lowStockThreshold?: number | null }) {
  const onHand = Math.max(0, Number(variant.stockQuantity || 0));
  const safetyStock = Math.max(0, Number(variant.safetyStock || 0));
  const available = Math.max(0, onHand - safetyStock);
  const lowAt = Math.max(0, Number(variant.lowStockThreshold || 0));
  return {
    onHand,
    safetyStock,
    available,
    status: available <= 0 ? "OUT_OF_STOCK" : available <= lowAt ? "LOW_STOCK" : "IN_STOCK",
  } as const;
}

type MutationInput = {
  variantId: string;
  delta: number;
  type: InventoryMovementTypeName;
  source: InventoryMovementSourceName;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  actorUserId?: string | null;
  enforceSafetyStock?: boolean;
  batchCode?: string | null;
  expiryDate?: Date | null;
  unitCost?: number | null;
  goodsReceiptItemId?: string | null;
};

export async function adjustInventory(tx: Prisma.TransactionClient, input: MutationInput) {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    const current = await tx.productVariant.findUnique({ where: { id: input.variantId } });
    if (!current) throw new Error("VARIANT_NOT_FOUND");
    return current;
  }

  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`inventory:${input.variantId}`}))`;
  const before = await tx.productVariant.findUnique({
    where: { id: input.variantId },
    select: { id: true, sku: true, stockQuantity: true, safetyStock: true, isActive: true },
  });
  if (!before) throw new Error("VARIANT_NOT_FOUND");

  const provisionalStockAfter = Number(before.stockQuantity) + input.delta;
  if (provisionalStockAfter < 0) throw new Error(`OUT_OF_STOCK:${before.sku}`);
  if (input.enforceSafetyStock && provisionalStockAfter < Math.max(0, Number(before.safetyStock || 0))) {
    throw new Error(`OUT_OF_STOCK:${before.sku}`);
  }

  const phase90Mutation = await phase90ApplyInventoryMutation(tx, {
    variantId: input.variantId,
    delta: input.delta,
    inventoryType: input.type,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    actorUserId: input.actorUserId,
    reason: input.reason,
    batchCode: input.batchCode,
    expiryDate: input.expiryDate,
    unitCost: input.unitCost,
    goodsReceiptItemId: input.goodsReceiptItemId,
  });
  const effectiveDelta = phase90Mutation?.effectiveDelta ?? input.delta;
  const stockAfter = Number(before.stockQuantity) + effectiveDelta;

  const updated = await tx.productVariant.update({
    where: { id: input.variantId },
    data: { stockQuantity: stockAfter },
  });

  await tx.inventoryMovement.create({
    data: {
      variantId: input.variantId,
      type: input.type as any,
      source: input.source as any,
      quantityChange: effectiveDelta,
      stockBefore: Number(before.stockQuantity),
      stockAfter,
      safetyStockSnapshot: Math.max(0, Number(before.safetyStock || 0)),
      reason: input.reason || null,
      referenceType: input.referenceType || null,
      referenceId: input.referenceId || null,
      actorUserId: input.actorUserId || null,
    },
  });

  return updated;
}

type SetInput = Omit<MutationInput, "delta"> & { nextQuantity: number };

export async function setInventoryQuantity(tx: Prisma.TransactionClient, input: SetInput) {
  if (!Number.isInteger(input.nextQuantity) || input.nextQuantity < 0) throw new Error("INVALID_STOCK_QUANTITY");
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`inventory:${input.variantId}`}))`;
  const before = await tx.productVariant.findUnique({
    where: { id: input.variantId },
    select: { id: true, sku: true, stockQuantity: true, safetyStock: true },
  });
  if (!before) throw new Error("VARIANT_NOT_FOUND");
  if (before.stockQuantity === input.nextQuantity) return tx.productVariant.findUniqueOrThrow({ where: { id: input.variantId } });

  await phase90ApplyInventoryMutation(tx, {
    variantId: input.variantId,
    delta: input.nextQuantity - Number(before.stockQuantity),
    inventoryType: input.type,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    actorUserId: input.actorUserId,
    reason: input.reason,
  });

  const updated = await tx.productVariant.update({
    where: { id: input.variantId },
    data: { stockQuantity: input.nextQuantity },
  });
  await tx.inventoryMovement.create({
    data: {
      variantId: input.variantId,
      type: input.type as any,
      source: input.source as any,
      quantityChange: input.nextQuantity - Number(before.stockQuantity),
      stockBefore: Number(before.stockQuantity),
      stockAfter: input.nextQuantity,
      safetyStockSnapshot: Math.max(0, Number(before.safetyStock || 0)),
      reason: input.reason || null,
      referenceType: input.referenceType || null,
      referenceId: input.referenceId || null,
      actorUserId: input.actorUserId || null,
    },
  });
  return updated;
}
