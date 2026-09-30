import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/http";

export default function AdminAudience() {
  const [messages, setMessages] = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [recoveries, setRecoveries] = useState([]);
  const [tab, setTab] = useState("messages");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [m, n, r] = await Promise.all([
      apiFetch(`/admin/contact-messages${status ? `?status=${status}` : ""}`),
      apiFetch("/admin/newsletter"),
      apiFetch("/admin/cart-recoveries?status=ACTIVE"),
    ]);
    setMessages(m.data); setSubscribers(n.data); setRecoveries(r.data);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, [status]);

  const filteredMessages = useMemo(() => !search ? messages : messages.filter((item) => `${item.name} ${item.email} ${item.subject || ""} ${item.message}`.toLowerCase().includes(search.toLowerCase())), [messages, search]);
  const filteredSubscribers = useMemo(() => !search ? subscribers : subscribers.filter((item) => item.email.toLowerCase().includes(search.toLowerCase())), [subscribers, search]);
  const filteredRecoveries = useMemo(() => !search ? recoveries : recoveries.filter((item) => `${item.email} ${item.name || ""} ${item.phone || ""}`.toLowerCase().includes(search.toLowerCase())), [recoveries, search]);

  async function updateMessage(id, value) { await apiFetch(`/admin/contact-messages/${id}`, { method: "PATCH", body: JSON.stringify({ status: value }) }); await load(); }
  async function toggleSubscriber(item) { await apiFetch(`/admin/newsletter/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !item.isActive }) }); await load(); }
  function exportSubscribers() { const active = subscribers.filter((item) => item.isActive); const csv = ["email,name,source,subscribedAt", ...active.map((item) => [item.email, item.name || "", item.source || "", item.subscribedAt].map((v) => `"${String(v).replaceAll('"','""')}"`).join(","))].join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "riseora-newsletter-subscribers.csv"; a.click(); URL.revokeObjectURL(url); }

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">CUSTOMER CARE</p><h1>Audience & inbox</h1><p>Enquiries, consented subscribers and cart recovery signals.</p></div></div>
    {error && <p className="alert error">{error}</p>}
    <div className="admin-audience-toolbar"><div className="admin-tab-switch"><button className={tab === "messages" ? "active" : ""} onClick={() => setTab("messages")}>Messages ({messages.filter((m) => m.status === "NEW").length} new)</button><button className={tab === "newsletter" ? "active" : ""} onClick={() => setTab("newsletter")}>Newsletter ({subscribers.filter((s) => s.isActive).length})</button><button className={tab === "recovery" ? "active" : ""} onClick={() => setTab("recovery")}>Cart recovery ({recoveries.length})</button></div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" /></div>

    {tab === "messages" && <section className="admin-panel"><div className="admin-panel-head"><div><h2>Contact inbox</h2><p>Update the status as enquiries are handled.</p></div><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option>NEW</option><option>IN_PROGRESS</option><option>RESOLVED</option><option>SPAM</option></select></div><div className="contact-message-list">{filteredMessages.map((item) => <article key={item.id} className={item.status === "NEW" ? "contact-message unread" : "contact-message"}><div><strong>{item.name}</strong><a href={`mailto:${item.email}`}>{item.email}</a>{item.phone && <span>{item.phone}</span>}</div><div><b>{item.subject || "General enquiry"}</b><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div><select value={item.status} onChange={(e) => updateMessage(item.id, e.target.value)}><option>NEW</option><option>IN_PROGRESS</option><option>RESOLVED</option><option>SPAM</option></select></article>)}{!filteredMessages.length && <div className="admin-empty">No contact messages found.</div>}</div></section>}

    {tab === "newsletter" && <section className="admin-panel"><div className="admin-panel-head"><div><h2>Newsletter audience</h2><p>Consent-based storefront email list.</p></div><button className="button button-secondary" onClick={exportSubscribers}>Export active CSV</button></div><div className="subscriber-list">{filteredSubscribers.map((item) => <div key={item.id}><span><strong>{item.email}</strong><small>{item.source || "storefront"} · {new Date(item.subscribedAt).toLocaleDateString()}</small></span><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => toggleSubscriber(item)}>{item.isActive ? "Subscribed" : "Unsubscribed"}</button></div>)}{!filteredSubscribers.length && <div className="admin-empty">No subscribers found.</div>}</div></section>}

    {tab === "recovery" && <section className="admin-panel"><div className="admin-panel-head"><div><h2>Active checkout carts</h2><p>Customers who entered an email during checkout but have not completed the order yet. No recovery email is sent automatically in this phase.</p></div></div><div className="phase9-recovery-list">{filteredRecoveries.map((item) => { const cartItems = Array.isArray(item.items) ? item.items : []; return <article className="phase9-recovery-card" key={item.id}><div><strong>{item.name || "Checkout visitor"}</strong><a href={`mailto:${item.email}`}>{item.email}</a>{item.phone && <small>{item.phone}</small>}</div><div><b>₹{Number(item.subtotal).toFixed(0)} cart</b><p>{cartItems.slice(0, 3).map((line) => `${line.productName} × ${line.quantity}`).join(" · ")}{cartItems.length > 3 ? ` +${cartItems.length - 3} more` : ""}</p><small>Last active {new Date(item.lastSeenAt).toLocaleString()}</small></div></article>; })}{!filteredRecoveries.length && <div className="admin-empty">No active recoverable carts.</div>}</div></section>}
  </>;
}
