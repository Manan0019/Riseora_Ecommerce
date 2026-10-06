import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { trackCommerce, trackEvent } from "../analytics";
import { apiFetch } from "../api/http";
import { useAuth } from "./AuthContext";
import { readPersistedArray, writePersistedArray } from "../lib/persisted-state";

const CartContext = createContext(null);
const STORAGE_KEY = "riseora_cart";
const LATER_STORAGE_KEY = "riseora_cart_saved_for_later";
const BUY_NOW_KEY = "riseora_buy_now";
const CART_OWNER_KEY = "riseora_cart_owner";
const CART_DIRTY_KEY = "riseora_cart_dirty";
const CART_REVISION_KEY = "riseora_cart_revision";

function normalizeStoredLine(item) {
  if (!item || typeof item !== "object" || !item.variantId || !item.productId) return null;
  const quantity = Math.max(1, Number(item.quantity || 1));
  const price = Number(item.price || 0);
  const mrp = Number(item.mrp || 0);
  const stockQuantity = Math.max(0, Number(item.stockQuantity || 0));
  return {
    ...item,
    quantity: Number.isFinite(quantity) ? quantity : 1,
    price: Number.isFinite(price) ? price : 0,
    mrp: Number.isFinite(mrp) ? mrp : 0,
    stockQuantity: Number.isFinite(stockQuantity) ? stockQuantity : 0,
  };
}

function readInitialCart() {
  if (typeof window === "undefined") return [];
  return readPersistedArray(window.localStorage, STORAGE_KEY, { maxItems: 250 })
    .map(normalizeStoredLine)
    .filter(Boolean);
}

function readInitialSavedForLater() {
  if (typeof window === "undefined") return [];
  return readPersistedArray(window.localStorage, LATER_STORAGE_KEY, { maxItems: 250 })
    .map(normalizeStoredLine)
    .filter(Boolean);
}

function readInitialBuyNow() {
  if (typeof window === "undefined") return [];
  return readPersistedArray(window.sessionStorage, BUY_NOW_KEY, { maxItems: 20 })
    .map(normalizeStoredLine)
    .filter(Boolean);
}

