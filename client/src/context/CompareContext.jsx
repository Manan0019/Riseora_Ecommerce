import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { readPersistedArray, writePersistedArray } from "../lib/persisted-state";

const CompareContext = createContext(null);
const KEY = "riseora_compare_products";
const MAX = 3;

function readStored() {
  return readPersistedArray(window.localStorage, KEY, { maxItems: MAX, itemGuard: (item) => item && typeof item === "object" && Boolean(item.id) });
}

function snapshot(product) {
  const image = product.images?.find((item) => item.isPrimary) || product.images?.[0];
  return { id: product.id, slug: product.slug, name: product.name, imageUrl: image?.url || "", category: product.category?.name || "" };
}

export function CompareProvider({ children }) {
  const [items, setItems] = useState(readStored);
  useEffect(() => { writePersistedArray(window.localStorage, KEY, items, { maxItems: MAX }); }, [items]);
  function has(id) { return items.some((item) => item.id === id); }
  function toggle(product) {
    let accepted = true;
    setItems((current) => {
      if (current.some((item) => item.id === product.id)) return current.filter((item) => item.id !== product.id);
      if (current.length >= MAX) { accepted = false; return current; }
      return [...current, snapshot(product)];
    });
    return accepted;
  }
  function remove(id) { setItems((current) => current.filter((item) => item.id !== id)); }
  function clear() { setItems([]); }
  const value = useMemo(() => ({ items, count: items.length, max: MAX, has, toggle, remove, clear }), [items]);
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare() {
  const value = useContext(CompareContext);
  if (!value) throw new Error("useCompare must be used inside CompareProvider");
  return value;
}
