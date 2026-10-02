import { Link } from "react-router-dom";
import { useNotifications } from "../context/NotificationContext";
import { Icon } from "../components/Icons";

function label(type) { return String(type || "GENERAL").replaceAll("_", " ").toLowerCase(); }

export default function Notifications() {
  const { notifications, unreadCount, loading, markRead, markAllRead, remove } = useNotifications();
  return <div className="container page-space phase27-notifications-page">
    <div className="phase27-notifications-title"><div><p className="eyebrow">MY RISEORA</p><h1>Notifications</h1><p>Order progress, account updates and relevant Riseora announcements in one place.</p></div>{unreadCount > 0 && <button className="button button-secondary" onClick={markAllRead}>Mark all read</button>}</div>
    <div className="phase27-notification-page-list">
      {notifications.map((item) => <article className={item.isRead ? "" : "unread"} key={item.id}>
        <span className={`phase27-notification-type ${String(item.type || "GENERAL").toLowerCase()}`}><Icon name={item.type === "ORDER" ? "package" : item.type === "CAMPAIGN" ? "sparkles" : item.type === "SUPPORT" ? "mail" : "bell"} size={18} /></span>
        <div><div className="phase27-notification-meta"><b>{label(item.type)}</b><time>{new Date(item.createdAt).toLocaleString()}</time></div><h2>{item.title}</h2><p>{item.message}</p><div className="phase27-notification-actions">{item.ctaUrl && <Link className="text-link" to={item.ctaUrl} onClick={() => !item.isRead && markRead(item.id)}>{item.ctaLabel || "Open"} →</Link>}{!item.isRead && <button type="button" onClick={() => markRead(item.id)}>Mark read</button>}<button type="button" className="danger-text" onClick={() => remove(item.id)}>Dismiss</button></div></div>
      </article>)}
      {!loading && !notifications.length && <div className="phase27-notification-page-empty"><Icon name="bell" size={36} /><h2>No notifications yet</h2><p>Your order updates and useful Riseora messages will appear here.</p><Link className="button" to="/shop">Explore products</Link></div>}
      {loading && !notifications.length && <div className="route-loading"><span /><i /><i /></div>}
    </div>
  </div>;
}
