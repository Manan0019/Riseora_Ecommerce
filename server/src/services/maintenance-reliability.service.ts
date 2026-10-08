import { randomBytes } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { adjustInventory, availableToSell } from "./inventory.service";

export const PHASE95_MAINTENANCE_POLICY = {
  defaultWindowDays: 30,
  maxWindowDays: 365,
  overdueWarningDays: 7,
  maxSpareIssueQty: 100000,
  maxLabourMinutes: 100000,
  maxHourlyCost: 100000,
  maxOpenWorkOrdersPerAsset: 25,
} as const;

const n = (value: unknown) => Number(value || 0);
const i = (value: unknown) => Math.max(0, Math.trunc(n(value)));
const round2 = (value: number) => Number(value.toFixed(2));
const minuteDiff = (from: Date | string | null | undefined, to: Date | string | null | undefined) => {
  if (!from || !to) return 0;
  return Math.max(0, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 60000));
};

export function phase95MaintenanceWorkOrderNumber() {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `MWO-${day}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function phase95NextDue(input: { completedAt: Date; runtimeMinutes: number; intervalDays?: number | null; intervalRuntimeMinutes?: number | null }) {
  const nextDueAt = input.intervalDays && input.intervalDays > 0 ? new Date(input.completedAt.getTime() + input.intervalDays * 86400000) : null;
  const nextDueRuntimeMinutes = input.intervalRuntimeMinutes && input.intervalRuntimeMinutes > 0 ? i(input.runtimeMinutes) + i(input.intervalRuntimeMinutes) : null;
  return { nextDueAt, nextDueRuntimeMinutes };
}

export function phase95ReliabilityMetrics(input: { runtimeMinutes: number; breakdownMinutes: number; breakdownCount: number }) {
  const breakdowns = Math.max(0, i(input.breakdownCount));
  const mtbfMinutes = breakdowns > 0 ? round2(Math.max(0, n(input.runtimeMinutes)) / breakdowns) : null;
  const mttrMinutes = breakdowns > 0 ? round2(Math.max(0, n(input.breakdownMinutes)) / breakdowns) : null;
  const availabilityPercent = n(input.runtimeMinutes) + n(input.breakdownMinutes) > 0
    ? round2((n(input.runtimeMinutes) / (n(input.runtimeMinutes) + n(input.breakdownMinutes))) * 100)
    : 100;
  return { mtbfMinutes, mttrMinutes, availabilityPercent };
}

export async function phase95AssignAssetForExecution(tx: Prisma.TransactionClient, execution: any) {
  const db: any = tx;
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`maintenance-asset-pool:${execution.workCenterId}`}))`;
  const assertFree = async (asset: any) => {
    if (!asset || asset.workCenterId !== execution.workCenterId || asset.status !== "ACTIVE") throw new Error("EQUIPMENT_ASSET_UNAVAILABLE");
    const busy = await db.productionOperationExecution.count({ where: { equipmentAssetId: asset.id, id: { not: execution.id }, status: { in: ["IN_PROGRESS","PAUSED"] } } });
    if (busy) throw new Error("EQUIPMENT_ASSET_BUSY");
    return asset;
  };
  if (execution.equipmentAssetId) return assertFree(await db.equipmentAsset.findUnique({ where: { id: execution.equipmentAssetId } }));
  const preferredAssetId = execution.routingOperation?.equipmentAssetId || null;
  if (preferredAssetId) {
    const asset = await assertFree(await db.equipmentAsset.findUnique({ where: { id: preferredAssetId } }));
    await db.productionOperationExecution.update({ where: { id: execution.id }, data: { equipmentAssetId: asset.id } });
    return asset;
  }
  const totalAssets = await db.equipmentAsset.count({ where: { workCenterId: execution.workCenterId, status: { not: "RETIRED" } } });
  if (!totalAssets) return null; // backward compatible: work center may not yet have equipment master data.
  const asset = await db.equipmentAsset.findFirst({
    where: { workCenterId: execution.workCenterId, status: "ACTIVE", operationExecutions: { none: { status: { in: ["IN_PROGRESS","PAUSED"] } } } },
    orderBy: [{ cumulativeRuntimeMinutes: "asc" }, { assetCode: "asc" }],
  });
  if (!asset) throw new Error("EQUIPMENT_WORK_CENTER_UNAVAILABLE");
  await db.productionOperationExecution.update({ where: { id: execution.id }, data: { equipmentAssetId: asset.id } });
  return asset;
}

