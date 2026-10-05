import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/http";
import { useAuth } from "./AuthContext";

const NotificationContext = createContext(null);
const EMPTY_SUMMARY = { all: 0, unread: 0, read: 0, actionRequired: 0, categories: { ORDERS: 0, SUPPORT: 0, REFILLS: 0, SHOPPING: 0, RISEORA: 0 } };

function fallbackCategory(type) {
  if (type === "ORDER") return "ORDERS";
  if (type === "SUPPORT") return "SUPPORT";
  if (type === "REFILL") return "REFILLS";
  if (type === "PRICE_DROP" || type === "STOCK_ALERT") return "SHOPPING";
  return "RISEORA";
}

function normaliseItem(item) {
  const inboxCategory = item.inboxCategory || fallbackCategory(item.type);
  const requiresAttention = typeof item.requiresAttention === "boolean"
    ? item.requiresAttention
    : Boolean(!item.isRead && item.ctaUrl && ["ORDER", "SUPPORT", "REFILL"].includes(item.type));
  return { ...item, inboxCategory, requiresAttention };
}

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setNotifications([]); setSummary(EMPTY_SUMMARY); return; }
    setLoading(true);
    try {
      const response = await apiFetch("/notifications/center?limit=80");
      const items = Array.isArray(response.data?.items) ? response.data.items.map(normaliseItem) : [];
      setNotifications(items);
      setSummary(response.data?.summary || EMPTY_SUMMARY);
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
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, isRead: true, requiresAttention: false, readAt: item.readAt || new Date().toISOString() } : item));
    try { await apiFetch(`/notifications/${id}/read`, { method: "PATCH" }); } finally { void refresh(); }
  }

  async function markAllRead() {
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true, requiresAttention: false, readAt: item.readAt || new Date().toISOString() })));
    try { await apiFetch("/notifications/read-all", { method: "PATCH" }); } finally { void refresh(); }
  }

  async function markFilteredRead({ category, actionableOnly = false } = {}) {
    await apiFetch("/notifications/read-filter", { method: "PATCH", body: JSON.stringify({ ...(category ? { category } : {}), actionableOnly }) });
    await refresh();
  }

  async function clearRead() {
    await apiFetch("/notifications/read", { method: "DELETE" });
    await refresh();
  }

  async function remove(id) {
    const removed = notifications.find((item) => item.id === id);
    setNotifications((current) => current.filter((item) => item.id !== id));
    try { await apiFetch(`/notifications/${id}`, { method: "DELETE" }); } catch { if (removed) setNotifications((current) => [removed, ...current]); }
    finally { void refresh(); }
  }

  const value = useMemo(() => ({ notifications, unreadCount: Number(summary.unread || 0), summary, loading, refresh, markRead, markAllRead, markFilteredRead, clearRead, remove }), [notifications, summary, loading, refresh]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationContext);
}