function normalizePurchaseLimit(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toCartLine(product, variant, quantity = 1) {
  const stock = Math.max(0, Number(variant?.stockQuantity || 0));
  if (!product?.id || !variant?.id || stock <= 0) return null;
  const primary = product.images?.find((item) => item.isPrimary) || product.images?.[0];
  const maxPurchaseQuantity = normalizePurchaseLimit(product.maxPurchaseQuantity);
  const allowed = Math.min(stock, maxPurchaseQuantity ?? stock);
  return {
    variantId: variant.id,
    productId: product.id,
    productSlug: product.slug,
    productName: product.name,
    variantName: variant.name,
    sku: variant.sku,
    price: Number(variant.sellingPrice),
    mrp: Number(variant.mrp),
    stockQuantity: stock,
    weightGrams: Math.max(0, Number(variant?.weightGrams || 0)),
    maxPurchaseQuantity,
    imageUrl: primary?.url || "",
    quantity: Math.max(1, Math.min(allowed, Number(quantity || 1))),
  };
}

function productQuantity(lines, productId, excludeVariantId = "") {
  return lines.reduce((sum, item) => item.productId === productId && item.variantId !== excludeVariantId ? sum + Number(item.quantity || 0) : sum, 0);
}

function addLine(lines, product, variant, quantity = 1) {
  const stock = Math.max(0, Number(variant?.stockQuantity || 0));
  if (!stock || !product?.id || !variant?.id) return lines;
  const limit = normalizePurchaseLimit(product.maxPurchaseQuantity);
  const existing = lines.find((item) => item.variantId === variant.id);
  const otherProductQty = productQuantity(lines, product.id, variant.id);
  const maxForVariant = Math.max(0, Math.min(stock, limit == null ? stock : limit - otherProductQty));
  if (maxForVariant <= 0) return lines;

  if (existing) {
    return lines.map((item) =>
      item.variantId === variant.id
        ? { ...item, stockQuantity: stock, maxPurchaseQuantity: limit, quantity: Math.min(maxForVariant, item.quantity + Number(quantity || 1)) }
        : item,
    );
  }

  const line = toCartLine(product, variant, Math.min(maxForVariant, Number(quantity || 1)));
  return line ? [...lines, line] : lines;
}


function readCartOwner() {
  try { return window.localStorage.getItem(CART_OWNER_KEY) || ""; } catch { return ""; }
}

function readCartDirty() {
  try { return window.localStorage.getItem(CART_DIRTY_KEY) === "1"; } catch { return false; }
}

function markStoredCartOwner(userId) {
  try {
    if (userId) window.localStorage.setItem(CART_OWNER_KEY, userId);
    else window.localStorage.removeItem(CART_OWNER_KEY);
  } catch { /* ownership metadata is best effort */ }
}

function markStoredCartDirty(dirty) {
  try {
    if (dirty) window.localStorage.setItem(CART_DIRTY_KEY, "1");
    else window.localStorage.removeItem(CART_DIRTY_KEY);
  } catch { /* dirty metadata is best effort */ }
}

function readStoredCartRevision() {
  try {
    const value = Number(window.localStorage.getItem(CART_REVISION_KEY) || 0);
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}

function markStoredCartRevision(revision) {
  try {
    const value = Number(revision || 0);
    if (Number.isInteger(value) && value >= 0) window.localStorage.setItem(CART_REVISION_KEY, String(value));
    else window.localStorage.removeItem(CART_REVISION_KEY);
  } catch { /* revision metadata is best effort */ }
}

function toAccountCartRequest(lines) {
  return (Array.isArray(lines) ? lines : [])
    .filter((item) => item?.variantId && Number(item?.quantity || 0) > 0)
    .slice(0, 50)
    .map((item) => ({ variantId: item.variantId, quantity: Math.max(1, Math.min(99, Math.trunc(Number(item.quantity || 1)))) }));
}

function cartRequestSignature(lines) {
  return toAccountCartRequest(lines).map((item) => `${item.variantId}:${item.quantity}`).sort().join("|");
}

function bagRequestSignature(items, savedForLater) {
  return `A:${cartRequestSignature(items)}|L:${cartRequestSignature(savedForLater)}`;
}

function fullCartSignature(lines) {
  return (Array.isArray(lines) ? lines : []).map((item) => [item.variantId, item.quantity, item.price, item.mrp, item.stockQuantity, item.maxPurchaseQuantity ?? ""].join(":" )).sort().join("|");
}

export function CartProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState(readInitialCart);
  const [savedForLater, setSavedForLater] = useState(readInitialSavedForLater);
  const [buyNowItems, setBuyNowItems] = useState(readInitialBuyNow);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState("local");
  const [syncNotice, setSyncNotice] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [savedBagConflict, setSavedBagConflict] = useState(null);
  const itemsRef = useRef(items);
  const savedForLaterRef = useRef(savedForLater);
  const syncUserRef = useRef("");
  const syncReadyRef = useRef(false);
  const lastServerSignatureRef = useRef("");
  const serverRevisionRef = useRef(readStoredCartRevision());

  useEffect(() => {
    writePersistedArray(window.localStorage, STORAGE_KEY, items, { maxItems: 250 });
  }, [items]);

  useEffect(() => {
    writePersistedArray(window.localStorage, LATER_STORAGE_KEY, savedForLater, { maxItems: 250 });
  }, [savedForLater]);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { savedForLaterRef.current = savedForLater; }, [savedForLater]);

  function applyServerBag(data, notice = "") {
    const canonical = Array.isArray(data?.items) ? data.items : [];
    const later = Array.isArray(data?.savedForLater) ? data.savedForLater : [];
    const revision = Math.max(0, Number(data?.revision || 0));
    lastServerSignatureRef.current = bagRequestSignature(canonical, later);
    serverRevisionRef.current = revision;
    syncReadyRef.current = true;
    markStoredCartOwner(user?.id || syncUserRef.current);
    markStoredCartDirty(false);
    markStoredCartRevision(revision);
    setSavedBagConflict(null);
    setItems(canonical);
    setSavedForLater(later);
    setSyncStatus("synced");
    setLastSyncedAt(data?.savedAt || new Date().toISOString());
    setSyncNotice(notice);
  }

  function handleSavedBagConflict(error) {
    if (error?.code !== "ACCOUNT_CART_REVISION_CONFLICT") return false;
    const current = error?.payload?.data || null;
    if (!current) return false;
    const revision = Math.max(0, Number(current.revision || 0));
    serverRevisionRef.current = revision;
    markStoredCartRevision(revision);
    markStoredCartDirty(true);
    syncReadyRef.current = false;
    setSavedBagConflict({ items: Array.isArray(current.items) ? current.items : [], savedForLater: Array.isArray(current.savedForLater) ? current.savedForLater : [], revision, savedAt: current.savedAt || null });
    setSyncStatus("conflict");
    setSyncNotice("Your Saved Bag changed on another device. Choose the account version or keep this browser bag before checkout.");
    return true;
  }

  useEffect(() => {
    if (authLoading) return undefined;
    if (!user?.id) {
      const storedOwner = readCartOwner();
      if (syncUserRef.current || storedOwner) {
        syncUserRef.current = "";
        syncReadyRef.current = false;
        lastServerSignatureRef.current = "";
        serverRevisionRef.current = 0;
        markStoredCartOwner("");
        markStoredCartDirty(false);
        markStoredCartRevision(0);
        setSavedBagConflict(null);
        setSyncStatus("local");
        setSyncNotice("");
        setLastSyncedAt(null);
        setItems([]);
        setSavedForLater([]);
      }
      return undefined;
    }

    let active = true;
    const userId = user.id;
    const storedOwner = readCartOwner();
    const localDirty = readCartDirty();
    let browserItems = toAccountCartRequest(itemsRef.current);
    let browserSavedForLater = toAccountCartRequest(savedForLaterRef.current);
    let method = "GET";
    let endpoint = "/account/cart";
    let body;

    if (!storedOwner) {
      method = "POST";
      endpoint = "/account/cart/merge";
      body = JSON.stringify({ items: browserItems, savedForLater: browserSavedForLater });
    } else if (storedOwner === userId && localDirty) {
      method = "PUT";
      body = JSON.stringify({ items: browserItems, savedForLater: browserSavedForLater, expectedRevision: readStoredCartRevision() });
    } else if (storedOwner !== userId) {
      browserItems = [];
      browserSavedForLater = [];
      itemsRef.current = [];
      savedForLaterRef.current = [];
      setItems([]);
      setSavedForLater([]);
      markStoredCartDirty(false);
      markStoredCartRevision(0);
      serverRevisionRef.current = 0;
    }

    const browserSignature = bagRequestSignature(browserItems, browserSavedForLater);
    syncUserRef.current = userId;
    syncReadyRef.current = false;
    setSyncStatus("syncing");
    setSyncNotice("");

    apiFetch(endpoint, { method, ...(body ? { body } : {}) })
      .then((response) => {
        if (!active || syncUserRef.current !== userId) return;
        if (method !== "GET" && bagRequestSignature(itemsRef.current, savedForLaterRef.current) !== browserSignature) {
          markStoredCartDirty(true);
          setSyncAttempt((value) => value + 1);
          return;
        }
        const data = response?.data || {};
        const adjustmentCount = Array.isArray(data.adjustments) ? data.adjustments.length : 0;
        const mergedBoth = Number(data.merge?.accountLineCount || 0) > 0 && Number(data.merge?.browserLineCount || 0) > 0;
        const notice = adjustmentCount
          ? `${adjustmentCount} saved-bag ${adjustmentCount === 1 ? "item was" : "items were"} refreshed for current stock or purchase limits.`
          : mergedBoth ? "This browser bag and your Riseora account bag were merged safely." : "";
        applyServerBag(data, notice);
      })
      .catch((error) => {
        if (!active || syncUserRef.current !== userId) return;
        if (handleSavedBagConflict(error)) return;
        syncReadyRef.current = false;
        if (method === "PUT") markStoredCartDirty(true);
        setSyncStatus("error");
        setSyncNotice("Your bag is still safe on this browser. Account sync can be retried.");
      });

    return () => { active = false; };
  }, [authLoading, user?.id, syncAttempt]);

  useEffect(() => {
    if (!user?.id || !syncReadyRef.current || syncUserRef.current !== user.id) return undefined;
    const requestSignature = bagRequestSignature(items, savedForLater);
    if (requestSignature === lastServerSignatureRef.current) return undefined;

    setSyncStatus("syncing");
    const userId = user.id;
    const timer = window.setTimeout(() => {
      const sentItems = toAccountCartRequest(itemsRef.current);
      const sentSavedForLater = toAccountCartRequest(savedForLaterRef.current);
      const sentSignature = bagRequestSignature(sentItems, sentSavedForLater);
      apiFetch("/account/cart", { method: "PUT", body: JSON.stringify({ items: sentItems, savedForLater: sentSavedForLater, expectedRevision: serverRevisionRef.current }) })
        .then((response) => {
          if (syncUserRef.current !== userId) return;
          if (bagRequestSignature(itemsRef.current, savedForLaterRef.current) !== sentSignature) return;
          const data = response?.data || {};
          const canonical = Array.isArray(data.items) ? data.items : [];
          const canonicalLater = Array.isArray(data.savedForLater) ? data.savedForLater : [];
          const adjustmentCount = Array.isArray(data.adjustments) ? data.adjustments.length : 0;
          applyServerBag(data, adjustmentCount ? `${adjustmentCount} bag ${adjustmentCount === 1 ? "item was" : "items were"} adjusted to current stock or purchase limits.` : "");
          if (fullCartSignature(itemsRef.current) !== fullCartSignature(canonical)) setItems(canonical);
          if (fullCartSignature(savedForLaterRef.current) !== fullCartSignature(canonicalLater)) setSavedForLater(canonicalLater);
        })
        .catch((error) => {
          if (syncUserRef.current !== userId) return;
          if (handleSavedBagConflict(error)) return;
          markStoredCartDirty(true);
          setSyncStatus("error");
          setSyncNotice("Your bag remains saved on this browser. Use Retry account sync when you are ready.");
        });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [items, savedForLater, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let checking = false;
    const userId = user.id;
    const refreshFromAccount = () => {
      if (checking || document.visibilityState === "hidden" || syncUserRef.current !== userId || syncStatus === "syncing" || syncStatus === "conflict" || readCartDirty()) return;
      checking = true;
      apiFetch("/account/cart", { dedupe: false })
        .then((response) => {
          if (syncUserRef.current !== userId) return;
          const data = response?.data || {};
          const revision = Math.max(0, Number(data.revision || 0));
          if (revision > serverRevisionRef.current) applyServerBag(data, "Your Saved Bag was updated on another device and refreshed here.");
        })
        .catch(() => {})
        .finally(() => { checking = false; });
    };
    const onVisibility = () => { if (document.visibilityState === "visible") refreshFromAccount(); };
    window.addEventListener("focus", refreshFromAccount);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("focus", refreshFromAccount); document.removeEventListener("visibilitychange", onVisibility); };
  }, [user?.id, syncStatus]);

  useEffect(() => {
    try {
      if (buyNowItems.length) writePersistedArray(window.sessionStorage, BUY_NOW_KEY, buyNowItems, { maxItems: 20 });
      else sessionStorage.removeItem(BUY_NOW_KEY);
    } catch { /* buy-now persistence is best effort */ }
  }, [buyNowItems]);

  function markCartDirty() {
    if (user?.id) {
      markStoredCartOwner(user.id);
      markStoredCartDirty(true);
    }
  }

  function addItem(product, variant, quantity = 1) {
    markCartDirty();
    setItems((current) => addLine(current, product, variant, quantity));
    trackCommerce("add_to_cart", { items: [{ sku: variant?.sku, variantId: variant?.id, productName: product?.name, variantName: variant?.name, price: Number(variant?.sellingPrice || 0), quantity }], value: Number(variant?.sellingPrice || 0) * Number(quantity || 1), source: "cart_add" });
    setDrawerOpen(true);
  }

  function addItems(entries = []) {
    markCartDirty();
    const source = Array.isArray(entries) ? entries : [];
    if (!source.length) return false;
    setItems((current) => {
      let next = [...current];
      for (const entry of source) {
        if (!entry?.product || !entry?.variant) continue;
        next = addLine(next, entry.product, entry.variant, Number(entry.quantity || 1));
      }
      return next;
    });
    const analyticsLines = source.filter((entry) => entry?.product && entry?.variant).map((entry) => ({ sku: entry.variant.sku, variantId: entry.variant.id, productName: entry.product.name, variantName: entry.variant.name, price: Number(entry.variant.sellingPrice || 0), quantity: Number(entry.quantity || 1) }));
    trackCommerce("add_to_cart", { items: analyticsLines, source: "multi_add" });
    setDrawerOpen(true);
    return true;
  }

  function startBuyNow(product, variant, quantity = 1) {
    const line = toCartLine(product, variant, quantity);
    if (!line) return false;
    setBuyNowItems([line]);
    trackCommerce("add_to_cart", { items: [line], value: Number(line.price || 0) * Number(line.quantity || 1), source: "buy_now" });
    trackEvent("buy_now", { item_id: line.sku || line.variantId, value: Number(line.price || 0) * Number(line.quantity || 1), currency: "INR" });
    setDrawerOpen(false);
    return true;
  }

  function clearBuyNow() {
    setBuyNowItems([]);
  }

  function openCart() { setDrawerOpen(true); }
  function closeCart() { setDrawerOpen(false); }

  function addDeal(deal) {
    markCartDirty();
    const additions = [];
    if (deal?.type === "BUNDLE_DISCOUNT") {
      for (const row of deal.resolvedItems || []) {
        if (row?.variant?.id && row?.variant?.product) additions.push({ product: row.variant.product, variant: row.variant, quantity: Number(row.quantity || 1) });
      }
    } else if (deal?.type === "BUY_X_GET_Y" && deal.buyVariant?.id && deal.buyVariant?.product) {
      additions.push({ product: deal.buyVariant.product, variant: deal.buyVariant, quantity: Number(deal.buyQuantity || 1) });
    } else {
      return false;
    }
    if (!additions.length) return false;
    setItems((current) => {
      let next = [...current];
      for (const addition of additions) next = addLine(next, addition.product, addition.variant, addition.quantity);
      return next;
    });
    trackCommerce("add_to_cart", { items: additions.map((addition) => ({ sku: addition.variant.sku, variantId: addition.variant.id, productName: addition.product.name, variantName: addition.variant.name, price: Number(addition.variant.sellingPrice || 0), quantity: addition.quantity })), source: "deal" });
    trackEvent("select_promotion", { promotion_id: deal.id || deal.slug, promotion_name: deal.name, creative_slot: "deal_add" });
    setDrawerOpen(true);
    return true;
  }

  function updateQuantity(variantId, quantity) {
    markCartDirty();
    setItems((current) => {
      const target = current.find((item) => item.variantId === variantId);
      if (!target) return current;
      const otherProductQty = productQuantity(current, target.productId, variantId);
      const limit = normalizePurchaseLimit(target.maxPurchaseQuantity);
      const stock = Math.max(0, Number(target.stockQuantity || 0));
      const maxForVariant = Math.max(0, Math.min(stock, limit == null ? stock : limit - otherProductQty));
      return current
        .map((item) =>
          item.variantId === variantId
            ? { ...item, quantity: Math.max(0, Math.min(maxForVariant, Number(quantity || 0))) }
            : item,
        )
        .filter((item) => item.quantity > 0);
    });
  }

  function removeItem(variantId) {
    markCartDirty();
    const line = items.find((item) => item.variantId === variantId);
    if (line) trackCommerce("remove_from_cart", { items: [line], value: Number(line.price || 0) * Number(line.quantity || 1) });
    setItems((current) => current.filter((item) => item.variantId !== variantId));
  }

  function saveForLaterItem(variantId) {
    const line = itemsRef.current.find((item) => item.variantId === variantId);
    if (!line) return false;
    markCartDirty();
    setItems((current) => current.filter((item) => item.variantId !== variantId));
    setSavedForLater((current) => {
      const existing = current.find((item) => item.variantId === variantId);
      if (existing) return current.map((item) => item.variantId === variantId ? { ...line, quantity: Math.max(Number(existing.quantity || 1), Number(line.quantity || 1)) } : item);
      return [...current, line].slice(0, 50);
    });
    trackCommerce("remove_from_cart", { items: [line], value: Number(line.price || 0) * Number(line.quantity || 1), source: "save_for_later" });
    trackEvent("save_for_later", { item_id: line.sku || line.variantId, quantity: Number(line.quantity || 1) });
    return true;
  }

  function moveSavedToCart(variantId) {
    const line = savedForLaterRef.current.find((item) => item.variantId === variantId);
    if (!line || Number(line.stockQuantity || 0) <= 0) return false;
    const currentItems = itemsRef.current;
    const existing = currentItems.find((item) => item.variantId === variantId);
    const otherProductQty = productQuantity(currentItems, line.productId, variantId);
    const limit = normalizePurchaseLimit(line.maxPurchaseQuantity);
    const stock = Math.max(0, Number(line.stockQuantity || 0));
    const maxForVariant = Math.max(0, Math.min(stock, limit == null ? stock : limit - otherProductQty));
    if (maxForVariant <= 0) return false;
    const desired = Math.min(maxForVariant, Math.max(Number(existing?.quantity || 0), Number(line.quantity || 1)));
    markCartDirty();
    setSavedForLater((current) => current.filter((item) => item.variantId !== variantId));
    setItems((current) => {
      const currentExisting = current.find((item) => item.variantId === variantId);
      if (currentExisting) return current.map((item) => item.variantId === variantId ? { ...line, quantity: desired } : item);
      return [...current, { ...line, quantity: desired }];
    });
    trackCommerce("add_to_cart", { items: [{ ...line, quantity: desired }], value: Number(line.price || 0) * desired, source: "restore_from_later" });
    trackEvent("restore_from_later", { item_id: line.sku || line.variantId, quantity: desired });
    return true;
  }

  function removeSavedForLater(variantId) {
    markCartDirty();
    setSavedForLater((current) => current.filter((item) => item.variantId !== variantId));
  }

  function refreshCartFacts(readinessLines) {
    const rows = Array.isArray(readinessLines) ? readinessLines : [];
    if (!rows.length) return;
    const byVariant = new Map(rows.filter((row) => row?.variantId).map((row) => [row.variantId, row]));
    setItems((current) => current.map((item) => {
      const row = byVariant.get(item.variantId);
      if (!row || !row.productId) return item;
      return {
        ...item,
        productId: row.productId,
        productSlug: row.productSlug || item.productSlug,
        productName: row.productName || item.productName,
        variantName: row.variantName || item.variantName,
        sku: row.sku || item.sku,
        imageUrl: row.imageUrl || item.imageUrl,
        price: Number(row.price || 0),
        mrp: Number(row.mrp || 0),
        stockQuantity: Math.max(0, Number(row.stockQuantity || 0)),
        weightGrams: Math.max(0, Number(row.weightGrams || 0)),
        maxPurchaseQuantity: normalizePurchaseLimit(row.maxPurchaseQuantity),
      };
    }));
  }

  function applySafeCartQuantities(readinessLines) {
    const rows = Array.isArray(readinessLines) ? readinessLines : [];
    if (!rows.length) return false;
    const byVariant = new Map(rows.filter((row) => row?.variantId).map((row) => [row.variantId, row]));
    markCartDirty();
    setItems((current) => current.map((item) => {
      const row = byVariant.get(item.variantId);
      if (!row) return item;
      const safeQuantity = Math.max(0, Number(row.safeQuantity || 0));
      return {
        ...item,
        productId: row.productId || item.productId,
        productSlug: row.productSlug || item.productSlug,
        productName: row.productName || item.productName,
        variantName: row.variantName || item.variantName,
        sku: row.sku || item.sku,
        imageUrl: row.imageUrl || item.imageUrl,
        price: Number(row.price || item.price || 0),
        mrp: Number(row.mrp || item.mrp || 0),
        stockQuantity: Math.max(0, Number(row.stockQuantity || 0)),
        weightGrams: Math.max(0, Number(row.weightGrams || 0)),
        maxPurchaseQuantity: normalizePurchaseLimit(row.maxPurchaseQuantity),
        quantity: safeQuantity,
      };
    }).filter((item) => Number(item.quantity || 0) > 0));
    return true;
  }

  function clearCart() {
    markCartDirty();
    setItems([]);
  }

  function replaceCart(nextItems) {
    markCartDirty();
    const source = Array.isArray(nextItems) ? nextItems : [];
    const safe = [];
    for (const item of source) {
      if (!item?.variantId || !item?.productId || Number(item?.stockQuantity || 0) <= 0) continue;
      const stock = Number(item.stockQuantity || 0);
      const limit = normalizePurchaseLimit(item.maxPurchaseQuantity);
      const otherProductQty = productQuantity(safe, item.productId);
      const allowed = Math.max(0, Math.min(stock, limit == null ? stock : limit - otherProductQty));
      if (allowed <= 0) continue;
      safe.push({
        ...item,
        maxPurchaseQuantity: limit,
        quantity: Math.max(1, Math.min(allowed, Number(item.quantity || 1))),
      });
    }
    setItems(safe);
  }

  async function resolveSavedBagConflict(strategy) {
    if (!user?.id || !savedBagConflict) return false;
    const browserItems = toAccountCartRequest(itemsRef.current);
    const browserSavedForLater = toAccountCartRequest(savedForLaterRef.current);
    setSyncStatus("syncing");
    try {
      const response = await apiFetch("/account/cart/resolve", {
        method: "POST",
        body: JSON.stringify({ strategy, items: browserItems, savedForLater: browserSavedForLater, expectedRevision: savedBagConflict.revision }),
      });
      const data = response?.data || {};
      applyServerBag(data, strategy === "ACCOUNT" ? "Account Saved Bag loaded. This browser now matches your latest account version." : "This browser bag is now the account Saved Bag on every device.");
      return true;
    } catch (error) {
      if (handleSavedBagConflict(error)) return false;
      markStoredCartDirty(true);
      setSyncStatus("error");
      setSyncNotice("Riseora could not resolve the Saved Bag yet. Your browser copy is still safe.");
      return false;
    }
  }

  function useAccountSavedBag() { return resolveSavedBagConflict("ACCOUNT"); }
  function keepBrowserSavedBag() { return resolveSavedBagConflict("BROWSER"); }

  function retrySavedBagSync() {
    if (!user?.id) return;
    syncReadyRef.current = false;
    lastServerSignatureRef.current = "";
    setSyncAttempt((value) => value + 1);
  }

  const count = items.reduce((sum, item) => sum + Math.max(0, Number(item?.quantity || 0)), 0);
  const subtotal = items.reduce((sum, item) => sum + Math.max(0, Number(item?.price || 0)) * Math.max(0, Number(item?.quantity || 0)), 0);
  const buyNowSubtotal = buyNowItems.reduce((sum, item) => sum + Math.max(0, Number(item?.price || 0)) * Math.max(0, Number(item?.quantity || 0)), 0);

  const value = useMemo(
    () => ({ items, savedForLater, count, subtotal, buyNowItems, buyNowSubtotal, drawerOpen, openCart, closeCart, addItem, addItems, startBuyNow, clearBuyNow, addDeal, updateQuantity, removeItem, saveForLaterItem, moveSavedToCart, removeSavedForLater, refreshCartFacts, applySafeCartQuantities, clearCart, replaceCart, crossDeviceEnabled: Boolean(user?.id), syncStatus, syncNotice, lastSyncedAt, savedBagConflict, retrySavedBagSync, useAccountSavedBag, keepBrowserSavedBag }),
    [items, savedForLater, count, subtotal, buyNowItems, buyNowSubtotal, drawerOpen, user?.id, syncStatus, syncNotice, lastSyncedAt, savedBagConflict],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
