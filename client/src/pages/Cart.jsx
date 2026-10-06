import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, mediaUrl } from "../api/http";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { Icon } from "../components/Icons";
import OfferProgress from "../components/OfferProgress";
import ProductCard from "../components/ProductCard";
import { trackCommerce, trackEvent } from "../analytics";

const CART_RECOMMENDATION_SHELF = "cart-routine";

export default function Cart() {
  const { items, subtotal, updateQuantity, removeItem, crossDeviceEnabled, syncStatus, syncNotice, lastSyncedAt, savedBagConflict, retrySavedBagSync, useAccountSavedBag, keepBrowserSavedBag } = useCart();
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionMeta, setSuggestionMeta] = useState({ strategy: "", explanation: "" });
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const lastTrackedCart = useRef("");
  const lastRecommendationImpression = useRef("");

  const cartProductIds = useMemo(() => [...new Set(items.map((item) => item.productId).filter(Boolean))], [items]);
  const cartSignature = useMemo(() => cartProductIds.slice().sort().join("|"), [cartProductIds]);
  const recommendationSourceId = cartProductIds[0] || "";

  useEffect(() => {
    if (!items.length) return;
    const signature = items.map((item) => `${item.variantId}:${item.quantity}`).sort().join("|");
    if (lastTrackedCart.current === signature) return;
    lastTrackedCart.current = signature;
    trackCommerce("view_cart", { items, value: subtotal });
  }, [items, subtotal]);

  useEffect(() => {
    if (!cartProductIds.length) {
      setSuggestions([]);
      setSuggestionMeta({ strategy: "", explanation: "" });
      setSuggestionsLoading(false);
      return undefined;
    }
    let active = true;
    setSuggestionsLoading(true);
    apiFetch("/products/recommendations/cart", {
      method: "POST",
      body: JSON.stringify({ productIds: cartProductIds, limit: 6 }),
    }).then((response) => {
      if (!active) return;
      const data = response?.data || {};
      setSuggestions(Array.isArray(data.products) ? data.products : []);
      setSuggestionMeta({ strategy: String(data.strategy || ""), explanation: String(data.explanation || "") });
    }).catch(() => {
      if (!active) return;
      setSuggestions([]);
      setSuggestionMeta({ strategy: "", explanation: "" });
    }).finally(() => active && setSuggestionsLoading(false));
    return () => { active = false; };
  }, [cartSignature]);

  useEffect(() => {
    if (!recommendationSourceId || !suggestions.length || !cartSignature) return;
    const impressionKey = `${cartSignature}:${suggestions.map((product) => product.id).join(",")}`;
    if (lastRecommendationImpression.current === impressionKey) return;
    lastRecommendationImpression.current = impressionKey;
    apiFetch("/products/recommendations/event", {
      method: "POST",
      body: JSON.stringify({ type: "impression", shelf: CART_RECOMMENDATION_SHELF, sourceProductId: recommendationSourceId }),
    }).catch(() => {});
    trackEvent("recommendation_impression", { shelf: CART_RECOMMENDATION_SHELF, item_count: suggestions.length, strategy: suggestionMeta.strategy || "relevance" });
  }, [cartSignature, recommendationSourceId, suggestionMeta.strategy, suggestions]);

  function reportRecommendation(type, product) {
    if (!recommendationSourceId || !product?.id) return;
    apiFetch("/products/recommendations/event", {
      method: "POST",
      body: JSON.stringify({ type, shelf: CART_RECOMMENDATION_SHELF, sourceProductId: recommendationSourceId, targetProductId: product.id }),
    }).catch(() => {});
    trackEvent(type === "add" ? "recommendation_add_to_cart" : "recommendation_click", {
      shelf: CART_RECOMMENDATION_SHELF,
      item_id: product.id,
      item_name: product.name,
      reason: product.recommendationReason || undefined,
    });
  }

  if (items.length === 0 && syncStatus === "syncing") {
    return <div className="container page-space empty-state premium-empty cart-empty"><span className="empty-icon"><Icon name="refresh" /></span><h1>Restoring your saved bag…</h1><p>Riseora is checking your account bag against current price, stock and purchase limits.</p></div>;
  }

  if (items.length === 0) {
    return <div className="container page-space empty-state premium-empty cart-empty"><span className="empty-icon"><Icon name="cart" /></span><h1>Your cart is empty</h1><p>Discover Riseora products and add something to your routine.</p>{crossDeviceEnabled && <p className="phase69-empty-sync">Your signed-in Saved Bag is up to date on this account.</p>}<Link className="button" to="/shop">Continue shopping</Link></div>;
  }

  return (
    <div className="container page-space cart-page phase15-cart-page phase56-cart-page">
      <div className="cart-heading"><div><p className="eyebrow">YOUR BAG</p><h1>Shopping cart</h1></div><span>{items.length} {items.length === 1 ? "item" : "items"}</span></div>
      <section className={`phase69-saved-bag ${crossDeviceEnabled ? `is-${syncStatus}` : "is-local"}`} aria-live="polite">
        <div className="phase69-saved-bag-icon"><Icon name={crossDeviceEnabled ? "refresh" : "shield"} /></div>
        <div className="phase69-saved-bag-copy">
          <p className="phase3-eyebrow">PHASE 69 · SAVED BAG</p>
          <h2>{!crossDeviceEnabled ? "Saved on this browser" : syncStatus === "conflict" ? "Bag changed on another device" : syncStatus === "syncing" ? "Saving your bag…" : syncStatus === "error" ? "Account sync needs a retry" : "Saved to your Riseora account"}</h2>
          <p>{!crossDeviceEnabled ? "Sign in to carry this bag across your devices. Nothing is emailed and this is separate from abandoned-cart recovery consent." : syncStatus === "conflict" ? (syncNotice || "Choose which bag should continue before checkout.") : syncStatus === "error" ? (syncNotice || "Your browser copy is safe while account sync is unavailable.") : (syncNotice || "Your bag is revalidated against current price, public stock and purchase limits whenever it is restored.")}</p>
          {crossDeviceEnabled && lastSyncedAt && syncStatus === "synced" && <small>Last account sync {new Date(lastSyncedAt).toLocaleString("en-IN")}</small>}
          {syncStatus === "conflict" && savedBagConflict?.savedAt && <small>Account version saved {new Date(savedBagConflict.savedAt).toLocaleString("en-IN")}</small>}
        </div>
        <div className="phase69-saved-bag-actions">
          {!crossDeviceEnabled && <Link className="button button-secondary" to="/login">SIGN IN</Link>}
          {crossDeviceEnabled && syncStatus === "conflict" && <><button className="button button-secondary" type="button" onClick={useAccountSavedBag}>USE ACCOUNT BAG</button><button className="button" type="button" onClick={keepBrowserSavedBag}>KEEP THIS BAG</button></>}
          {crossDeviceEnabled && syncStatus === "error" && <button className="button button-secondary" type="button" onClick={retrySavedBagSync}>RETRY ACCOUNT SYNC</button>}
        </div>
      </section>
      {syncStatus === "conflict" && <section className="phase70-conflict-explainer" aria-label="Saved Bag conflict resolution"><span><Icon name="alert" /></span><div><p className="phase3-eyebrow">PHASE 70 · MULTI-DEVICE SAFETY</p><strong>Nothing has been overwritten.</strong><p><b>Use account bag</b> loads the newest version saved by another device. <b>Keep this bag</b> revalidates this browser's quantities against live stock and makes it the account version.</p></div></section>}
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

      <section className="phase56-cart-intelligence" aria-labelledby="phase56-cart-title">
        <div className="section-title-row phase56-cart-intelligence-head">
          <div><p className="phase3-eyebrow">COMPLETE YOUR ROUTINE</p><h2 id="phase56-cart-title">Smart picks for your bag</h2><p>{suggestionMeta.explanation || "Riseora matches products to what is already in your bag."}</p></div>
          <Link to="/shop">VIEW ALL</Link>
        </div>
        {suggestionsLoading && <div className="phase56-cart-loading" role="status">Finding products that fit your routine…</div>}
        {!suggestionsLoading && suggestions.length > 0 && <div className="phase56-cart-recommendation-grid">{suggestions.map((product) => <div className="phase56-cart-recommendation" key={product.id}><ProductCard product={product} compact onProductOpen={(item) => reportRecommendation("click", item)} onAddToCart={(item) => reportRecommendation("add", item)} /><div className="phase56-cart-reason"><span>WHY THIS FITS</span><strong>{product.recommendationReason || "Complete your routine"}</strong></div></div>)}</div>}
        {!suggestionsLoading && !suggestions.length && <div className="phase56-cart-empty"><strong>Your bag already looks focused.</strong><span>Explore the full shop if you want to add another step to your routine.</span></div>}
      </section>

      <div className="phase15-cart-checkout-dock" aria-label="Cart checkout summary"><div><small>SUBTOTAL</small><strong>₹{subtotal.toFixed(0)}</strong></div><Link className="button" to="/checkout">CHECKOUT <Icon name="arrow" size={17} /></Link></div>
    </div>
  );
}
