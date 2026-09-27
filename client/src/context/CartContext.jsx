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
          productSlug: product.slug,
          productName: product.name,
          variantName: variant.name,
          sku: variant.sku,
          price: Number(variant.sellingPrice),
          mrp: Number(variant.mrp),
          stockQuantity: max,
          imageUrl: product.images?.[0]?.url || "",
          quantity: Math.min(max, quantity),
        },
      ];
    });
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

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const value = useMemo(
    () => ({ items, count, subtotal, addItem, updateQuantity, removeItem, clearCart }),
    [items, count, subtotal],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
