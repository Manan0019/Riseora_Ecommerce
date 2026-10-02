import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/http";
import { Icon } from "../../components/Icons";

const pretty = (v) => String(v || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
const statuses = ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED", "SPAM"];
const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
const categories = ["GENERAL", "ORDER", "PAYMENT", "DELIVERY", "RETURN_REFUND", "PRODUCT", "ACCOUNT", "REWARDS"];

export default function AdminSupport() {
  const [overview, setOverview] = useState({});
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ status: "", priority: "", category: "", search: "" });
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [emailFailures, setEmailFailures] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const q = new URLSearchParams(); Object.entries(filters).forEach(([k, v]) => v && q.set(k, v));
    const [o, t, e] = await Promise.all([apiFetch("/admin/support/overview"), apiFetch(`/admin/support/tickets?${q}`), apiFetch("/admin/support/email-deliveries?failedOnly=true")]);
    setOverview(o.data || {}); setTickets(t.data || []); setEmailFailures(e.data || []);
  }
  async function open(item) { const r = await apiFetch(`/admin/support/tickets/${item.id}`); setSelected(r.data); setReply(""); setInternal(false); }
  useEffect(() => { const timer = setTimeout(() => load().catch((e) => setError(e.message)), 180); return () => clearTimeout(timer); }, [filters.status, filters.priority, filters.category, filters.search]);
  const active = useMemo(() => tickets.filter((t) => !["RESOLVED", "CLOSED", "SPAM"].includes(t.status)).length, [tickets]);

  async function update(patch) {
    if (!selected) return; setBusy(true); setError(""); setMessage("");
    try { await apiFetch(`/admin/support/tickets/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) }); const latest = await apiFetch(`/admin/support/tickets/${selected.id}`); setSelected(latest.data); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function sendReply(event) {
    event.preventDefault(); if (!selected || reply.trim().length < 2) return; setBusy(true); setError("");
    try { await apiFetch(`/admin/support/tickets/${selected.id}/replies`, { method: "POST", body: JSON.stringify({ message: reply, internal }) }); setReply(""); setMessage(internal ? "Internal note added." : "Reply sent to customer."); const latest = await apiFetch(`/admin/support/tickets/${selected.id}`); setSelected(latest.data); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <><div className="admin-page-heading"><div><p className="eyebrow">CUSTOMER CARE</p><h1>Support operations</h1><p>One queue for customer questions, replies, order context and communication health.</p></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    <div className="phase37-support-kpis"><article><span><Icon name="mail" /></span><div><small>NEW</small><strong>{overview.newCount || 0}</strong></div></article><article><span><Icon name="clock" /></span><div><small>ACTIVE</small><strong>{overview.active || active}</strong></div></article><article><span><Icon name="user" /></span><div><small>WAITING CUSTOMER</small><strong>{overview.waiting || 0}</strong></div></article><article className={(overview.urgent || 0) > 0 ? "attention" : ""}><span><Icon name="alert" /></span><div><small>URGENT</small><strong>{overview.urgent || 0}</strong></div></article><article className={(overview.failedEmails24h || 0) > 0 ? "attention" : ""}><span><Icon name="mail" /></span><div><small>EMAIL FAILURES · 24H</small><strong>{overview.failedEmails24h || 0}</strong></div></article></div>
    <section className="phase37-admin-support-shell"><aside><div className="phase37-support-filters"><input value={filters.search} onChange={(e) => setFilters((v) => ({ ...v, search: e.target.value }))} placeholder="Search ticket, customer, order…" /><select value={filters.status} onChange={(e) => setFilters((v) => ({ ...v, status: e.target.value }))}><option value="">All statuses</option>{statuses.map((v) => <option key={v}>{v}</option>)}</select><select value={filters.priority} onChange={(e) => setFilters((v) => ({ ...v, priority: e.target.value }))}><option value="">All priorities</option>{priorities.map((v) => <option key={v}>{v}</option>)}</select><select value={filters.category} onChange={(e) => setFilters((v) => ({ ...v, category: e.target.value }))}><option value="">All topics</option>{categories.map((v) => <option key={v}>{v}</option>)}</select></div><div className="phase37-admin-ticket-list">{tickets.map((item) => <button key={item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => open(item)}><div><b>{item.ticketNumber}</b><span className={`phase37-support-priority ${item.priority.toLowerCase()}`}>{item.priority}</span></div><strong>{item.subject || "Support request"}</strong><small>{item.name} · {pretty(item.status)}</small><time>{new Date(item.lastActivityAt).toLocaleString()}</time></button>)}{!tickets.length && <div className="admin-empty">No support tickets match these filters.</div>}</div></aside>
      <main>{selected ? <><div className="phase37-admin-ticket-head"><div><p className="eyebrow">{selected.ticketNumber}</p><h2>{selected.subject || "Support request"}</h2><p>{selected.name} · <a href={`mailto:${selected.email}`}>{selected.email}</a>{selected.phone ? ` · ${selected.phone}` : ""}</p>{selected.orderNumber && <p><strong>Order:</strong> {selected.orderNumber}</p>}</div><button className="button button-secondary" onClick={() => update({ assignToMe: true })}>Assign to me</button></div><div className="phase37-admin-ticket-controls"><label>Status<select value={selected.status} onChange={(e) => update({ status: e.target.value })}>{statuses.map((v) => <option key={v}>{v}</option>)}</select></label><label>Priority<select value={selected.priority} onChange={(e) => update({ priority: e.target.value })}>{priorities.map((v) => <option key={v}>{v}</option>)}</select></label><label>Topic<select value={selected.category} onChange={(e) => update({ category: e.target.value })}>{categories.map((v) => <option key={v}>{v}</option>)}</select></label></div><div className="phase37-admin-thread">{(selected.messages || []).map((item) => <article key={item.id} className={`${item.sender.toLowerCase()} ${item.isInternal ? "internal" : ""}`}><div><strong>{item.isInternal ? "Internal note" : item.sender === "ADMIN" ? "Riseora Support" : item.sender === "CUSTOMER" ? selected.name : "System"}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div><p>{item.message}</p></article>)}</div><form className="phase37-admin-reply" onSubmit={sendReply}><label className="checkbox-row"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note — do not send to customer</label><textarea rows="5" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={internal ? "Write a private operations note…" : "Reply to the customer…"} /><button className="button" disabled={busy || reply.trim().length < 2}>{busy ? "Saving…" : internal ? "Add internal note" : "Send reply"}</button></form></> : <div className="phase37-admin-support-empty"><Icon name="mail" size={34} /><h2>Select a support request</h2><p>Open a ticket to review the full conversation, assign priority and reply.</p></div>}</main></section>
    {emailFailures.length > 0 && <section className="admin-panel phase37-email-health"><div className="admin-panel-head"><div><h2>Recent email delivery failures</h2><p>Transactional email failures are logged without blocking the customer’s support thread.</p></div><span className="phase37-support-status urgent">{emailFailures.length} shown</span></div><div>{emailFailures.slice(0, 12).map((item) => <article key={item.id}><div><strong>{item.template}</strong><small>{item.toEmail}</small></div><p>{item.errorMessage || "Provider delivery failed"}</p><time>{new Date(item.createdAt).toLocaleString()}</time></article>)}</div></section>}
  </>;
}
