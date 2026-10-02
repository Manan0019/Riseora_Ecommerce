import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/http";

export default function AdminAudience() {
  const [messages, setMessages] = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [recoveries, setRecoveries] = useState([]);
  const [stockAlerts, setStockAlerts] = useState([]);
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [stockEmailConfigured, setStockEmailConfigured] = useState(false);
  const [priceEmailConfigured, setPriceEmailConfigured] = useState(false);
  const [recoveryEmailConfigured, setRecoveryEmailConfigured] = useState(false);
  const [recoveryAutomationEnabled, setRecoveryAutomationEnabled] = useState(false);
  const [tab, setTab] = useState("messages");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [m, n, r, s, p] = await Promise.all([
      apiFetch(`/admin/contact-messages${status ? `?status=${status}` : ""}`),
      apiFetch("/admin/newsletter"),
      apiFetch("/admin/cart-recoveries?status=ACTIVE"),
      apiFetch("/admin/stock-alerts"),
      apiFetch("/admin/price-alerts"),
    ]);
    setMessages(m.data); setSubscribers(n.data); setRecoveries(r.data); setStockAlerts(s.data); setPriceAlerts(p.data); setStockEmailConfigured(Boolean(s.emailConfigured)); setPriceEmailConfigured(Boolean(p.emailConfigured)); setRecoveryEmailConfigured(Boolean(r.emailConfigured)); setRecoveryAutomationEnabled(Boolean(r.automationEnabled));
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, [status]);

  const filteredMessages = useMemo(() => !search ? messages : messages.filter((item) => `${item.name} ${item.email} ${item.subject || ""} ${item.message}`.toLowerCase().includes(search.toLowerCase())), [messages, search]);
  const filteredSubscribers = useMemo(() => !search ? subscribers : subscribers.filter((item) => item.email.toLowerCase().includes(search.toLowerCase())), [subscribers, search]);
  const filteredRecoveries = useMemo(() => !search ? recoveries : recoveries.filter((item) => `${item.email} ${item.name || ""} ${item.phone || ""}`.toLowerCase().includes(search.toLowerCase())), [recoveries, search]);
  const filteredStockAlerts = useMemo(() => !search ? stockAlerts : stockAlerts.filter((item) => `${item.email} ${item.name || ""} ${item.variant?.product?.name || ""} ${item.variant?.name || ""}`.toLowerCase().includes(search.toLowerCase())), [stockAlerts, search]);
  const filteredPriceAlerts = useMemo(() => !search ? priceAlerts : priceAlerts.filter((item) => `${item.email} ${item.name || ""} ${item.variant?.product?.name || ""} ${item.variant?.name || ""}`.toLowerCase().includes(search.toLowerCase())), [priceAlerts, search]);

  async function updateMessage(id, value) { await apiFetch(`/admin/contact-messages/${id}`, { method: "PATCH", body: JSON.stringify({ status: value }) }); await load(); }
  async function toggleSubscriber(item) { await apiFetch(`/admin/newsletter/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !item.isActive }) }); await load(); }
  async function cancelStockAlert(item) { await apiFetch(`/admin/stock-alerts/${item.id}`, { method: "PATCH", body: JSON.stringify({ status: item.status === "CANCELLED" ? "PENDING" : "CANCELLED" }) }); await load(); }
  async function notifyReady() {
    setMessage(""); setError("");
    try { const response = await apiFetch("/admin/stock-alerts/notify-ready", { method: "POST" }); setMessage(response.message); await load(); }
    catch (e) { setError(e.message); }
  }
  async function togglePriceAlert(item) { await apiFetch(`/admin/price-alerts/${item.id}`, { method: "PATCH", body: JSON.stringify({ status: item.status === "CANCELLED" ? "PENDING" : "CANCELLED" }) }); await load(); }
  async function notifyPriceDrops() {
    setMessage(""); setError("");
    try { const response = await apiFetch("/admin/price-alerts/notify-ready", { method: "POST" }); setMessage(response.message); await load(); }
    catch (e) { setError(e.message); }
  }
  async function sendRecovery(item) {
    setMessage(""); setError("");
    try { const response = await apiFetch(`/admin/cart-recoveries/${item.id}/send`, { method: "POST" }); setMessage(response.message); await load(); }
    catch (e) { setError(e.message); }
  }
  async function dismissRecovery(item) {
    setMessage(""); setError("");
    try { await apiFetch(`/admin/cart-recoveries/${item.id}`, { method: "PATCH", body: JSON.stringify({ status: "DISMISSED" }) }); setMessage("Cart recovery dismissed."); await load(); }
    catch (e) { setError(e.message); }
  }
  function exportSubscribers() { const active = subscribers.filter((item) => item.isActive); const csv = ["email,name,source,subscribedAt", ...active.map((item) => [item.email, item.name || "", item.source || "", item.subscribedAt].map((v) => `"${String(v).replaceAll('"','""')}"`).join(","))].join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "riseora-newsletter-subscribers.csv"; a.click(); URL.revokeObjectURL(url); }

  const pendingStock = stockAlerts.filter((item) => item.status === "PENDING").length;
  const pendingPrice = priceAlerts.filter((item) => item.status === "PENDING").length;

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">CUSTOMER CARE</p><h1>Audience & inbox</h1><p>Enquiries, subscribers, checkout signals and back-in-stock demand.</p></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    <div className="admin-audience-toolbar"><div className="admin-tab-switch"><button className={tab === "messages" ? "active" : ""} onClick={() => setTab("messages")}>Messages ({messages.filter((m) => m.status === "NEW").length} new)</button><button className={tab === "newsletter" ? "active" : ""} onClick={() => setTab("newsletter")}>Newsletter ({subscribers.filter((s) => s.isActive).length})</button><button className={tab === "recovery" ? "active" : ""} onClick={() => setTab("recovery")}>Cart recovery ({recoveries.length})</button><button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}>Stock alerts ({pendingStock})</button><button className={tab === "price" ? "active" : ""} onClick={() => setTab("price")}>Price watches ({pendingPrice})</button></div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" /></div>

    {tab === "messages" && <section className="admin-panel"><div className="admin-panel-head"><div><h2>Contact inbox</h2><p>Update the status as enquiries are handled.</p></div><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option>NEW</option><option>IN_PROGRESS</option><option>WAITING_CUSTOMER</option><option>RESOLVED</option><option>CLOSED</option><option>SPAM</option></select></div><div className="contact-message-list">{filteredMessages.map((item) => <article key={item.id} className={item.status === "NEW" ? "contact-message unread" : "contact-message"}><div><strong>{item.name}</strong><a href={`mailto:${item.email}`}>{item.email}</a>{item.phone && <span>{item.phone}</span>}</div><div><b>{item.subject || "General enquiry"}</b><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div><select value={item.status} onChange={(e) => updateMessage(item.id, e.target.value)}><option>NEW</option><option>IN_PROGRESS</option><option>WAITING_CUSTOMER</option><option>RESOLVED</option><option>CLOSED</option><option>SPAM</option></select></article>)}{!filteredMessages.length && <div className="admin-empty">No contact messages found.</div>}</div></section>}

    {tab === "newsletter" && <section className="admin-panel"><div className="admin-panel-head"><div><h2>Newsletter audience</h2><p>Consent-based storefront email list.</p></div><button className="button button-secondary" onClick={exportSubscribers}>Export active CSV</button></div><div className="subscriber-list">{filteredSubscribers.map((item) => <div key={item.id}><span><strong>{item.email}</strong><small>{item.source || "storefront"} · {new Date(item.subscribedAt).toLocaleDateString()}</small></span><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => toggleSubscriber(item)}>{item.isActive ? "Subscribed" : "Unsubscribed"}</button></div>)}{!filteredSubscribers.length && <div className="admin-empty">No subscribers found.</div>}</div></section>}

    {tab === "recovery" && <section className="admin-panel"><div className="admin-panel-head"><div><h2>Active checkout carts</h2><p>{recoveryEmailConfigured ? (recoveryAutomationEnabled ? "Consent-based recovery email automation is enabled." : "Email is configured. Automatic recovery is disabled, but opted-in carts can be reminded manually.") : "Email delivery is not configured. Cart signals are still stored for admin visibility."}</p></div></div><div className="phase9-recovery-list">{filteredRecoveries.map((item) => { const cartItems = Array.isArray(item.items) ? item.items : []; return <article className="phase9-recovery-card phase11-recovery-card" key={item.id}><div><strong>{item.name || "Checkout visitor"}</strong><a href={`mailto:${item.email}`}>{item.email}</a>{item.phone && <small>{item.phone}</small>}<small>{item.recoveryOptIn ? "Recovery email consent: YES" : "Recovery email consent: NO"}</small></div><div><b>₹{Number(item.subtotal).toFixed(0)} cart</b><p>{cartItems.slice(0, 3).map((line) => `${line.productName} × ${line.quantity}`).join(" · ")}{cartItems.length > 3 ? ` +${cartItems.length - 3} more` : ""}</p><small>Last active {new Date(item.lastSeenAt).toLocaleString()} · reminders {item.reminderCount || 0}/2</small></div><div className="phase11-recovery-actions"><button className="button button-secondary" disabled={!item.recoveryOptIn || !recoveryEmailConfigured || Number(item.reminderCount || 0) >= 2} onClick={() => sendRecovery(item)}>Send reminder</button><button className="state-toggle" onClick={() => dismissRecovery(item)}>Dismiss</button></div></article>; })}{!filteredRecoveries.length && <div className="admin-empty">No active recoverable carts.</div>}</div></section>}

    {tab === "stock" && <section className="admin-panel"><div className="admin-panel-head"><div><h2>Back-in-stock demand</h2><p>{stockEmailConfigured ? "Email delivery is configured. Restocking from Inventory also attempts notifications automatically." : "Email delivery is not configured yet. Alerts will remain pending until Resend is configured."}</p></div><button className="button button-secondary" onClick={notifyReady}>Notify ready stock</button></div><div className="phase10-stock-admin-list">{filteredStockAlerts.map((item) => <article key={item.id}><span><strong>{item.variant?.product?.name || "Product"}</strong><small>{item.variant?.name} · stock {item.variant?.stockQuantity}</small></span><span><a href={`mailto:${item.email}`}>{item.email}</a><small>{new Date(item.subscribedAt).toLocaleString()}</small></span><b className={`phase10-alert-status ${item.status.toLowerCase()}`}>{item.status}</b>{item.status !== "NOTIFIED" && <button className="state-toggle" onClick={() => cancelStockAlert(item)}>{item.status === "CANCELLED" ? "Reactivate" : "Cancel"}</button>}</article>)}{!filteredStockAlerts.length && <div className="admin-empty">No back-in-stock requests yet.</div>}</div></section>}

    {tab === "price" && <section className="admin-panel"><div className="admin-panel-head"><div><h2>Price-drop demand</h2><p>{priceEmailConfigured ? "Price watches are active. Eligible drops can be delivered by email and signed-in customers also receive an in-app alert." : "Email delivery is not configured. Price watches stay pending until Resend is configured."}</p></div><button className="button button-secondary" onClick={notifyPriceDrops}>Process price drops</button></div><div className="phase29-price-admin-list">{filteredPriceAlerts.map((item) => { const current = Number(item.variant?.sellingPrice || 0); const subscribed = Number(item.subscribedPrice || 0); const target = item.targetPrice == null ? null : Number(item.targetPrice); const eligible = item.status === "PENDING" && current < subscribed && (target == null || current <= target); return <article key={item.id}><span><strong>{item.variant?.product?.name || "Product"}</strong><small>{item.variant?.name} · current ₹{current.toFixed(0)}</small></span><span><a href={`mailto:${item.email}`}>{item.email}</a><small>Watching from ₹{subscribed.toFixed(0)}{target == null ? " · any drop" : ` · target ₹${target.toFixed(0)}`}</small></span><b className={`phase29-alert-status ${eligible ? "eligible" : String(item.status).toLowerCase()}`}>{eligible ? "READY" : item.status}</b>{item.status !== "NOTIFIED" && <button className="state-toggle" onClick={() => togglePriceAlert(item)}>{item.status === "CANCELLED" ? "Reactivate" : "Cancel"}</button>}</article>; })}{!filteredPriceAlerts.length && <div className="admin-empty">No price watches yet.</div>}</div></section>}
  </>;
}