export async function phase95AccrueAssetRuntime(tx: Prisma.TransactionClient, assetId: string | null | undefined, runtimeMinutes: number) {
  if (!assetId || i(runtimeMinutes) <= 0) return;
  const db: any = tx;
  await db.equipmentAsset.update({ where: { id: assetId }, data: { cumulativeRuntimeMinutes: { increment: i(runtimeMinutes) } } });
}

export async function phase95CreateCorrectiveFromBreakdown(tx: Prisma.TransactionClient, input: { downtimeEventId: string; assetId?: string | null; reason: string; actorUserId?: string | null }) {
  const db: any = tx;
  if (!input.assetId) return null;
  await db.equipmentAsset.update({ where: { id: input.assetId }, data: { status: "BREAKDOWN" } });
  const existing = await db.maintenanceWorkOrder.findUnique({ where: { sourceDowntimeEventId: input.downtimeEventId } });
  if (existing) return existing;
  return db.maintenanceWorkOrder.create({ data: {
    workOrderNumber: phase95MaintenanceWorkOrderNumber(),
    assetId: input.assetId,
    sourceDowntimeEventId: input.downtimeEventId,
    type: "CORRECTIVE",
    priority: "CRITICAL",
    status: "IN_PROGRESS",
    title: `Breakdown · ${input.reason.trim().slice(0, 140)}`,
    description: input.reason.trim(),
    startedAt: new Date(),
    createdByUserId: input.actorUserId || null,
    approvedByUserId: input.actorUserId || null,
  }});
}

export async function phase95AssertBreakdownResolved(tx: Prisma.TransactionClient, downtimeEvent: any) {
  if (downtimeEvent?.category !== "BREAKDOWN" || !downtimeEvent?.equipmentAssetId) return;
  const db: any = tx;
  const asset = await db.equipmentAsset.findUnique({ where: { id: downtimeEvent.equipmentAssetId } });
  if (!asset || asset.status !== "ACTIVE") throw new Error("MAINTENANCE_RELEASE_REQUIRED");
}

export async function phase95IssueSpare(tx: Prisma.TransactionClient, input: { workOrderId: string; variantId: string; quantity: number; actorUserId?: string | null }) {
  const db: any = tx;
  const qty = i(input.quantity);
  if (qty <= 0 || qty > PHASE95_MAINTENANCE_POLICY.maxSpareIssueQty) throw new Error("MAINTENANCE_SPARE_QTY_INVALID");
  const workOrder = await db.maintenanceWorkOrder.findUnique({ where: { id: input.workOrderId } });
  if (!workOrder) throw new Error("MAINTENANCE_WORK_ORDER_NOT_FOUND");
  if (!['APPROVED','IN_PROGRESS'].includes(workOrder.status)) throw new Error("MAINTENANCE_SPARE_STATUS_BLOCKED");
  const variant = await db.productVariant.findUnique({ where: { id: input.variantId } });
  if (!variant || variant.inventoryRole !== "SPARE_PART") throw new Error("MAINTENANCE_SPARE_PART_REQUIRED");
  if (availableToSell(variant) < qty) throw new Error("MAINTENANCE_SPARE_OUT_OF_STOCK");
  const unitCost = Math.max(0, n(variant.costPrice));
  const totalCost = round2(unitCost * qty);
  await adjustInventory(tx, {
    variantId: variant.id,
    delta: -qty,
    type: "MAINTENANCE_ISSUE",
    source: "MAINTENANCE",
    reason: `Maintenance spare issue · ${workOrder.workOrderNumber}`,
    referenceType: "MAINTENANCE_WORK_ORDER",
    referenceId: workOrder.id,
    actorUserId: input.actorUserId || null,
    enforceSafetyStock: true,
  });
  const usage = await db.maintenanceSpareUsage.create({ data: { workOrderId: workOrder.id, variantId: variant.id, quantity: qty, unitCostSnapshot: unitCost, totalCost, issuedByUserId: input.actorUserId || null } });
  await db.maintenanceWorkOrder.update({ where: { id: workOrder.id }, data: { spareCost: { increment: totalCost }, totalCost: { increment: totalCost } } });
  return usage;
}

