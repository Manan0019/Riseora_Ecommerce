import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import { useNotifications } from "../context/NotificationContext";
import { Icon } from "../components/Icons";

const FILTERS = [
  ["ALL", "All"],
  ["ATTENTION", "Needs attention"],
  ["ORDERS", "Orders"],
  ["SUPPORT", "Support"],
  ["REFILLS", "Refills"],
  ["SHOPPING", "Shopping"],
  ["RISEORA", "Riseora"],
];

function label(type) { return String(type || "GENERAL").replaceAll("_", " ").toLowerCase(); }
function iconFor(item) {
  if (item.type === "ORDER") return "package";
  if (item.type === "SUPPORT") return "mail";
  if (item.type === "REFILL") return "refresh";
  if (item.type === "CAMPAIGN") return "sparkles";
  if (item.type === "PRICE_DROP") return "tag";
  if (item.type === "STOCK_ALERT") return "bell";
  return "bell";
}
function countFor(summary, key) {
  if (key === "ALL") return Number(summary.all || 0);
  if (key === "ATTENTION") return Number(summary.actionRequired || 0);
  return Number(summary.categories?.[key] || 0);
}

export default function Notifications() {
  const { notifications, unreadCount, summary, loading, markRead, markAllRead, markFilteredRead, clearRead, remove } = useNotifications();
  const [filter, setFilter] = useState("ALL");
  const [preferences, setPreferences] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/privacy/preferences")
      .then((response) => setPreferences(response.data?.preference || null))
      .catch(() => {});
  }, []);

  const visible = useMemo(() => notifications.filter((item) => {
    if (filter === "ALL") return true;
    if (filter === "ATTENTION") return Boolean(item.requiresAttention);
    return item.inboxCategory === filter;
  }), [notifications, filter]);
  const visibleUnread = visible.filter((item) => !item.isRead).length;

  async function markVisibleRead() {
    setBusy("mark"); setError("");
    try {
      if (filter === "ATTENTION") await markFilteredRead({ actionableOnly: true });
      else if (filter === "ALL") await markAllRead();
      else await markFilteredRead({ category: filter });
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  }

  async function clearReadItems() {
    if (!window.confirm("Clear all notifications you have already read?")) return;
    setBusy("clear"); setError("");
    try { await clearRead(); } catch (e) { setError(e.message); } finally { setBusy(""); }
  }

  return <div className="container page-space phase27-notifications-page phase61-communications-center">
    <div className="phase27-notifications-title">
      <div><p className="eyebrow">MY RISEORA · PHASE 61</p><h1>Updates & communication center</h1><p>Prioritized order, support, refill, shopping and Riseora updates in one calmer inbox.</p></div>
      <div className="phase61-title-actions">{unreadCount > 0 && <button className="button button-secondary" onClick={markAllRead}>Mark all read</button>}<Link className="button button-secondary" to="/privacy-center">Communication choices</Link></div>
    </div>
    {error && <p className="alert error">{error}</p>}

    <section className="phase61-inbox-summary" aria-label="Notification summary">
      <article><small>Unread</small><strong>{summary.unread || 0}</strong><span>{summary.unread ? "New updates waiting" : "You’re caught up"}</span></article>
      <article className={(summary.actionRequired || 0) > 0 ? "attention" : ""}><small>Needs attention</small><strong>{summary.actionRequired || 0}</strong><span>Order, support or refill actions</span></article>
      <article><small>Orders</small><strong>{summary.categories?.ORDERS || 0}</strong><span>Order & return progress</span></article>
      <article><small>Shopping</small><strong>{summary.categories?.SHOPPING || 0}</strong><span>Price & stock alerts</span></article>
    </section>

    <section className="phase61-preference-strip">
      <div><p className="eyebrow">COMMUNICATION CHOICES</p><strong>Essential service updates stay separate from optional marketing.</strong><span>Order, payment, security, support and reminders you request remain available. Optional promotional channels are controlled in Privacy Center.</span></div>
      <div className="phase61-preference-pills">
        <span className={preferences?.emailMarketing ? "on" : "off"}>Email marketing · {preferences?.emailMarketing ? "On" : "Off"}</span>
        <span className={preferences?.smsMarketing ? "on" : "off"}>SMS · {preferences?.smsMarketing ? "On" : "Off"}</span>
        <span className={preferences?.whatsappMarketing ? "on" : "off"}>WhatsApp · {preferences?.whatsappMarketing ? "On" : "Off"}</span>
      </div>
      <Link className="text-link" to="/privacy-center">Manage choices →</Link>
    </section>

    <div className="phase61-filter-row" role="tablist" aria-label="Notification filters">
      {FILTERS.map(([key, text]) => <button key={key} type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)} role="tab" aria-selected={filter === key}>{text}<b>{countFor(summary, key)}</b></button>)}
    </div>

    <div className="phase61-inbox-tools">
      <span>{visible.length} shown · {visibleUnread} unread</span>
      <div>{visibleUnread > 0 && <button type="button" onClick={markVisibleRead} disabled={busy === "mark"}>{busy === "mark" ? "Updating…" : "Mark visible read"}</button>}{(summary.read || 0) > 0 && <button type="button" onClick={clearReadItems} disabled={busy === "clear"}>{busy === "clear" ? "Clearing…" : "Clear read"}</button>}</div>
    </div>

    <div className="phase27-notification-page-list">
      {visible.map((item) => <article className={`${item.isRead ? "" : "unread"}${item.requiresAttention ? " phase61-needs-attention" : ""}`} key={item.id}>
        <span className={`phase27-notification-type ${String(item.type || "GENERAL").toLowerCase()}`}><Icon name={iconFor(item)} size={18} /></span>
        <div>
          <div className="phase27-notification-meta"><b>{label(item.type)}</b>{item.requiresAttention && <em>Needs attention</em>}<time>{new Date(item.createdAt).toLocaleString()}</time></div>
          <h2>{item.title}</h2><p>{item.message}</p>
          <div className="phase27-notification-actions">{item.ctaUrl && <Link className="text-link" to={item.ctaUrl} onClick={() => !item.isRead && markRead(item.id)}>{item.ctaLabel || "Open"} →</Link>}{!item.isRead && <button type="button" onClick={() => markRead(item.id)}>Mark read</button>}<button type="button" className="danger-text" onClick={() => remove(item.id)}>Dismiss</button></div>
        </div>
      </article>)}
      {!loading && !visible.length && <div className="phase27-notification-page-empty"><Icon name={filter === "ATTENTION" ? "check" : "bell"} size={36} /><h2>{filter === "ATTENTION" ? "Nothing needs your attention" : "No updates in this view"}</h2><p>{filter === "ALL" ? "Order updates and useful Riseora messages will appear here." : "Choose another filter or continue shopping."}</p><Link className="button" to="/shop">Explore products</Link></div>}
      {loading && !notifications.length && <div className="route-loading"><span /><i /><i /></div>}
    </div>
  </div>;
}
