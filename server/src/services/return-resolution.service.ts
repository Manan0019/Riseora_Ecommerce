import { prisma } from "../config/prisma";

const ACTIVE = ["REQUESTED", "APPROVED", "PICKUP_PENDING", "IN_TRANSIT", "RECEIVED", "RESOLUTION_PENDING", "REFUNDING", "REPLACEMENT_PENDING", "REPLACEMENT_SHIPPED"];

export function phase83Priority(reason?: string | null, requestedAt?: Date | null) {
  const ageHours = requestedAt ? Math.max(0, (Date.now() - requestedAt.getTime()) / 36e5) : 0;
  const reasonText = String(reason || "").toLowerCase();
  if (/(wrong|unsafe|allergic|reaction|leak|damaged)/.test(reasonText) || ageHours >= 96) return "URGENT" as const;
  if (/(quality|defect|broken)/.test(reasonText) || ageHours >= 48) return "HIGH" as const;
  return "NORMAL" as const;
}

export function phase83SlaDueAt(requestedAt: Date, priority: "NORMAL" | "HIGH" | "URGENT") {
  const hours = priority === "URGENT" ? 12 : priority === "HIGH" ? 24 : 48;
  return new Date(requestedAt.getTime() + hours * 36e5);
}

export function returnResolutionHealth(item: any) {
  const issues: Array<{ level: "INFO" | "REVIEW" | "BLOCK"; code: string; message: string }> = [];
  const now = Date.now();
  const slaDueAt = item.slaDueAt ? new Date(item.slaDueAt) : null;
  const overdue = Boolean(slaDueAt && !["REFUNDED", "REPLACED", "REJECTED", "CANCELLED"].includes(item.status) && slaDueAt.getTime() < now);
  if (overdue) issues.push({ level: "REVIEW", code: "RETURN_SLA_OVERDUE", message: "This return is beyond its operational review SLA." });

  if (item.status === "RECEIVED" && !item.inspectionCompletedAt) {
    issues.push({ level: "REVIEW", code: "RETURN_INSPECTION_PENDING", message: "Physical return received; item inspection is still required before resolution." });
  }
  if (item.status === "RESOLUTION_PENDING" && !item.approvedResolution) {
    issues.push({ level: "BLOCK", code: "RETURN_RESOLUTION_MISSING", message: "Inspection completed but no approved customer resolution is recorded." });
  }
  if (item.status === "REFUNDED" && !item.refundedAt) {
    issues.push({ level: "BLOCK", code: "RETURN_REFUND_EVIDENCE_MISSING", message: "Return is marked refunded without a refunded timestamp." });
  }
  if (item.status === "REPLACED" && !item.replacementDeliveredAt) {
    issues.push({ level: "BLOCK", code: "RETURN_REPLACEMENT_EVIDENCE_MISSING", message: "Return is marked replaced without replacement delivery evidence." });
  }

  const disposition = (item.items || []).reduce((acc: any, row: any) => {
    acc.received += Number(row.receivedQuantity || 0);
    acc.restock += Number(row.restockQuantity || 0);
    acc.quarantine += Number(row.quarantineQuantity || 0);
    acc.writeOff += Number(row.writeOffQuantity || 0);
    return acc;
  }, { received: 0, restock: 0, quarantine: 0, writeOff: 0 });

  const status = issues.some((x) => x.level === "BLOCK") ? "BLOCKED" : issues.some((x) => x.level === "REVIEW") ? "REVIEW" : "HEALTHY";
  return {
    status,
    overdue,
    slaDueAt,
    issues,
    disposition,
    preferredResolution: item.preferredResolution || "REFUND",
    approvedResolution: item.approvedResolution || null,
    inspectionComplete: Boolean(item.inspectionCompletedAt),
    completed: ["REFUNDED", "REPLACED", "REJECTED", "CANCELLED"].includes(item.status),
  };
}

export async function adminReturnResolutionSnapshot() {
  const rows = await prisma.returnRequest.findMany({
    where: { status: { in: ACTIVE as any } },
    select: {
      id: true,
      status: true,
      preferredResolution: true,
      approvedResolution: true,
      priority: true,
      requestedAt: true,
      slaDueAt: true,
      inspectionCompletedAt: true,
      items: { select: { receivedQuantity: true, restockQuantity: true, quarantineQuantity: true, writeOffQuantity: true } },
    },
    take: 500,
  });
  const metrics = { active: rows.length, overdue: 0, inspection: 0, refund: 0, replacement: 0, urgent: 0 };
  const now = Date.now();
  for (const row of rows) {
    if (row.slaDueAt && row.slaDueAt.getTime() < now) metrics.overdue += 1;
    if (row.status === "RECEIVED" && !row.inspectionCompletedAt) metrics.inspection += 1;
    if ((row.approvedResolution || row.preferredResolution) === "REFUND") metrics.refund += 1;
    if ((row.approvedResolution || row.preferredResolution) === "REPLACEMENT") metrics.replacement += 1;
    if (row.priority === "URGENT") metrics.urgent += 1;
  }
  return metrics;
}