export async function phase95CompleteWorkOrder(tx: Prisma.TransactionClient, input: { workOrderId: string; labourMinutes: number; hourlyCost: number; rootCause?: string | null; correctiveAction?: string | null; technician?: string | null; actorUserId?: string | null }) {
  const db: any = tx;
  const labourMinutes = i(input.labourMinutes);
  const hourlyCost = Math.max(0, n(input.hourlyCost));
  if (labourMinutes > PHASE95_MAINTENANCE_POLICY.maxLabourMinutes || hourlyCost > PHASE95_MAINTENANCE_POLICY.maxHourlyCost) throw new Error("MAINTENANCE_LABOUR_INVALID");
  const row = await db.maintenanceWorkOrder.findUnique({ where: { id: input.workOrderId }, include: { asset: true, plan: true } });
  if (!row) throw new Error("MAINTENANCE_WORK_ORDER_NOT_FOUND");
  if (!['APPROVED','IN_PROGRESS'].includes(row.status)) throw new Error("MAINTENANCE_COMPLETE_STATUS_BLOCKED");
  const completedAt = new Date();
  const labourCost = round2((labourMinutes / 60) * hourlyCost);
  const totalCost = round2(n(row.spareCost) + labourCost);
  await db.maintenanceWorkOrder.update({ where: { id: row.id }, data: { status: "COMPLETED", completedAt, labourMinutes, labourCost, totalCost, rootCause: input.rootCause?.trim() || null, correctiveAction: input.correctiveAction?.trim() || null, technician: input.technician?.trim() || null, completedByUserId: input.actorUserId || null } });
  await db.equipmentAsset.update({ where: { id: row.assetId }, data: { status: "ACTIVE" } });
  if (row.planId && row.plan) {
    const due = phase95NextDue({ completedAt, runtimeMinutes: i(row.asset.cumulativeRuntimeMinutes), intervalDays: row.plan.intervalDays, intervalRuntimeMinutes: row.plan.intervalRuntimeMinutes });
    await db.maintenancePlan.update({ where: { id: row.planId }, data: { lastCompletedAt: completedAt, lastCompletedRuntimeMinutes: i(row.asset.cumulativeRuntimeMinutes), nextDueAt: due.nextDueAt, nextDueRuntimeMinutes: due.nextDueRuntimeMinutes } });
  }
  return db.maintenanceWorkOrder.findUnique({ where: { id: row.id }, include: { asset: { include: { workCenter: true } }, plan: true, spareUsages: { include: { variant: true } } } });
}

export async function phase95GenerateDueWorkOrders(tx: Prisma.TransactionClient, actorUserId?: string | null) {
  const db: any = tx;
  const now = new Date();
  const plans = await db.maintenancePlan.findMany({ where: { isActive: true }, include: { asset: true } });
  const created: any[] = [];
  for (const plan of plans) {
    const dueByDate = !!plan.nextDueAt && new Date(plan.nextDueAt).getTime() <= now.getTime();
    const dueByRuntime = plan.nextDueRuntimeMinutes != null && i(plan.asset.cumulativeRuntimeMinutes) >= i(plan.nextDueRuntimeMinutes);
    if (!dueByDate && !dueByRuntime) continue;
    const open = await db.maintenanceWorkOrder.findFirst({ where: { planId: plan.id, status: { in: ["DRAFT","APPROVED","IN_PROGRESS"] } } });
    if (open) continue;
    created.push(await db.maintenanceWorkOrder.create({ data: {
      workOrderNumber: phase95MaintenanceWorkOrderNumber(), assetId: plan.assetId, planId: plan.id, type: plan.type, priority: plan.priority, status: "DRAFT", title: plan.name,
      description: plan.instructions || null, dueAt: plan.nextDueAt || now, createdByUserId: actorUserId || null,
    }}));
  }
  return created;
}

