import { createContext, useContext, useEffect, useMemo, useState } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "riseora_cart";
const BUY_NOW_KEY = "riseora_buy_now";

function readJson(storage, key) {
  try {
    const value = storage?.getItem(key);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

function readInitialCart() {
  return typeof window === "undefined" ? [] : readJson(window.localStorage, STORAGE_KEY);
}

function readInitialBuyNow() {
  return typeof window === "undefined" ? [] : readJson(window.sessionStorage, BUY_NOW_KEY);
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

export function CartProvider({ children }) {
  const [items, setItems] = useState(readInitialCart);
  const [buyNowItems, setBuyNowItems] = useState(readInitialBuyNow);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* cart persistence is best effort */ }
  }, [items]);

  useEffect(() => {
    try {
      if (buyNowItems.length) sessionStorage.setItem(BUY_NOW_KEY, JSON.stringify(buyNowItems));
      else sessionStorage.removeItem(BUY_NOW_KEY);
    } catch { /* buy-now persistence is best effort */ }
  }, [buyNowItems]);

  function addItem(product, variant, quantity = 1) {
    setItems((current) => addLine(current, product, variant, quantity));
    setDrawerOpen(true);
  }

  function addItems(entries = []) {
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
    setDrawerOpen(true);
    return true;
  }

  function startBuyNow(product, variant, quantity = 1) {
    const line = toCartLine(product, variant, quantity);
    if (!line) return false;
    setBuyNowItems([line]);
    setDrawerOpen(false);
    return true;
  }

  function clearBuyNow() {
    setBuyNowItems([]);
  }

  function openCart() { setDrawerOpen(true); }
  function closeCart() { setDrawerOpen(false); }

  function addDeal(deal) {
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
    setDrawerOpen(true);
    return true;
  }

  function updateQuantity(variantId, quantity) {
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
    setItems((current) => current.filter((item) => item.variantId !== variantId));
  }

  function clearCart() {
    setItems([]);
  }

  function replaceCart(nextItems) {
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

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const buyNowSubtotal = buyNowItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const value = useMemo(
    () => ({ items, count, subtotal, buyNowItems, buyNowSubtotal, drawerOpen, openCart, closeCart, addItem, addItems, startBuyNow, clearBuyNow, addDeal, updateQuantity, removeItem, clearCart, replaceCart }),
    [items, count, subtotal, buyNowItems, buyNowSubtotal, drawerOpen],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
