import { createHash } from "node:crypto";

export const PHASE87_ATTRIBUTION_POLICY = {
  minAttributionWindowDays: 1,
  maxAttributionWindowDays: 90,
  maxHoldoutPercent: 40,
} as const;

export function phase87ExperimentGroup(campaignId: string, userId: string, mode: string, holdoutPercent = 0) {
  if (mode === "NONE") return "STANDARD";
  const digest = createHash("sha256").update(`${campaignId}:${userId}`).digest();
  const bucket = digest.readUInt32BE(0) % 100;
  const holdout = Math.max(0, Math.min(PHASE87_ATTRIBUTION_POLICY.maxHoldoutPercent, Number(holdoutPercent || 0)));
  if (bucket < holdout) return "CONTROL";
  if (mode === "HOLDOUT") return "VARIANT_A";
  const treatmentBucket = ((bucket - holdout) / Math.max(1, 100 - holdout)) * 100;
  return treatmentBucket < 50 ? "VARIANT_A" : "VARIANT_B";
}

const num = (value: unknown) => Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0;
const date = (value: unknown) => value ? new Date(value as any) : null;

export type AttributionEnrollment = {
  id:string; campaignId:string; userId:string; status:string; experimentGroup:string; exposedAt?:Date|string|null; createdAt:Date|string;
  benefitFaceValue?:unknown; couponId?:string|null; campaign:{ id:string; name:string; benefitKind:string; attributionWindowDays:number; pointValueRupees?:unknown; couponAmount?:unknown; rewardPoints?:unknown };
  coupon?: { redemptions?: Array<{ orderId:string; redeemedAt?:Date|string; order?: { id:string; status:string; totalAmount:unknown; discountAmount?:unknown; createdAt:Date|string; orderNumber?:string } }> } | null;
};
export type AttributionOrder = { id:string; userId?:string|null; status:string; totalAmount:unknown; discountAmount?:unknown; createdAt:Date|string; orderNumber?:string };

export function phase87BuildAttribution(enrollments: AttributionEnrollment[], orders: AttributionOrder[]) {
  const eligible = enrollments.filter((e) => ["ISSUED","CONTROL"].includes(e.status));
  const byUser = new Map<string, AttributionEnrollment[]>();
  for (const e of eligible) { const rows=byUser.get(e.userId)||[]; rows.push(e); byUser.set(e.userId,rows); }
  for (const rows of byUser.values()) rows.sort((a,b) => (date(a.exposedAt||a.createdAt)?.getTime()||0) - (date(b.exposedAt||b.createdAt)?.getTime()||0));

  const direct = new Map<string, AttributionEnrollment>();
  for (const e of eligible) for (const r of e.coupon?.redemptions || []) direct.set(r.orderId,e);
  const attributed: Array<{order:AttributionOrder; enrollment:AttributionEnrollment; kind:"DIRECT_COUPON"|"LAST_TOUCH"}> = [];
  for (const order of orders.filter((o)=>o.status === "DELIVERED" && o.userId)) {
    let winner = direct.get(order.id); let kind:"DIRECT_COUPON"|"LAST_TOUCH" = "DIRECT_COUPON";
    if (!winner) {
      kind = "LAST_TOUCH";
      const at = date(order.createdAt)?.getTime() || 0;
      const candidates = (byUser.get(String(order.userId)) || []).filter((e) => {
        const exposure = date(e.exposedAt || e.createdAt)?.getTime() || 0;
        const windowMs = Math.max(1, Number(e.campaign.attributionWindowDays || 30)) * 86400000;
        return exposure <= at && at <= exposure + windowMs;
      });
      winner = candidates[candidates.length - 1];
    }
    if (winner) attributed.push({ order, enrollment:winner, kind });
  }
  return attributed;
}

export function phase87CampaignMetrics(campaign:any, enrollments:AttributionEnrollment[], attributed:ReturnType<typeof phase87BuildAttribution>) {
  const rows = enrollments.filter((e)=>e.campaignId===campaign.id && ["ISSUED","CONTROL"].includes(e.status));
  const conversions = attributed.filter((a)=>a.enrollment.campaignId===campaign.id);
  const groups = ["STANDARD","CONTROL","VARIANT_A","VARIANT_B"];
  const groupMetrics:any = {};
  for (const group of groups) {
    const exposed = rows.filter((e)=>e.experimentGroup===group);
    const ids = new Set(exposed.map((e)=>e.id));
    const conv = conversions.filter((a)=>ids.has(a.enrollment.id));
    const revenue = conv.reduce((s,a)=>s+num(a.order.totalAmount),0);
    let cost = 0;
    for (const e of exposed) {
      if (e.status !== "ISSUED") continue;
      const faceValue = num(e.benefitFaceValue ?? (e.campaign.benefitKind === "COUPON" ? e.campaign.couponAmount : e.campaign.rewardPoints));
      if (e.campaign.benefitKind === "REWARD_POINTS") cost += faceValue * num(e.campaign.pointValueRupees || 1);
      else if (conv.some((a)=>a.enrollment.id===e.id && a.kind==="DIRECT_COUPON")) cost += faceValue;
    }
    groupMetrics[group] = { exposed:exposed.length, conversions:conv.length, conversionRate:exposed.length ? conv.length/exposed.length : 0, revenue, incentiveCost:cost };
  }
  const treated = rows.filter((e)=>e.experimentGroup!=="CONTROL");
  const treatedIds = new Set(treated.map((e)=>e.id));
  const treatedConv = conversions.filter((a)=>treatedIds.has(a.enrollment.id));
  const control = groupMetrics.CONTROL;
  const treatedRate = treated.length ? treatedConv.length/treated.length : 0;
  const controlRate = control.exposed ? control.conversions/control.exposed : null;
  const measuredRevenue = conversions.reduce((s,a)=>s+num(a.order.totalAmount),0);
  const attributedRevenue = treatedConv.reduce((s,a)=>s+num(a.order.totalAmount),0);
  const cost = Object.values(groupMetrics).reduce((s:any,g:any)=>s+g.incentiveCost,0) as number;
  const directCouponConversions = treatedConv.filter((a)=>a.kind==="DIRECT_COUPON").length;
  const expectedControlConversions = controlRate == null ? null : controlRate * treated.length;
  const incrementalConversions = expectedControlConversions == null ? null : treatedConv.length - expectedControlConversions;
  const treatedAov = treatedConv.length ? attributedRevenue / treatedConv.length : 0;
  const incrementalRevenueEstimate = incrementalConversions == null ? null : Math.max(0, incrementalConversions) * treatedAov;
  return {
    campaignId:campaign.id, name:campaign.name, segment:campaign.segment, status:campaign.status, experimentMode:campaign.experimentMode,
    exposed:rows.length, treated:treated.length, control:control.exposed, conversions:treatedConv.length, measuredConversions:conversions.length, conversionRate:treated.length?treatedConv.length/treated.length:0,
    treatedConversionRate:treatedRate, controlConversionRate:controlRate, incrementalLiftPoints:controlRate==null?null:(treatedRate-controlRate)*100, incrementalConversions, incrementalRevenueEstimate,
    attributedRevenue, measuredRevenue, incentiveCost:cost, roiPercent:cost>0?((attributedRevenue-cost)/cost)*100:null, roas:cost>0?attributedRevenue/cost:null,
    directCouponConversions, postExposureConversions:treatedConv.length-directCouponConversions, groupMetrics,
  };
}
