export const PHASE85_RECOVERY_POLICY = {
  lookbackDays: 30,
  maxGrantsPerCustomer: 2,
  maxCouponPerGrant: 500,
  maxCouponTotal: 1000,
  maxPointsPerGrant: 500,
  maxPointsTotal: 1000,
  couponValidityDays: 30,
} as const;

type RecoveryGrantLike = {
  kind?: string | null;
  couponAmount?: unknown;
  points?: number | null;
  createdAt?: Date | string | null;
};

type Customer360Input = {
  orders: Array<{ status?: string | null; totalAmount?: unknown; createdAt?: Date | string | null }>;
  returns: Array<{ status?: string | null; requestedAt?: Date | string | null }>;
  tickets: Array<{ status?: string | null; satisfactionScore?: number | null; createdAt?: Date | string | null }>;
  rewardBalance?: number | null;
  recoveryGrants?: RecoveryGrantLike[];
};

function money(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function phase85Customer360Profile(input: Customer360Input) {
  const orders = input.orders || [];
  const returns = input.returns || [];
  const tickets = input.tickets || [];
  const grants = input.recoveryGrants || [];
  const terminalBadOrder = new Set(["CANCELLED"]);
  const activeReturn = new Set(["REQUESTED", "APPROVED", "IN_TRANSIT", "RECEIVED", "RESOLUTION_PENDING", "REPLACEMENT_PENDING", "REPLACEMENT_SHIPPED"]);
  const activeTicket = new Set(["NEW", "IN_PROGRESS", "WAITING_CUSTOMER"]);

  const lifetimeSpend = Math.round(orders.filter((row) => !terminalBadOrder.has(String(row.status || ""))).reduce((sum, row) => sum + money(row.totalAmount), 0) * 100) / 100;
  const deliveredOrders = orders.filter((row) => row.status === "DELIVERED").length;
  const cancelledOrders = orders.filter((row) => row.status === "CANCELLED").length;
  const activeReturns = returns.filter((row) => activeReturn.has(String(row.status || ""))).length;
  const completedReturns = returns.filter((row) => ["REFUNDED", "REPLACED"].includes(String(row.status || ""))).length;
  const activeCases = tickets.filter((row) => activeTicket.has(String(row.status || ""))).length;
  const csat = tickets.map((row) => Number(row.satisfactionScore || 0)).filter((value) => value > 0);
  const csatAverage = csat.length ? Math.round((csat.reduce((a, b) => a + b, 0) / csat.length) * 10) / 10 : null;

  let relationshipTier = "NEW";
  if (deliveredOrders >= 10 || lifetimeSpend >= 10000) relationshipTier = "VIP";
  else if (deliveredOrders >= 5 || lifetimeSpend >= 5000) relationshipTier = "LOYAL";
  else if (deliveredOrders >= 2 || lifetimeSpend >= 1500) relationshipTier = "ACTIVE";

  const frictionScore = Math.min(100,
    activeCases * 18 +
    activeReturns * 16 +
    completedReturns * 5 +
    cancelledOrders * 4 +
    (csatAverage !== null && csatAverage < 3 ? 20 : 0));
  const careRisk = frictionScore >= 60 ? "HIGH" : frictionScore >= 30 ? "WATCH" : "NORMAL";

  const couponGranted = Math.round(grants.filter((row) => row.kind === "COUPON").reduce((sum, row) => sum + money(row.couponAmount), 0) * 100) / 100;
  const pointsGranted = grants.filter((row) => row.kind === "REWARD_POINTS").reduce((sum, row) => sum + Number(row.points || 0), 0);

  return {
    relationshipTier,
    careRisk,
    frictionScore,
    orderCount: orders.length,
    deliveredOrders,
    cancelledOrders,
    lifetimeSpend,
    activeReturns,
    completedReturns,
    supportCases: tickets.length,
    activeCases,
    csatAverage,
    rewardBalance: Number(input.rewardBalance || 0),
    recoveryGrantCount: grants.length,
    couponGranted,
    pointsGranted,
  };
}

export function phase85RecoveryEligibility(ticket: any, recentGrants: RecoveryGrantLike[]) {
  const blockers: string[] = [];
  if (!ticket?.userId) blockers.push("Support case is not linked to a signed-in customer.");
  if (!ticket?.assignedAdminUserId) blockers.push("Assign the case before issuing a recovery benefit.");
  if (["SPAM"].includes(String(ticket?.status || ""))) blockers.push("Spam cases cannot receive service recovery.");
  if (ticket?.recoveryGrant) blockers.push("This case already has a service-recovery grant.");
  if ((recentGrants || []).length >= PHASE85_RECOVERY_POLICY.maxGrantsPerCustomer) blockers.push("Customer reached the 30-day recovery grant limit.");

  const couponTotal = Math.round((recentGrants || []).filter((row) => row.kind === "COUPON").reduce((sum, row) => sum + money(row.couponAmount), 0) * 100) / 100;
  const pointsTotal = (recentGrants || []).filter((row) => row.kind === "REWARD_POINTS").reduce((sum, row) => sum + Number(row.points || 0), 0);

  return {
    eligible: blockers.length === 0,
    blockers,
    recentGrantCount: (recentGrants || []).length,
    couponTotal,
    pointsTotal,
    couponRemaining: Math.max(0, PHASE85_RECOVERY_POLICY.maxCouponTotal - couponTotal),
    pointsRemaining: Math.max(0, PHASE85_RECOVERY_POLICY.maxPointsTotal - pointsTotal),
    policy: PHASE85_RECOVERY_POLICY,
  };
}
