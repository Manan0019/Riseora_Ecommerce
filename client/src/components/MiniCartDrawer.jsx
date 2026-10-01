import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";
import { Icon } from "./Icons";
import OfferProgress from "./OfferProgress";
import OptimizedImage from "./OptimizedImage";

export default function MiniCartDrawer() {
  const { drawerOpen, closeCart, items, subtotal, updateQuantity, removeItem } = useCart();
  const location = useLocation();

  useEffect(() => { closeCart(); }, [location.pathname]);
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => { if (event.key === "Escape") closeCart(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [drawerOpen]);

  return (
    <div className={drawerOpen ? "phase14-cart-layer open" : "phase14-cart-layer"} aria-hidden={!drawerOpen}>
      <button className="phase14-cart-backdrop" onClick={closeCart} aria-label="Close cart" />
      <aside className="phase14-cart-drawer" role="dialog" aria-modal="true" aria-label="Shopping cart">
        <div className="phase14-cart-head">
          <div><small>YOUR BAG</small><strong>{items.length ? `${items.length} ${items.length === 1 ? "item" : "items"}` : "Cart"}</strong></div>
          <button onClick={closeCart} aria-label="Close cart"><Icon name="close" size={20} /></button>
        </div>

        {items.length === 0 ? (
          <div className="phase14-cart-empty"><span><Icon name="cart" size={28} /></span><h3>Your bag is waiting</h3><p>Add your Riseora favourites and they will appear here.</p><Link className="button" to="/shop" onClick={closeCart}>SHOP PRODUCTS</Link></div>
        ) : (
          <>
            <div className="phase14-cart-items">
              {items.map((item) => (
                <article key={item.variantId}>
                  <Link to={`/product/${item.productSlug}`} onClick={closeCart} className="phase14-cart-thumb">
                    {item.imageUrl ? <OptimizedImage src={mediaUrl(item.imageUrl)} alt={item.productName} /> : <span>R</span>}
                  </Link>
                  <div className="phase14-cart-item-copy">
                    <Link to={`/product/${item.productSlug}`} onClick={closeCart}><strong>{item.productName}</strong></Link>
                    <small>{item.variantName}</small>
                    <div className="phase14-cart-item-actions">
                      <div className="quantity-stepper mini"><button onClick={() => updateQuantity(item.variantId, item.quantity - 1)}>−</button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.variantId, item.quantity + 1)}>+</button></div>
                      <button className="link-button danger" onClick={() => removeItem(item.variantId)}>Remove</button>
                    </div>
                  </div>
                  <strong>₹{(item.price * item.quantity).toFixed(0)}</strong>
                </article>
              ))}
            </div>
            <div className="phase14-cart-footer">
              <OfferProgress compact />
              <div className="phase14-cart-subtotal"><span>Subtotal</span><strong>₹{subtotal.toFixed(0)}</strong></div>
              <small>Shipping and final automatic offers are calculated securely at checkout.</small>
              <Link className="button wide" to="/checkout" onClick={closeCart}>CHECKOUT <Icon name="arrow" size={17} /></Link>
              <Link className="phase14-view-bag" to="/cart" onClick={closeCart}>View full bag</Link>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}