import type { Prisma } from "../generated/prisma/client";
import { phase93OperationMinutes } from "./mrp-capacity.service";

export const PHASE94_EXECUTION_POLICY = {
  defaultOeeWindowDays: 7,
  maxOeeWindowDays: 90,
  maxOperationsPerOrder: 50,
  maxLabourMinutesPerEntry: 1440,
  maxHourlyCost: 100000,
  maxReportedUnits: 100000000,
} as const;

const n = (value: unknown) => Number(value || 0);
const i = (value: unknown) => Math.max(0, Math.trunc(n(value)));
const round2 = (value: number) => Number(value.toFixed(2));
const minuteDiff = (from: Date | string | null | undefined, to: Date | string | null | undefined) => {
  if (!from || !to) return 0;
  return Math.max(0, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 60000));
};

export function phase94OeeMetrics(executions: any[]) {
  const completed = executions.filter((row) => row.status === "COMPLETED");
  const runtimeMinutes = completed.reduce((sum, row) => sum + i(row.runtimeMinutes), 0);
  const downtimeMinutes = completed.reduce((sum, row) => sum + i(row.downtimeMinutes), 0);
  const goodUnits = completed.reduce((sum, row) => sum + i(row.goodQty), 0);
  const rejectUnits = completed.reduce((sum, row) => sum + i(row.rejectQty), 0);
  const reworkUnits = completed.reduce((sum, row) => sum + i(row.reworkQty), 0);
  const processedUnits = goodUnits + rejectUnits + reworkUnits;
  const idealMinutes = completed.reduce((sum, row) => sum + Math.max(0, n(row.routingOperation?.runMinutesPerUnit)) * (i(row.goodQty) + i(row.rejectQty) + i(row.reworkQty)), 0);
  const availabilityPercent = runtimeMinutes + downtimeMinutes > 0 ? round2((runtimeMinutes / (runtimeMinutes + downtimeMinutes)) * 100) : 0;
  const performancePercent = runtimeMinutes > 0 ? round2(Math.min(100, (idealMinutes / runtimeMinutes) * 100)) : 0;
  const qualityPercent = processedUnits > 0 ? round2((goodUnits / processedUnits) * 100) : 0;
  const oeePercent = round2((availabilityPercent * performancePercent * qualityPercent) / 10000);
  const withPlan = completed.filter((row) => row.plannedEndAt && row.actualEndAt);
  const onTime = withPlan.filter((row) => new Date(row.actualEndAt).getTime() <= new Date(row.plannedEndAt).getTime()).length;
  const scheduleAdherencePercent = withPlan.length ? round2((onTime / withPlan.length) * 100) : 0;
  return { completedOperations: completed.length, runtimeMinutes, downtimeMinutes, goodUnits, rejectUnits, reworkUnits, processedUnits, availabilityPercent, performancePercent, qualityPercent, oeePercent, scheduleAdherencePercent };
}

