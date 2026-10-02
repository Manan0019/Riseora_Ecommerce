import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { Icon } from "./Icons";

function relativeTime(value) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const key = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", key); };
  }, [open]);

  if (!user) return null;
  const latest = notifications.slice(0, 6);
  return <div className="phase27-notification-wrap" ref={ref}>
    <button className="icon-action phase27-notification-button" type="button" onClick={() => setOpen((value) => !value)} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={open}>
      <Icon name="bell" size={20} />{unreadCount > 0 && <b>{unreadCount > 9 ? "9+" : unreadCount}</b>}
    </button>
    {open && <div className="phase27-notification-popover">
      <div className="phase27-notification-head"><div><small>MY RISEORA</small><strong>Notifications</strong></div>{unreadCount > 0 && <button type="button" onClick={markAllRead}>Mark all read</button>}</div>
      <div className="phase27-notification-mini-list">
        {latest.map((item) => <Link key={item.id} className={item.isRead ? "" : "unread"} to={item.ctaUrl || "/notifications"} onClick={() => { if (!item.isRead) void markRead(item.id); setOpen(false); }}>
          <span className={`phase27-notification-type ${String(item.type || "GENERAL").toLowerCase()}`}><Icon name={item.type === "ORDER" ? "package" : item.type === "CAMPAIGN" ? "sparkles" : "bell"} size={15} /></span>
          <p><strong>{item.title}</strong><small>{item.message}</small></p><time>{relativeTime(item.createdAt)}</time>
        </Link>)}
        {!latest.length && <div className="phase27-notification-empty"><Icon name="bell" size={24} /><strong>You’re all caught up</strong><small>Order and Riseora updates will appear here.</small></div>}
      </div>
      <Link className="phase27-notification-footer" to="/notifications" onClick={() => setOpen(false)}>View all notifications <Icon name="arrow" size={14} /></Link>
    </div>}
  </div>;
}
