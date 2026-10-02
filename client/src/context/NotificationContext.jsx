import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/http";
import { useAuth } from "./AuthContext";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setNotifications([]); setUnreadCount(0); return; }
    setLoading(true);
    try {
      const response = await apiFetch("/notifications?limit=30");
      setNotifications(response.data || []);
      setUnreadCount(Number(response.unreadCount || 0));
    } catch {
      // Notification failures must never block shopping/authentication.
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    void refresh();
    if (!user) return undefined;
    const timer = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [user, refresh]);

  async function markRead(id) {
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, isRead: true, readAt: item.readAt || new Date().toISOString() } : item));
    setUnreadCount((count) => Math.max(0, count - (notifications.find((item) => item.id === id && !item.isRead) ? 1 : 0)));
    try { await apiFetch(`/notifications/${id}/read`, { method: "PATCH" }); } catch { void refresh(); }
  }

  async function markAllRead() {
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() })));
    setUnreadCount(0);
    try { await apiFetch("/notifications/read-all", { method: "PATCH" }); } catch { void refresh(); }
  }

  async function remove(id) {
    const removed = notifications.find((item) => item.id === id);
    setNotifications((current) => current.filter((item) => item.id !== id));
    if (removed && !removed.isRead) setUnreadCount((count) => Math.max(0, count - 1));
    try { await apiFetch(`/notifications/${id}`, { method: "DELETE" }); } catch { void refresh(); }
  }

  const value = useMemo(() => ({ notifications, unreadCount, loading, refresh, markRead, markAllRead, remove }), [notifications, unreadCount, loading, refresh]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationContext);
}