export async function phase95MaintenanceOverview(db: any, days = PHASE95_MAINTENANCE_POLICY.defaultWindowDays) {
  const safeDays = Math.max(1, Math.min(PHASE95_MAINTENANCE_POLICY.maxWindowDays, i(days) || PHASE95_MAINTENANCE_POLICY.defaultWindowDays));
  const from = new Date(Date.now() - safeDays * 86400000);
  const now = new Date();
  const [assets, plans, workOrders, breakdowns, executions, spareParts, workCenters] = await Promise.all([
    db.equipmentAsset.findMany({ include: { workCenter: { include: { warehouse: true } }, maintenancePlans: true }, orderBy: { assetCode: "asc" } }),
    db.maintenancePlan.findMany({ where: { isActive: true }, include: { asset: { include: { workCenter: true } } }, orderBy: [{ nextDueAt: "asc" }, { createdAt: "asc" }] }),
    db.maintenanceWorkOrder.findMany({ where: { OR: [{ status: { in: ["DRAFT","APPROVED","IN_PROGRESS"] } }, { completedAt: { gte: from } }] }, include: { asset: { include: { workCenter: true } }, plan: true, spareUsages: { include: { variant: { include: { product: true } } } }, sourceDowntimeEvent: true }, orderBy: { updatedAt: "desc" }, take: 500 }),
    db.productionDowntimeEvent.findMany({ where: { category: "BREAKDOWN", startedAt: { gte: from }, equipmentAssetId: { not: null } }, include: { equipmentAsset: true }, orderBy: { startedAt: "desc" }, take: 1000 }),
    db.productionOperationExecution.findMany({ where: { equipmentAssetId: { not: null }, actualEndAt: { gte: from }, status: "COMPLETED" }, select: { equipmentAssetId: true, runtimeMinutes: true } }),
    db.productVariant.findMany({ where: { inventoryRole: "SPARE_PART", isActive: true }, include: { product: true }, orderBy: { sku: "asc" }, take: 500 }),
    db.workCenter.findMany({ include: { warehouse: true }, orderBy: { code: "asc" } }),
  ]);
  const reliability = assets.map((asset: any) => {
    const events = breakdowns.filter((row: any) => row.equipmentAssetId === asset.id);
    const breakdownMinutes = events.reduce((sum: number, row: any) => sum + i(row.minutes || minuteDiff(row.startedAt, row.endedAt || now)), 0);
    const runtimeMinutes = executions.filter((row: any) => row.equipmentAssetId === asset.id).reduce((sum: number, row: any) => sum + i(row.runtimeMinutes), 0);
    return { assetId: asset.id, assetCode: asset.assetCode, name: asset.name, workCenter: asset.workCenter, breakdownCount: events.length, breakdownMinutes, runtimeMinutes, ...phase95ReliabilityMetrics({ runtimeMinutes, breakdownMinutes, breakdownCount: events.length }) };
  });
  const duePlans = plans.filter((plan: any) => (!!plan.nextDueAt && new Date(plan.nextDueAt) <= now) || (plan.nextDueRuntimeMinutes != null && i(plan.asset.cumulativeRuntimeMinutes) >= i(plan.nextDueRuntimeMinutes)));
  const summary = {
    assets: assets.length,
    activeAssets: assets.filter((x: any) => x.status === "ACTIVE").length,
    unavailableAssets: assets.filter((x: any) => ["MAINTENANCE","BREAKDOWN","HOLD"].includes(x.status)).length,
    overduePlans: duePlans.length,
    openWorkOrders: workOrders.filter((x: any) => ["DRAFT","APPROVED","IN_PROGRESS"].includes(x.status)).length,
    breakdownWorkOrders: workOrders.filter((x: any) => x.type === "CORRECTIVE" && ["APPROVED","IN_PROGRESS"].includes(x.status)).length,
    maintenanceCost: round2(workOrders.filter((x: any) => x.completedAt && new Date(x.completedAt) >= from).reduce((sum: number, row: any) => sum + n(row.totalCost), 0)),
    lowSpareParts: spareParts.filter((x: any) => availableToSell(x) <= i(x.lowStockThreshold)).length,
  };
  return { windowDays: safeDays, from, summary, assets, plans, duePlans, workOrders, breakdowns, spareParts: spareParts.map((v: any) => ({ ...v, availableToSell: availableToSell(v) })), reliability, workCenters };
}
