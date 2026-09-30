import { createContext, useContext, useEffect, useMemo, useState } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "riseora_cart";

function readInitialCart() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(readInitialCart);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  function addItem(product, variant, quantity = 1) {
    setItems((current) => {
      const existing = current.find((item) => item.variantId === variant.id);
      const max = Math.max(0, Number(variant.stockQuantity || 0));
      if (existing) {
        return current.map((item) =>
          item.variantId === variant.id
            ? { ...item, quantity: Math.min(max, item.quantity + quantity) }
            : item,
        );
      }

      return [
        ...current,
        {
          variantId: variant.id,
          productId: product.id,
          productSlug: product.slug,
          productName: product.name,
          variantName: variant.name,
          sku: variant.sku,
          price: Number(variant.sellingPrice),
          mrp: Number(variant.mrp),
          stockQuantity: max,
          imageUrl: (product.images?.find((item) => item.isPrimary) || product.images?.[0])?.url || "",
          quantity: Math.min(max, quantity),
        },
      ];
    });
    setDrawerOpen(true);
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
      for (const addition of additions) {
        const { product, variant } = addition;
        const max = Math.max(0, Number(variant.stockQuantity || 0));
        if (!max) continue;
        const existing = next.find((item) => item.variantId === variant.id);
        if (existing) {
          next = next.map((item) => item.variantId === variant.id ? { ...item, quantity: Math.min(max, item.quantity + addition.quantity) } : item);
        } else {
          const primary = product.images?.find((item) => item.isPrimary) || product.images?.[0];
          next.push({
            variantId: variant.id, productId: product.id, productSlug: product.slug, productName: product.name, variantName: variant.name, sku: variant.sku,
            price: Number(variant.sellingPrice), mrp: Number(variant.mrp), stockQuantity: max, imageUrl: primary?.url || "",
            quantity: Math.min(max, addition.quantity),
          });
        }
      }
      return next;
    });
    setDrawerOpen(true);
    return true;
  }

  function updateQuantity(variantId, quantity) {
    setItems((current) =>
      current
        .map((item) =>
          item.variantId === variantId
            ? { ...item, quantity: Math.max(0, Math.min(item.stockQuantity, quantity)) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function removeItem(variantId) {
    setItems((current) => current.filter((item) => item.variantId !== variantId));
  }

  function clearCart() {
    setItems([]);
  }

  function replaceCart(nextItems) {
    const safe = Array.isArray(nextItems) ? nextItems
      .filter((item) => item?.variantId && Number(item?.stockQuantity || 0) > 0)
      .map((item) => ({
        ...item,
        quantity: Math.max(1, Math.min(Number(item.stockQuantity || 0), Number(item.quantity || 1))),
      })) : [];
    setItems(safe);
  }

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const value = useMemo(
    () => ({ items, count, subtotal, drawerOpen, openCart, closeCart, addItem, addDeal, updateQuantity, removeItem, clearCart, replaceCart }),
    [items, count, subtotal, drawerOpen],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
