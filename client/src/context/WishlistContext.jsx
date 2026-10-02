import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { trackCommerce } from "../lib/analytics";

const WishlistContext = createContext(null);
const KEY = "riseora_wishlist";

export function WishlistProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  });

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);

  function toggle(product) {
    const removing = items.some((item) => item.id === product.id);
    setItems((current) => removing ? current.filter((item) => item.id !== product.id) : [...current, product]);
    if (!removing) {
      const variant = product.variants?.find((item) => Number(item.stockQuantity || 0) > 0) || product.variants?.[0];
      if (variant) trackCommerce("add_to_wishlist", { items: [{ sku: variant.sku, variantId: variant.id, productName: product.name, variantName: variant.name, price: Number(variant.sellingPrice || 0), quantity: 1 }] });
    }
  }
  function has(id) { return items.some((item) => item.id === id); }

  const value = useMemo(() => ({ items, count: items.length, toggle, has }), [items]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() { return useContext(WishlistContext); }
