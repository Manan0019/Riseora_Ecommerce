import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../api/http";
import { trackCommerce } from "../analytics";
import { readPersistedArray, writePersistedArray } from "../lib/persisted-state";
import { useAuth } from "./AuthContext";

const WishlistContext = createContext(null);
const GUEST_KEY = "riseora_wishlist";

function readGuest() {
  return readPersistedArray(window.localStorage, GUEST_KEY, { maxItems: 250, itemGuard: (item) => item && typeof item === "object" && Boolean(item.id) });
}
function writeGuest(items) { writePersistedArray(window.localStorage, GUEST_KEY, items, { maxItems: 250 }); }

export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState(readGuest);
  const [syncing, setSyncing] = useState(false);
  const activeUserId = useRef(null);
  const mutationQueue = useRef(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      activeUserId.current = null;
      setItems(readGuest());
      setSyncing(false);
      return () => { cancelled = true; };
    }
    const guest = readGuest();
    activeUserId.current = user.id;
    setSyncing(true);
    apiFetch("/wishlist/sync", { method: "POST", body: JSON.stringify({ productIds: guest.map((item) => item.id).filter(Boolean) }) })
      .then((response) => {
        if (cancelled || activeUserId.current !== user.id) return;
        setItems(Array.isArray(response.data) ? response.data : []);
        writeGuest([]);
      })
      .catch(() => {
        if (!cancelled && activeUserId.current === user.id) setItems(guest);
      })
      .finally(() => { if (!cancelled && activeUserId.current === user.id) setSyncing(false); });
    return () => { cancelled = true; };
  }, [user?.id]);

  async function toggle(product) {
    const removing = items.some((item) => item.id === product.id);
    const previous = items;
    const optimistic = removing ? items.filter((item) => item.id !== product.id) : [...items, product];
    setItems(optimistic);
    if (!user?.id) { writeGuest(optimistic); }
    else {
      mutationQueue.current = mutationQueue.current.then(() => apiFetch(`/wishlist/items/${product.id}`, { method: removing ? "DELETE" : "PUT" }));
      try {
        await mutationQueue.current;
      } catch {
        try {
          const response = await apiFetch("/wishlist");
          setItems(Array.isArray(response.data) ? response.data : previous);
        } catch { setItems(previous); }
      }
    }
    if (!removing) {
      const variant = product.variants?.find((item) => Number(item.stockQuantity || 0) > 0) || product.variants?.[0];
      if (variant) trackCommerce("add_to_wishlist", { items: [{ sku: variant.sku, variantId: variant.id, productName: product.name, variantName: variant.name, price: Number(variant.sellingPrice || 0), quantity: 1 }] });
    }
  }
  function has(id) { return items.some((item) => item.id === id); }
  const value = useMemo(() => ({ items, count: items.length, toggle, has, syncing, accountSynced: Boolean(user?.id) }), [items, syncing, user?.id]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() { return useContext(WishlistContext); }
