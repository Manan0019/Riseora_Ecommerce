import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import { Icon } from "../components/Icons";

function date(value) { return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
function money(value) { return Number(value || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }); }
const labels = { ORDER_EARN: "Order reward", REVIEW_BONUS: "Verified review", REFERRAL_BONUS: "Referral reward", REFERRAL_WELCOME: "Referral welcome", VOUCHER_REDEEM: "Voucher redeemed", REVERSAL: "Adjustment", ADMIN_ADJUST: "Account adjustment" };

export default function Rewards() {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function load() { const response = await apiFetch("/rewards/me"); setData(response.data); }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  const available = Math.max(0, Number(data?.account?.balance || 0));
  const voucherTarget = Math.max(0, Number(data?.settings?.voucherPoints || 0));
  const pointsRemaining = Math.max(0, voucherTarget - available);
  const rewardProgress = voucherTarget > 0 ? Math.min(100, Math.round((available / voucherTarget) * 100)) : 0;
  const pointsPerHundred = Math.max(0, Number(data?.settings?.pointsPerHundred || 0));
  const estimatedSpendToVoucher = pointsPerHundred > 0 ? Math.ceil(pointsRemaining / pointsPerHundred) * 100 : 0;
  const canRedeem = Boolean(data?.settings?.enabled) && voucherTarget > 0 && available >= voucherTarget;
  const activeVouchers = useMemo(() => (data?.vouchers || []).filter((item) => item.isActive && Number(item.usageCount || 0) === 0 && (!item.endsAt || new Date(item.endsAt) > new Date())), [data]);
  async function copyReferral() { const url = `${window.location.origin}/register?ref=${encodeURIComponent(data.referralCode)}`; try { await navigator.clipboard.writeText(url); setMessage("Referral link copied."); } catch { setMessage(`Share this link: ${url}`); } }
  async function redeem() { if (!canRedeem || busy) return; if (!window.confirm(`Use ${data.settings.voucherPoints} points for a ${money(data.settings.voucherAmount)} voucher?`)) return; setBusy(true); setError(""); setMessage(""); try { const response = await apiFetch("/rewards/vouchers", { method: "POST" }); setMessage(`${response.data.code} is ready. Copy it into checkout.`); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  if (!data) return <div className="container page-space"><div className="route-loading"><span /></div></div>;
  return <div className="container page-space phase36-rewards-page">
    <div className="phase36-rewards-hero"><div><p className="eyebrow">RISEORA REWARDS</p><h1>Rewards that grow with your routine.</h1><p>Earn on delivered orders, verified reviews and successful referrals. Turn points into private checkout vouchers when you are ready.</p></div><div className="phase36-balance-orb"><small>AVAILABLE POINTS</small><strong>{available.toLocaleString("en-IN")}</strong><span>{data.account.balance < 0 ? "Future earnings will first clear your adjusted balance." : `${data.account.lifetimeEarned.toLocaleString("en-IN")} lifetime earned`}</span></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    {!data.settings.enabled && <p className="alert">Riseora Rewards is currently paused. Your existing point history remains safe.</p>}
    <section className="phase59-loyalty-momentum"><div><p className="eyebrow">LOYALTY MOMENTUM</p><h2>{canRedeem ? "Your next voucher is ready" : `${pointsRemaining.toLocaleString("en-IN")} points to your next voucher`}</h2><p>{canRedeem ? `You have enough points to unlock ${money(data.settings.voucherAmount)} off.` : pointsPerHundred > 0 ? `At the current earn rate, about ${money(estimatedSpendToVoucher)} of eligible delivered purchases would earn the remaining points.` : "Keep earning through eligible Riseora activity."}</p></div><div className="phase59-loyalty-meter"><div className="phase59-loyalty-track"><span style={{ width: `${rewardProgress}%` }} /></div><div><strong>{rewardProgress}%</strong><span>{available.toLocaleString("en-IN")} / {voucherTarget.toLocaleString("en-IN")} pts</span></div></div></section>
    <div className="phase36-reward-grid">
      <article className="phase36-reward-card"><span><Icon name="sparkles" /></span><small>EARN ON DELIVERY</small><strong>{data.settings.pointsPerHundred} pts / ₹100</strong><p>Points are credited only after an order is marked delivered, helping keep balances accurate.</p></article>
      <article className="phase36-reward-card"><span><Icon name="star" /></span><small>VERIFIED REVIEW</small><strong>+{data.settings.reviewBonusPoints} pts</strong><p>A verified-purchase review earns points once it is approved by Riseora.</p></article>
      <article className="phase36-reward-card"><span><Icon name="user" /></span><small>REFER A FRIEND</small><strong>+{data.settings.referralReferrerPoints} / +{data.settings.referralNewCustomerPoints}</strong><p>You earn the first amount; your friend earns the second after their first delivered order.</p></article>
    </div>
    <div className="phase36-rewards-layout">
      <section className="phase36-voucher-panel"><p className="eyebrow">SPEND POINTS</p><h2>Your next reward voucher</h2><div className="phase36-voucher-value"><strong>{money(data.settings.voucherAmount)} OFF</strong><span>{data.settings.voucherPoints} points</span></div><p>Valid on orders from {money(data.settings.voucherMinOrderAmount)}. Each generated voucher is private to your Riseora account.</p><button className="button wide" disabled={!canRedeem || busy} onClick={redeem}>{busy ? "CREATING…" : canRedeem ? `REDEEM ${data.settings.voucherPoints} POINTS` : `${Math.max(0, data.settings.voucherPoints - available)} MORE POINTS TO UNLOCK`}</button></section>
      <section className="phase36-referral-panel"><p className="eyebrow">SHARE RISEORA</p><h2>Your referral code</h2><code>{data.referralCode}</code><p>{data.referralCount} joined · {data.successfulReferrals} successful referral reward{data.successfulReferrals === 1 ? "" : "s"}</p><button className="button button-secondary" onClick={copyReferral}>COPY REFERRAL LINK</button>{data.referredByName && <small>You joined through {data.referredByName}'s referral.</small>}</section>
    </div>
    {activeVouchers.length > 0 && <section className="phase36-active-vouchers phase62-reward-wallet"><div className="section-heading"><div><p className="eyebrow">READY TO USE</p><h2>Your reward vouchers</h2><p>Phase 62 can compare these private vouchers against your current checkout without exposing them to anyone else.</p></div><Link to="/checkout" className="text-link">Open savings advisor →</Link></div><div>{activeVouchers.map((item) => <article key={item.id}><div><small>PRIVATE VOUCHER</small><strong>{item.code}</strong><span>{money(item.discountValue)} off · min {money(item.minOrderAmount)}</span></div><div className="phase62-voucher-actions"><button onClick={() => navigator.clipboard?.writeText(item.code)}>Copy</button><Link to={`/checkout?coupon=${encodeURIComponent(item.code)}`}>Use at checkout</Link></div><small>Valid until {item.endsAt ? date(item.endsAt) : "used"}</small></article>)}</div></section>}
    <section className="phase36-reward-history"><div className="section-heading"><div><p className="eyebrow">POINT HISTORY</p><h2>Rewards activity</h2></div></div><div>{(data.transactions || []).map((item) => <article key={item.id}><span className={item.points >= 0 ? "positive" : "negative"}>{item.points >= 0 ? "+" : ""}{item.points}</span><div><strong>{labels[item.type] || item.type}</strong><p>{item.description}</p></div><small>{date(item.createdAt)} · balance {item.balanceAfter}</small></article>)}{!data.transactions?.length && <p className="muted">Your points history will appear here after your first eligible activity.</p>}</div></section>
  </div>;
}
