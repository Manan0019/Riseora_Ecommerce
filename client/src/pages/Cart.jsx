import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, mediaUrl } from "../api/http";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { Icon } from "../components/Icons";
import OfferProgress from "../components/OfferProgress";
import ProductCard from "../components/ProductCard";
import { trackCommerce } from "../analytics";

export default function Cart() {
  const { items, subtotal, updateQuantity, removeItem } = useCart();
  const [suggestions, setSuggestions] = useState([]);
  const lastTrackedCart = useRef("");


  useEffect(() => {
    if (!items.length) return;
    const signature = items.map((item) => `${item.variantId}:${item.quantity}`).sort().join("|");
    if (lastTrackedCart.current === signature) return;
    lastTrackedCart.current = signature;
    trackCommerce("view_cart", { items, value: subtotal });
  }, [items, subtotal]);

  useEffect(() => {
    if (!items.length) { setSuggestions([]); return; }
    apiFetch("/products?sort=featured").then((response) => setSuggestions(Array.isArray(response.data) ? response.data : [])).catch(() => setSuggestions([]));
  }, [items.length]);

  const cartProductRefs = useMemo(() => ({
    ids: new Set(items.map((item) => item.productId).filter(Boolean)),
    slugs: new Set(items.map((item) => item.productSlug).filter(Boolean)),
  }), [items]);
  const crossSell = useMemo(() => suggestions.filter((product) => !cartProductRefs.ids.has(product.id) && !cartProductRefs.slugs.has(product.slug)).slice(0, 6), [suggestions, cartProductRefs]);

  if (items.length === 0) {
    return <div className="container page-space empty-state premium-empty cart-empty"><span className="empty-icon"><Icon name="cart" /></span><h1>Your cart is empty</h1><p>Discover Riseora products and add something to your routine.</p><Link className="button" to="/shop">Continue shopping</Link></div>;
  }

  return (
    <div className="container page-space cart-page phase15-cart-page">
      <div className="cart-heading"><div><p className="eyebrow">YOUR BAG</p><h1>Shopping cart</h1></div><span>{items.length} {items.length === 1 ? "item" : "items"}</span></div>
      <div className="cart-layout">
        <div className="cart-list">
          {items.map((item) => (
            <div className="cart-item" key={item.variantId}>
              {item.imageUrl ? <img src={mediaUrl(item.imageUrl)} alt={item.productName} /> : <div className="mini-placeholder">R</div>}
              <div className="cart-item-main">
                <Link to={`/product/${item.productSlug}`}><strong>{item.productName}</strong></Link>
                <p>{item.variantName}</p>
                <div className="cart-controls"><div className="quantity-stepper mini"><button onClick={() => updateQuantity(item.variantId, item.quantity - 1)} aria-label={`Decrease ${item.productName} quantity`}>−</button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.variantId, item.quantity + 1)} aria-label={`Increase ${item.productName} quantity`}>+</button></div><button className="link-button danger" onClick={() => removeItem(item.variantId)}>Remove</button></div>
              </div>
              <strong className="cart-line-price">₹{(item.price * item.quantity).toFixed(0)}</strong>
            </div>
          ))}
        </div>
        <aside className="summary-card"><h2>Order summary</h2><OfferProgress actionable /><div className="summary-row"><span>Subtotal</span><strong>₹{subtotal.toFixed(0)}</strong></div><div className="summary-row"><span>Shipping</span><span>Calculated at checkout</span></div><div className="summary-row total"><span>Estimated total</span><strong>₹{subtotal.toFixed(0)}</strong></div><Link className="button wide" to="/checkout">Proceed to checkout <Icon name="arrow" size={18} /></Link><Link className="continue-link" to="/shop">Continue shopping</Link><Link className="continue-link" to="/routine-builder">Build a routine</Link></aside>
      </div>

      {crossSell.length > 0 && <section className="phase15-cart-cross-sell"><div className="section-title-row"><div><p className="phase3-eyebrow">PAIR WITH YOUR BAG</p><h2>You may also like</h2></div><Link to="/shop">VIEW ALL</Link></div><div className="phase3-product-rail">{crossSell.map((product) => <ProductCard key={product.id} product={product} compact />)}</div></section>}

      <div className="phase15-cart-checkout-dock" aria-label="Cart checkout summary"><div><small>SUBTOTAL</small><strong>₹{subtotal.toFixed(0)}</strong></div><Link className="button" to="/checkout">CHECKOUT <Icon name="arrow" size={17} /></Link></div>
    </div>
  );
}
