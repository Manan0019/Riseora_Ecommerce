export const PHASE86_RETENTION_POLICY = {
  atRiskAfterDays: 90,
  lapsedAfterDays: 180,
  campaignFatigueDays: 30,
  maxIssuedCampaignsPer30Days: 2,
  recentRecoverySuppressionDays: 30,
  maxCampaignAudience: 500,
  maxCouponAmount: 500,
  maxRewardPoints: 500,
  maxValidDays: 90,
} as const;

type OrderLike = { status?: string | null; totalAmount?: unknown; createdAt?: Date | string | null; shipment?: { deliveredAt?: Date | string | null } | null };
type ReturnLike = { status?: string | null };
type TicketLike = { status?: string | null; satisfactionScore?: number | null };
type ReminderLike = { status?: string | null; nextReminderAt?: Date | string | null };

const activeReturn = new Set(["REQUESTED", "APPROVED", "PICKUP_PENDING", "IN_TRANSIT", "RECEIVED", "RESOLUTION_PENDING", "REFUNDING", "REPLACEMENT_PENDING", "REPLACEMENT_SHIPPED"]);
const activeTicket = new Set(["NEW", "IN_PROGRESS", "WAITING_CUSTOMER"]);
const money = (value: unknown) => Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0;
const daysBetween = (a: Date, b: Date) => Math.max(0, Math.floor((a.getTime() - b.getTime()) / 86400000));

export function phase86LifecycleProfile(input: { orders: OrderLike[]; returns?: ReturnLike[]; tickets?: TicketLike[]; reminders?: ReminderLike[]; now?: Date }) {
  const now = input.now || new Date();
  const delivered = (input.orders || []).filter((row) => row.status === "DELIVERED");
  const lifetimeSpend = Math.round(delivered.reduce((sum, row) => sum + money(row.totalAmount), 0) * 100) / 100;
  const lastDeliveredAt = delivered.map((row) => row.shipment?.deliveredAt ? new Date(row.shipment.deliveredAt) : row.createdAt ? new Date(row.createdAt) : null).filter((value): value is Date => Boolean(value && !Number.isNaN(value.getTime()))).sort((a, b) => b.getTime() - a.getTime())[0] || null;
  const daysSinceLastOrder = lastDeliveredAt ? daysBetween(now, lastDeliveredAt) : null;
  const activeReturns = (input.returns || []).filter((row) => activeReturn.has(String(row.status || ""))).length;
  const activeCases = (input.tickets || []).filter((row) => activeTicket.has(String(row.status || ""))).length;
  const csat = (input.tickets || []).map((row) => Number(row.satisfactionScore || 0)).filter((value) => value > 0);
  const csatAverage = csat.length ? Math.round((csat.reduce((a,b) => a+b, 0) / csat.length) * 10) / 10 : null;
  const refillDue = (input.reminders || []).filter((row) => row.status === "ACTIVE" && row.nextReminderAt && new Date(row.nextReminderAt).getTime() <= now.getTime() + 14 * 86400000).length;

  let segment = "NEW";
  if (delivered.length) {
    if ((daysSinceLastOrder ?? 0) > PHASE86_RETENTION_POLICY.lapsedAfterDays) segment = "LAPSED";
    else if ((daysSinceLastOrder ?? 0) > PHASE86_RETENTION_POLICY.atRiskAfterDays) segment = "AT_RISK";
    else if (delivered.length >= 10 || lifetimeSpend >= 10000) segment = "VIP";
    else if (delivered.length >= 5 || lifetimeSpend >= 5000) segment = "LOYAL";
    else segment = "ACTIVE";
  }

  const recencyRisk = daysSinceLastOrder == null ? 20 : Math.min(70, Math.round(daysSinceLastOrder / 3));
  const frictionRisk = Math.min(30, activeReturns * 12 + activeCases * 10 + (csatAverage !== null && csatAverage < 3 ? 12 : 0));
  const riskScore = Math.min(100, recencyRisk + frictionRisk);
  const nextBestAction = segment === "LAPSED" ? "REACTIVATE" : segment === "AT_RISK" ? "WIN_BACK" : refillDue > 0 ? "REPLENISH" : segment === "VIP" ? "VIP_NURTURE" : segment === "LOYAL" ? "CROSS_SELL" : segment === "NEW" ? "WELCOME" : "SECOND_PURCHASE";

  return { segment, riskScore, nextBestAction, deliveredOrders: delivered.length, lifetimeSpend, lastDeliveredAt, daysSinceLastOrder, activeReturns, activeCases, csatAverage, refillDue };
}

export function phase86Suppression(input: { profile: ReturnType<typeof phase86LifecycleProfile>; campaignSegment: string; audiencePolicy: string; marketingPreference?: { emailMarketing?: boolean; smsMarketing?: boolean; whatsappMarketing?: boolean } | null; recentRecoveryCount?: number; recentCampaignCount?: number }) {
  const reasons: string[] = [];
  if (input.profile.segment !== input.campaignSegment) reasons.push(`SEGMENT_MISMATCH:${input.profile.segment}`);
  if (input.profile.activeCases > 0) reasons.push("ACTIVE_SUPPORT_CASE");
  if (input.profile.activeReturns > 0) reasons.push("ACTIVE_RETURN");
  if ((input.recentRecoveryCount || 0) > 0) reasons.push("RECENT_SERVICE_RECOVERY");
  if ((input.recentCampaignCount || 0) >= PHASE86_RETENTION_POLICY.maxIssuedCampaignsPer30Days) reasons.push("CAMPAIGN_FATIGUE_30D");
  if (input.audiencePolicy === "MARKETING_OPT_IN_ONLY") {
    const pref = input.marketingPreference;
    if (!pref || !(pref.emailMarketing || pref.smsMarketing || pref.whatsappMarketing)) reasons.push("NO_MARKETING_OPT_IN");
  }
  return { eligible: reasons.length === 0, reasons };
}

export function phase86GrowthSummary(profiles: Array<ReturnType<typeof phase86LifecycleProfile>>) {
  const segments: Record<string, number> = { NEW:0, ACTIVE:0, LOYAL:0, VIP:0, AT_RISK:0, LAPSED:0 };
  for (const row of profiles) segments[row.segment] = (segments[row.segment] || 0) + 1;
  return { totalCustomers: profiles.length, segments, highRisk: profiles.filter((row) => row.riskScore >= 60).length, refillDue: profiles.filter((row) => row.refillDue > 0).length };
}
