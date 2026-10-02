import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/http";
import { Icon } from "../../components/Icons";

function money(v) { return Number(v || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }); }
function when(v) { return v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "—"; }

export default function AdminPayments() {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [query, setQuery] = useState(""); const [message, setMessage] = useState("");
  async function load() { setLoading(true); try { const response = await apiFetch("/admin/payments/operations"); setData(response.data); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  const sessions = useMemo(() => (data?.sessions || []).filter((s) => !query || `${s.customerName} ${s.customerEmail || ""} ${s.customerPhone || ""} ${s.providerOrderId || ""}`.toLowerCase().includes(query.toLowerCase())), [data, query]);
  async function release(id) { if (!window.confirm("Release this pending reservation? Reserved stock and coupon usage will be returned.")) return; setMessage(""); try { const r = await apiFetch(`/admin/payments/checkout-sessions/${id}/release`, { method: "POST" }); setMessage(r.message || "Reservation released"); await load(); } catch (e) { setMessage(e.message); } }
  if (loading && !data) return <div className="admin-page"><p>Loading payment operations…</p></div>;
  const summary = data?.summary || {};
  return <div className="admin-page phase33-admin-payments"><div className="admin-page-header"><div><p className="eyebrow">CHECKOUT OPERATIONS</p><h1>Payments</h1><p>Recoverable Razorpay sessions, reserved stock and payment webhook health.</p></div><button className="button button-secondary" onClick={load}><Icon name="refresh" size={17} /> Refresh</button></div>
    {message && <p className="alert">{message}</p>}
    <div className="phase33-payment-stats"><article><small>ACTIVE RESERVATIONS</small><strong>{summary.pending || 0}</strong><span>Stock currently reserved</span></article><article><small>EXPIRED PENDING</small><strong>{summary.expiredPending || 0}</strong><span>Safe to release</span></article><article><small>PAID • 24H</small><strong>{summary.paid24h || 0}</strong><span>Online payments completed</span></article><article><small>WEBHOOKS • 24H</small><strong>{summary.webhook24h || 0}</strong><span>{summary.failedWebhook24h || 0} failed-payment events</span></article></div>
    <section className="admin-card"><div className="admin-card-head"><div><h2>Pending online checkouts</h2><p>A dismissed browser window no longer cancels these automatically. Reservations expire after 30 minutes unless payment completes.</p></div><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer or provider order" /></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Amount</th><th>Payment state</th><th>Provider</th><th>Expires</th><th></th></tr></thead><tbody>{sessions.map((s) => <tr key={s.id}><td><strong>{s.customerName}</strong><small>{s.customerEmail || s.customerPhone}</small></td><td>{money(s.totalAmount)}</td><td><span className={`phase33-pay-state ${(s.lastPaymentStatus || "reserved").toLowerCase()}`}>{s.lastPaymentStatus || "RESERVED"}</span><small>{s.lastPaymentError || `${s.paymentAttemptCount || 0} attempt(s)`}</small></td><td><small>{s.providerOrderId || "Provider order pending"}</small><small>{when(s.lastPaymentActivityAt)}</small></td><td><strong>{when(s.expiresAt)}</strong><small>{new Date(s.expiresAt) < new Date() ? "EXPIRED" : "Reserved"}</small></td><td><button className="table-action" disabled={new Date(s.expiresAt) >= new Date()} title={new Date(s.expiresAt) >= new Date() ? "Active reservations cannot be released while a delayed payment may still arrive" : "Release expired reservation"} onClick={() => release(s.id)}>Release</button></td></tr>)}{sessions.length === 0 && <tr><td colSpan="6">No pending payment sessions match this view.</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
