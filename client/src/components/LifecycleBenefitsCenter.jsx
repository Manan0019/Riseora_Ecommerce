import { useEffect, useState } from "react";
import { apiFetch } from "../api/http";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const label = (value) => String(value || "").replaceAll("_", " ");
export default function LifecycleBenefitsCenter() {
  const [data, setData] = useState(null); const [error, setError] = useState("");
  useEffect(() => { apiFetch("/returns/phase86-lifecycle").then((r) => setData(r.data)).catch((e) => setError(e.message)); }, []);
  if (error) return <p className="alert error">{error}</p>;
  if (!data) return <section className="phase86-customer-journey"><p className="muted">Loading your Riseora journey…</p></section>;
  const p = data.profile || {};
  return <section className="phase86-customer-journey">
    <div className="phase86-customer-head"><div><p className="eyebrow">PHASE 86 · MY RISEORA JOURNEY</p><h2>Benefits matched to your journey</h2><p>Riseora uses your order and refill history to keep account benefits relevant. Active returns or support issues suppress new lifecycle promotions automatically.</p></div><span className="phase86-segment-pill">{label(p.segment)}</span></div>
    <div className="phase86-journey-kpis"><span><small>DELIVERED ORDERS</small><strong>{p.deliveredOrders || 0}</strong></span><span><small>LIFETIME WITH RISEORA</small><strong>{money(p.lifetimeSpend)}</strong></span><span><small>NEXT BEST STEP</small><strong>{label(p.nextBestAction)}</strong></span><span><small>REWARD BALANCE</small><strong>{data.rewardBalance || 0}</strong></span></div>
    {data.benefits?.length ? <div className="phase86-benefit-grid">{data.benefits.map((item) => <article key={item.id}><small>{item.campaignName}</small><strong>{item.benefitKind === "COUPON" ? `${money(item.couponAmount)} personal coupon` : `${item.rewardPoints} reward points`}</strong>{item.couponCode && <code>{item.couponCode}</code>}<p>{item.benefitKind === "COUPON" ? `Valid until ${item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : "expiry"}.` : "Already added to your reward balance."}</p></article>)}</div> : <p className="phase86-no-benefit">No active lifecycle benefit right now. Your normal rewards, refill reminders and account benefits continue as usual.</p>}
  </section>;
}
