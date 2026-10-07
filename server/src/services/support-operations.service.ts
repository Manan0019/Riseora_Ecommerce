const OPEN_STATUSES = new Set(["NEW", "IN_PROGRESS", "WAITING_CUSTOMER"]);
const TERMINAL_STATUSES = new Set(["RESOLVED", "CLOSED", "SPAM"]);

export function phase84SupportPriority(category: string, subject: string, message: string) {
  const text = `${category} ${subject} ${message}`.toLowerCase();
  if (/(charged twice|double charge|fraud|unauthori[sz]ed|unsafe|allergic|reaction|injury|legal|police|consumer forum)/i.test(text)) return "URGENT";
  if (/(payment|refund|delivery|missing|not delivered|wrong item|damaged|leak|replacement|rto|return)/i.test(text)) return "HIGH";
  if (category === "ACCOUNT" || category === "REWARDS") return "NORMAL";
  return "NORMAL";
}

export function phase84SupportSlaDueAt(now: Date, priority: string) {
  const hours = priority === "URGENT" ? 4 : priority === "HIGH" ? 8 : priority === "LOW" ? 48 : 24;
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

export function phase84SupportHealth(ticket: any, now = new Date()) {
  const open = OPEN_STATUSES.has(ticket?.status);
  const terminal = TERMINAL_STATUSES.has(ticket?.status);
  const slaDueAt = ticket?.slaDueAt ? new Date(ticket.slaDueAt) : null;
  const overdue = Boolean(open && slaDueAt && now.getTime() > slaDueAt.getTime());
  const ageHours = ticket?.lastActivityAt ? (now.getTime() - new Date(ticket.lastActivityAt).getTime()) / 3600000 : 0;
  const awaitingAdmin = open && ticket.status !== "WAITING_CUSTOMER" && (!ticket.lastAdminReplyAt || (ticket.lastCustomerReplyAt && new Date(ticket.lastCustomerReplyAt) > new Date(ticket.lastAdminReplyAt)));
  const stale = Boolean(open && ageHours >= 48);
  const escalated = ticket?.escalationLevel && ticket.escalationLevel !== "NONE";
  const needsAttention = overdue || awaitingAdmin || stale || escalated || ticket?.priority === "URGENT";

  let state = terminal ? "CLOSED" : "HEALTHY";
  if (ticket?.status === "WAITING_CUSTOMER") state = "WAITING_CUSTOMER";
  if (needsAttention) state = "ATTENTION";
  if (overdue) state = "SLA_BREACH";
  if (ticket?.escalationLevel === "MANAGEMENT") state = "ESCALATED";

  return {
    state,
    open,
    terminal,
    overdue,
    stale,
    awaitingAdmin,
    escalated,
    needsAttention,
    ageHours: Math.max(0, Math.round(ageHours * 10) / 10),
    slaDueAt,
    firstResponseMinutes: ticket?.firstResponseAt && ticket?.createdAt
      ? Math.max(0, Math.round((new Date(ticket.firstResponseAt).getTime() - new Date(ticket.createdAt).getTime()) / 60000))
      : null,
  };
}

export function phase84SupportSummary(rows: any[]) {
  const summary = {
    total: rows.length,
    open: 0,
    attention: 0,
    overdue: 0,
    urgent: 0,
    waitingCustomer: 0,
    unassigned: 0,
    escalated: 0,
    resolved: 0,
    csatResponses: 0,
    csatAverage: 0,
  };
  let scoreSum = 0;
  for (const row of rows) {
    const health = phase84SupportHealth(row);
    if (health.open) summary.open += 1;
    if (health.needsAttention) summary.attention += 1;
    if (health.overdue) summary.overdue += 1;
    if (row.priority === "URGENT" && health.open) summary.urgent += 1;
    if (row.status === "WAITING_CUSTOMER") summary.waitingCustomer += 1;
    if (!row.assignedAdminUserId && health.open) summary.unassigned += 1;
    if (row.escalationLevel && row.escalationLevel !== "NONE" && health.open) summary.escalated += 1;
    if (["RESOLVED", "CLOSED"].includes(row.status)) summary.resolved += 1;
    if (row.satisfactionScore) {
      summary.csatResponses += 1;
      scoreSum += Number(row.satisfactionScore);
    }
  }
  summary.csatAverage = summary.csatResponses ? Math.round((scoreSum / summary.csatResponses) * 10) / 10 : 0;
  return summary;
}

export function nextEscalationLevel(current: string) {
  if (current === "NONE") return "L1";
  if (current === "L1") return "L2";
  return "MANAGEMENT";
}
