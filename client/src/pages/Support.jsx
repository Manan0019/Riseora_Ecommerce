import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import { Icon } from "../components/Icons";
import Seo from "../components/Seo";

const categories = ["GENERAL", "ORDER", "PAYMENT", "DELIVERY", "RETURN_REFUND", "PRODUCT", "ACCOUNT", "REWARDS"];
const pretty = (value) => String(value || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

export default function Support() {
  const { ticketNumber } = useParams();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [ticket, setTicket] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ category: "GENERAL", subject: "", orderNumber: "", message: "" });
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadTickets() { const r = await apiFetch("/support/tickets"); setTickets(r.data || []); }
  async function loadTicket(number = ticketNumber) { if (!number) { setTicket(null); return; } const r = await apiFetch(`/support/tickets/${encodeURIComponent(number)}`); setTicket(r.data); }
  useEffect(() => { loadTickets().catch((e) => setError(e.message)); }, []);
  useEffect(() => { loadTicket().catch((e) => setError(e.message)); }, [ticketNumber]);

  const openCount = useMemo(() => tickets.filter((item) => !["RESOLVED", "CLOSED", "SPAM"].includes(item.status)).length, [tickets]);

  async function createTicket(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { const r = await apiFetch("/support/tickets", { method: "POST", body: JSON.stringify(form) }); setCreating(false); setForm({ category: "GENERAL", subject: "", orderNumber: "", message: "" }); await loadTickets(); navigate(`/support/${r.data.ticketNumber}`); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function sendReply(event) {
    event.preventDefault(); if (!reply.trim()) return; setBusy(true); setError("");
    try { await apiFetch(`/support/tickets/${encodeURIComponent(ticketNumber)}/replies`, { method: "POST", body: JSON.stringify({ message: reply }) }); setReply(""); setMessage("Reply sent."); await Promise.all([loadTicket(), loadTickets()]); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function closeTicket() {
    if (!window.confirm("Close this support request?")) return;
    setBusy(true); try { await apiFetch(`/support/tickets/${encodeURIComponent(ticketNumber)}/close`, { method: "PATCH" }); await Promise.all([loadTicket(), loadTickets()]); setMessage("Support request closed."); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <><Seo title="My Support" noindex /><div className="container page-space phase37-support-page">
    <div className="phase37-support-heading"><div><p className="eyebrow">MY RISEORA</p><h1>Support</h1><p>{openCount} open request{openCount === 1 ? "" : "s"} · replies stay connected to one thread.</p></div><button className="button" onClick={() => { setCreating(true); if (ticketNumber) navigate("/support"); }}>+ New request</button></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    <div className="phase37-support-layout">
      <aside className="phase37-ticket-list"><div className="phase37-ticket-list-head"><strong>Your requests</strong><Link to="/help">Help Center</Link></div>{tickets.map((item) => <Link key={item.id} to={`/support/${item.ticketNumber}`} className={ticketNumber === item.ticketNumber ? "active" : ""}><div><b>{item.ticketNumber}</b><span className={`phase37-support-status ${String(item.status).toLowerCase()}`}>{pretty(item.status)}</span></div><strong>{item.subject || "Support request"}</strong><small>{pretty(item.category)} · {new Date(item.lastActivityAt).toLocaleString()}</small></Link>)}{!tickets.length && <div className="phase37-support-empty"><Icon name="mail" /><strong>No support requests yet</strong><p>If you need help, create a request and keep the full conversation in My Riseora.</p></div>}</aside>
      <main className="phase37-ticket-workspace">
        {creating && <form className="phase37-ticket-create" onSubmit={createTicket}><p className="eyebrow">NEW REQUEST</p><h2>Tell us what you need</h2><div className="form-grid two"><label>Topic<select value={form.category} onChange={(e) => setForm((v) => ({ ...v, category: e.target.value }))}>{categories.map((item) => <option key={item} value={item}>{pretty(item)}</option>)}</select></label><label>Order number (optional)<input value={form.orderNumber} onChange={(e) => setForm((v) => ({ ...v, orderNumber: e.target.value }))} placeholder="RISE-…" /></label></div><label>Subject<input required minLength="3" value={form.subject} onChange={(e) => setForm((v) => ({ ...v, subject: e.target.value }))} /></label><label>How can we help?<textarea required minLength="10" rows="7" value={form.message} onChange={(e) => setForm((v) => ({ ...v, message: e.target.value }))} /></label><div className="phase37-compose-actions"><button className="button" disabled={busy}>{busy ? "Sending…" : "Create support request"}</button><button type="button" className="button button-secondary" onClick={() => setCreating(false)}>Cancel</button></div></form>}
        {!creating && ticket && <><div className="phase37-ticket-head"><div><p className="eyebrow">{ticket.ticketNumber}</p><h2>{ticket.subject || "Support request"}</h2><div><span className={`phase37-support-status ${String(ticket.status).toLowerCase()}`}>{pretty(ticket.status)}</span><span>{pretty(ticket.category)}</span>{ticket.orderNumber && <Link to={`/orders/${ticket.orderNumber}`}>Order {ticket.orderNumber}</Link>}</div></div>{!["CLOSED", "SPAM"].includes(ticket.status) && <button className="button button-secondary" onClick={closeTicket} disabled={busy}>Close request</button>}</div><div className="phase37-thread">{(ticket.messages || []).map((item) => <article key={item.id} className={`phase37-thread-message ${String(item.sender).toLowerCase()}`}><div><strong>{item.sender === "ADMIN" ? "Riseora Support" : item.sender === "SYSTEM" ? "Riseora" : "You"}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div><p>{item.message}</p></article>)}</div>{!["CLOSED", "SPAM"].includes(ticket.status) && <form className="phase37-reply-box" onSubmit={sendReply}><label>Reply<textarea value={reply} onChange={(e) => setReply(e.target.value)} rows="4" placeholder="Add more details or reply to Riseora Support…" /></label><button className="button" disabled={busy || reply.trim().length < 2}>{busy ? "Sending…" : "Send reply"}</button></form>}</>}
        {!creating && !ticket && <div className="phase37-support-welcome"><Icon name="mail" size={36} /><h2>Support that stays organized</h2><p>Create a request for orders, payments, delivery, returns, products, account questions or rewards. Replies stay in one thread and signed-in customers also receive notifications.</p><button className="button" onClick={() => setCreating(true)}>Create a request</button></div>}
      </main>
    </div>
  </div></>;
}
