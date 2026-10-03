import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/http";
import { Icon } from "../../components/Icons";

function date(value) { return value ? new Date(value).toLocaleString("en-IN") : "—"; }

export default function AdminRefills() {
  const [data, setData] = useState(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function load() { const response = await apiFetch("/admin/refills/overview"); setData(response.data); }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  async function process() { setBusy(true); setMessage(""); setError(""); try { const response = await apiFetch("/admin/refills/process", { method: "POST" }); setMessage(response.message); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  if (!data) return <div className="admin-panel"><div className="phase18-inline-loader"><span /><span /><span /></div></div>;
  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">RETENTION</p><h1>Refill demand</h1><p>See repeat-purchase intent before customers run out, without forcing recurring orders.</p></div><button className="button" onClick={process} disabled={busy}>{busy ? "PROCESSING…" : "PROCESS DUE REFILLS"}</button></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    <section className="phase38-admin-kpis"><article><small>ACTIVE</small><strong>{data.active}</strong><span>customer reminders</span></article><article><small>DUE NOW</small><strong>{data.due}</strong><span>ready to notify</span></article><article><small>NEXT 7 DAYS</small><strong>{data.upcoming}</strong><span>upcoming demand</span></article><article><small>PAUSED</small><strong>{data.paused}</strong><span>customer controlled</span></article></section>
    <div className="phase38-admin-grid">
      <section className="admin-panel"><div className="admin-panel-head"><div><h2>Most requested refills</h2><p>Active reminder demand by variant.</p></div></div><div className="phase38-popular-refills">{data.popular.map((row) => <article key={row.variant.id}><span><Icon name="refresh" size={18} /></span><div><strong>{row.variant.product.name}</strong><small>{row.variant.name} · {row.variant.sku}</small></div><div><b>{row.activeReminders}</b><small>active</small></div><div><b>{row.averageDays}d</b><small>avg cycle</small></div></article>)}{!data.popular.length && <div className="admin-empty">No active refill demand yet.</div>}</div></section>
      <section className="admin-panel phase38-refill-guidance"><div className="admin-panel-head"><div><h2>How this should be used</h2><p>Customer-friendly replenishment, not auto-billing.</p></div></div><ul><li>Enable refill recommendations only on genuinely repeat-use products.</li><li>Choose a realistic suggested cycle such as 30, 45 or 60 days.</li><li>Use demand signals to plan inventory before reminder dates arrive.</li><li>Every reorder still uses current price, stock, purchase limits and checkout rules.</li></ul><Link className="text-link" to="/admin/catalog">Configure products →</Link></section>
    </div>
    <section className="admin-panel"><div className="admin-panel-head"><div><h2>Customer refill plans</h2><p>{data.recent.length} recent active/paused reminders shown.</p></div></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Customer</th><th>Product</th><th>Cycle</th><th>Next</th><th>Status</th><th>Reminders</th></tr></thead><tbody>{data.recent.map((row) => <tr key={row.id}><td><strong>{row.user.firstName} {row.user.lastName || ""}</strong><small>{row.user.email}</small></td><td><strong>{row.variant.product.name}</strong><small>{row.variant.name} · Qty {row.quantity}</small></td><td>{row.intervalDays} days</td><td>{date(row.nextReminderAt)}</td><td><span className={`status-pill status-${String(row.status).toLowerCase()}`}>{row.status}</span></td><td>{row.reminderCount}</td></tr>)}</tbody></table></div></section>
  </>;
}