export async function phase94DispatchOrder(tx: Prisma.TransactionClient, productionOrderId: string, actorUserId?: string | null) {
  const db: any = tx;
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`shopfloor:${productionOrderId}`}))`;
  const order = await db.productionOrder.findUnique({ where: { id: productionOrderId }, include: {
    routing: { include: { operations: { include: { workCenter: true }, orderBy: { sequence: "asc" } } } },
    scheduleSlots: { where: { schedule: { status: { in: ["PUBLISHED", "LOCKED"] } } }, include: { schedule: true }, orderBy: { plannedStartAt: "desc" } },
    operationExecutions: { orderBy: { sequence: "asc" } },
  }});
  if (!order) throw new Error("PRODUCTION_ORDER_NOT_FOUND");
  if (!["MATERIAL_ISSUED", "IN_PRODUCTION"].includes(order.status)) throw new Error("SHOP_FLOOR_DISPATCH_STATUS_BLOCKED");
  if (!order.routing) throw new Error("SHOP_FLOOR_ACTIVE_ROUTING_REQUIRED");
  if (order.routing.warehouseId !== order.warehouseId) throw new Error("SHOP_FLOOR_ROUTING_WAREHOUSE_MISMATCH");
  const operations = order.routing.operations || [];
  if (!operations.length) throw new Error("SHOP_FLOOR_ROUTING_EMPTY");
  if (operations.length > PHASE94_EXECUTION_POLICY.maxOperationsPerOrder) throw new Error("SHOP_FLOOR_OPERATION_LIMIT");
  const invalid = operations.find((op: any) => op.workCenter?.status !== "ACTIVE" || op.workCenter?.warehouseId !== order.warehouseId);
  if (invalid) throw new Error(`SHOP_FLOOR_WORK_CENTER_UNAVAILABLE:${invalid.workCenter?.code || invalid.workCenterId}`);

  if (!order.operationExecutions.length) {
    const slotByOperation = new Map<string, any>();
    const slotBySequence = new Map<number, any>();
    for (const slot of order.scheduleSlots || []) {
      if (slot.routingOperationId && !slotByOperation.has(slot.routingOperationId)) slotByOperation.set(slot.routingOperationId, slot);
      if (!slotBySequence.has(Number(slot.sequence))) slotBySequence.set(Number(slot.sequence), slot);
    }
    for (let index = 0; index < operations.length; index++) {
      const op: any = operations[index];
      const slot = slotByOperation.get(op.id) || slotBySequence.get(Number(op.sequence));
      const plannedMinutes = slot?.plannedMinutes || phase93OperationMinutes({
        setupMinutes: Number(op.setupMinutes || op.workCenter?.defaultSetupMinutes || 0),
        runMinutesPerUnit: Number(op.runMinutesPerUnit || 0),
        outputQty: i(order.plannedOutputQty),
        efficiencyPercent: Number(op.workCenter?.efficiencyPercent || 100),
        queueMinutes: Number(op.queueMinutes || 0),
      });
      await db.productionOperationExecution.create({ data: {
        productionOrderId: order.id,
        routingOperationId: op.id,
        scheduleSlotId: slot?.id || null,
        workCenterId: op.workCenterId,
        sequence: Number(op.sequence),
        operationName: op.name,
        status: index === 0 ? "READY" : "QUEUED",
        plannedStartAt: slot?.plannedStartAt || null,
        plannedEndAt: slot?.plannedEndAt || null,
        plannedMinutes,
      }});
      if (slot?.id) await db.productionScheduleSlot.update({ where: { id: slot.id }, data: { status: "RELEASED" } });
    }
  }

  await db.productionOrder.update({ where: { id: order.id }, data: {
    status: "IN_PRODUCTION",
    startedAt: order.startedAt || new Date(),
    startedByUserId: order.startedByUserId || actorUserId || null,
    shopFloorDispatchedAt: order.shopFloorDispatchedAt || new Date(),
    shopFloorDispatchedByUserId: order.shopFloorDispatchedByUserId || actorUserId || null,
  }});
  return db.productionOrder.findUnique({ where: { id: order.id }, include: { outputVariant: { include: { product: true } }, warehouse: true, routing: true, operationExecutions: { include: { workCenter: true, routingOperation: true, downtimeEvents: true, labourEntries: true }, orderBy: { sequence: "asc" } } } });
}

export async function phase94StartOperation(tx: Prisma.TransactionClient, executionId: string, actorUserId?: string | null) {
  const db: any = tx;
  const row = await db.productionOperationExecution.findUnique({ where: { id: executionId }, include: { productionOrder: true } });
  if (!row) throw new Error("SHOP_FLOOR_OPERATION_NOT_FOUND");
  if (row.productionOrder.status !== "IN_PRODUCTION") throw new Error("SHOP_FLOOR_ORDER_NOT_RUNNING");
  if (row.status !== "READY") throw new Error("SHOP_FLOOR_OPERATION_NOT_READY");
  const now = new Date();
  const updated = await db.productionOperationExecution.update({ where: { id: row.id }, data: { status: "IN_PROGRESS", actualStartAt: row.actualStartAt || now, startedByUserId: row.startedByUserId || actorUserId || null } });
  if (row.scheduleSlotId) await db.productionScheduleSlot.update({ where: { id: row.scheduleSlotId }, data: { status: "IN_PROGRESS" } });
  return updated;
}

export async function phase94PauseOperation(tx: Prisma.TransactionClient, executionId: string, input: { category: string; reason: string; actorUserId?: string | null }) {
  const db: any = tx;
  const row = await db.productionOperationExecution.findUnique({ where: { id: executionId } });
  if (!row) throw new Error("SHOP_FLOOR_OPERATION_NOT_FOUND");
  if (row.status !== "IN_PROGRESS") throw new Error("SHOP_FLOOR_PAUSE_STATUS_BLOCKED");
  const open = await db.productionDowntimeEvent.findFirst({ where: { executionId: row.id, endedAt: null } });
  if (open) throw new Error("SHOP_FLOOR_DOWNTIME_ALREADY_OPEN");
  const now = new Date();
  await db.productionDowntimeEvent.create({ data: { executionId: row.id, productionOrderId: row.productionOrderId, workCenterId: row.workCenterId, category: input.category, reason: input.reason.trim(), startedAt: now, createdByUserId: input.actorUserId || null } });
  return db.productionOperationExecution.update({ where: { id: row.id }, data: { status: "PAUSED", pausedAt: now } });
}

export async function phase94ResumeOperation(tx: Prisma.TransactionClient, executionId: string) {
  const db: any = tx;
  const row = await db.productionOperationExecution.findUnique({ where: { id: executionId } });
  if (!row) throw new Error("SHOP_FLOOR_OPERATION_NOT_FOUND");
  if (row.status !== "PAUSED") throw new Error("SHOP_FLOOR_RESUME_STATUS_BLOCKED");
  const open = await db.productionDowntimeEvent.findFirst({ where: { executionId: row.id, endedAt: null }, orderBy: { startedAt: "desc" } });
  if (!open) throw new Error("SHOP_FLOOR_DOWNTIME_NOT_FOUND");
  const now = new Date();
  const minutes = minuteDiff(open.startedAt, now);
  await db.productionDowntimeEvent.update({ where: { id: open.id }, data: { endedAt: now, minutes } });
  return db.productionOperationExecution.update({ where: { id: row.id }, data: { status: "IN_PROGRESS", pausedAt: null, downtimeMinutes: { increment: minutes } } });
}

export async function phase94CompleteOperation(tx: Prisma.TransactionClient, executionId: string, input: { goodQty: number; rejectQty?: number; reworkQty?: number; actualSetupMinutes?: number; notes?: string | null; actorUserId?: string | null }) {
  const db: any = tx;
  const row = await db.productionOperationExecution.findUnique({ where: { id: executionId }, include: { productionOrder: true } });
  if (!row) throw new Error("SHOP_FLOOR_OPERATION_NOT_FOUND");
  if (row.status !== "IN_PROGRESS") throw new Error("SHOP_FLOOR_COMPLETE_STATUS_BLOCKED");
  const open = await db.productionDowntimeEvent.findFirst({ where: { executionId: row.id, endedAt: null } });
  if (open) throw new Error("SHOP_FLOOR_OPEN_DOWNTIME_BLOCKS_COMPLETION");
  const goodQty = i(input.goodQty), rejectQty = i(input.rejectQty), reworkQty = i(input.reworkQty);
  if (goodQty + rejectQty + reworkQty <= 0) throw new Error("SHOP_FLOOR_OUTPUT_REQUIRED");
  if (goodQty + rejectQty + reworkQty > PHASE94_EXECUTION_POLICY.maxReportedUnits) throw new Error("SHOP_FLOOR_OUTPUT_LIMIT");
  const now = new Date();
  const elapsed = Math.max(1, minuteDiff(row.actualStartAt, now));
  const runtimeMinutes = Math.max(1, elapsed - i(row.downtimeMinutes));
  const updated = await db.productionOperationExecution.update({ where: { id: row.id }, data: { status: "COMPLETED", actualEndAt: now, runtimeMinutes, actualSetupMinutes: i(input.actualSetupMinutes), goodQty, rejectQty, reworkQty, notes: input.notes?.trim() || null, completedByUserId: input.actorUserId || null } });
  if (row.scheduleSlotId) await db.productionScheduleSlot.update({ where: { id: row.scheduleSlotId }, data: { status: "COMPLETED" } });
  const next = await db.productionOperationExecution.findFirst({ where: { productionOrderId: row.productionOrderId, sequence: { gt: row.sequence }, status: "QUEUED" }, orderBy: { sequence: "asc" } });
  if (next) await db.productionOperationExecution.update({ where: { id: next.id }, data: { status: "READY" } });
  return updated;
}

export async function phase94AddLabour(tx: Prisma.TransactionClient, executionId: string, input: { operatorUserId?: string | null; role: string; minutes: number; hourlyCost: number; note?: string | null; actorUserId?: string | null }) {
  const db: any = tx;
  const execution = await db.productionOperationExecution.findUnique({ where: { id: executionId } });
  if (!execution) throw new Error("SHOP_FLOOR_OPERATION_NOT_FOUND");
  const minutes = i(input.minutes), hourlyCost = Math.max(0, n(input.hourlyCost));
  if (minutes <= 0 || minutes > PHASE94_EXECUTION_POLICY.maxLabourMinutesPerEntry) throw new Error("SHOP_FLOOR_LABOUR_MINUTES_INVALID");
  if (hourlyCost > PHASE94_EXECUTION_POLICY.maxHourlyCost) throw new Error("SHOP_FLOOR_LABOUR_COST_INVALID");
  const labourCost = round2((minutes / 60) * hourlyCost);
  return db.productionLabourEntry.create({ data: { executionId: execution.id, productionOrderId: execution.productionOrderId, operatorUserId: input.operatorUserId || input.actorUserId || null, role: input.role, minutes, hourlyCost, labourCost, note: input.note?.trim() || null, enteredByUserId: input.actorUserId || null } });
}

export async function phase94CompletionGate(db: any, productionOrderId: string, actualOutputQty: number) {
  const order = await db.productionOrder.findUnique({ where: { id: productionOrderId }, select: { id: true, routingId: true, operationExecutions: { include: { labourEntries: true }, orderBy: { sequence: "asc" } } } });
  if (!order) throw new Error("PRODUCTION_ORDER_NOT_FOUND");
  if (!order.routingId) return { required: false, labourCost: 0, runtimeMinutes: 0, downtimeMinutes: 0 };
  if (!order.operationExecutions.length) throw new Error("PRODUCTION_SHOP_FLOOR_EXECUTION_REQUIRED");
  const incomplete = order.operationExecutions.find((row: any) => row.status !== "COMPLETED");
  if (incomplete) throw new Error(`PRODUCTION_OPERATIONS_INCOMPLETE:${incomplete.sequence}`);
  const last: any = order.operationExecutions[order.operationExecutions.length - 1];
  if (i(last.goodQty) !== i(actualOutputQty)) throw new Error(`PRODUCTION_OUTPUT_EXECUTION_MISMATCH:${i(last.goodQty)}`);
  const labourCost = round2(order.operationExecutions.reduce((sum: number, row: any) => sum + (row.labourEntries || []).reduce((s: number, entry: any) => s + n(entry.labourCost), 0), 0));
  return { required: true, labourCost, runtimeMinutes: order.operationExecutions.reduce((sum: number, row: any) => sum + i(row.runtimeMinutes), 0), downtimeMinutes: order.operationExecutions.reduce((sum: number, row: any) => sum + i(row.downtimeMinutes), 0), finalGoodQty: i(last.goodQty) };
}

export async function phase94Overview(db: any, days = PHASE94_EXECUTION_POLICY.defaultOeeWindowDays) {
  const safeDays = Math.max(1, Math.min(PHASE94_EXECUTION_POLICY.maxOeeWindowDays, i(days) || PHASE94_EXECUTION_POLICY.defaultOeeWindowDays));
  const from = new Date(Date.now() - safeDays * 86400000);
  const [workCenters, orders, executions, recentDowntime, shifts] = await Promise.all([
    db.workCenter.findMany({ include: { warehouse: true }, orderBy: { code: "asc" } }),
    db.productionOrder.findMany({ where: { status: { in: ["MATERIAL_ISSUED", "IN_PRODUCTION"] } }, include: { outputVariant: { include: { product: true } }, warehouse: true, routing: true, operationExecutions: { include: { workCenter: true, routingOperation: true, downtimeEvents: true, labourEntries: true }, orderBy: { sequence: "asc" } } }, orderBy: [{ priority: "desc" }, { dueAt: "asc" }], take: 150 }),
    db.productionOperationExecution.findMany({ where: { OR: [{ actualEndAt: { gte: from } }, { status: { in: ["READY", "IN_PROGRESS", "PAUSED"] } }] }, include: { workCenter: true, routingOperation: true, productionOrder: { include: { outputVariant: { include: { product: true } }, warehouse: true } }, downtimeEvents: true, labourEntries: true }, orderBy: { updatedAt: "desc" }, take: 1000 }),
    db.productionDowntimeEvent.findMany({ where: { startedAt: { gte: from } }, include: { workCenter: true, productionOrder: { include: { outputVariant: { include: { product: true } } } } }, orderBy: { startedAt: "desc" }, take: 250 }),
    db.workCenterShift.findMany({ where: { isActive: true }, include: { workCenter: true }, orderBy: [{ workCenterId: "asc" }, { dayOfWeek: "asc" }, { startMinuteOfDay: "asc" }] }),
  ]);
  const oee = phase94OeeMetrics(executions);
  const workCenterMetrics = workCenters.map((center: any) => {
    const rows = executions.filter((row: any) => row.workCenterId === center.id);
    const metrics = phase94OeeMetrics(rows);
    const centerShifts = shifts.filter((shift: any) => shift.workCenterId === center.id);
    const weeklyNetShiftMinutes = centerShifts.reduce((sum: number, shift: any) => sum + Math.max(0, i(shift.durationMinutes) - i(shift.breakMinutes)), 0);
    return { id: center.id, code: center.code, name: center.name, warehouse: center.warehouse, status: center.status, weeklyNetShiftMinutes, activeShiftCount: centerShifts.length, ...metrics };
  });
  const downtimeByCategory: Record<string, number> = {};
  for (const event of recentDowntime) downtimeByCategory[event.category] = (downtimeByCategory[event.category] || 0) + i(event.minutes || minuteDiff(event.startedAt, event.endedAt || new Date()));
  const summary = {
    running: executions.filter((row: any) => row.status === "IN_PROGRESS").length,
    paused: executions.filter((row: any) => row.status === "PAUSED").length,
    ready: executions.filter((row: any) => row.status === "READY").length,
    materialIssuedAwaitingDispatch: orders.filter((row: any) => row.status === "MATERIAL_ISSUED").length,
    inProduction: orders.filter((row: any) => row.status === "IN_PRODUCTION").length,
    downtimeMinutes: recentDowntime.reduce((sum: number, row: any) => sum + i(row.minutes || minuteDiff(row.startedAt, row.endedAt || new Date())), 0),
    labourCost: round2(executions.reduce((sum: number, row: any) => sum + (row.labourEntries || []).reduce((s: number, entry: any) => s + n(entry.labourCost), 0), 0)),
    oeePercent: oee.oeePercent,
    availabilityPercent: oee.availabilityPercent,
    performancePercent: oee.performancePercent,
    qualityPercent: oee.qualityPercent,
    scheduleAdherencePercent: oee.scheduleAdherencePercent,
  };
  return { windowDays: safeDays, from, summary, oee, workCenters: workCenterMetrics, orders, executions, recentDowntime, downtimeByCategory, shifts };
}
