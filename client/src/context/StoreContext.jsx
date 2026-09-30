import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, mediaUrl } from "../api/http";

const StoreContext = createContext(null);
const fallback = { storeName: "Riseora Herbals", brandTagline: "Everyday herbal care, thoughtfully made.", freeShippingThreshold: 599 };

export function StoreProvider({ children }) {
  const [store, setStore] = useState(fallback);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch("/store/config").then((response) => setStore({ ...fallback, ...response.data })).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const icon = store.logoMarkUrl || store.logoUrl;
    let link = document.querySelector('link[rel~="icon"]');
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = icon ? mediaUrl(icon) : "/brand/riseora-Logo-Vertical.png";
  }, [store.logoMarkUrl, store.logoUrl]);
  const value = useMemo(() => ({ store, loading }), [store, loading]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}
