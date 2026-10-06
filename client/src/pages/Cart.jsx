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
  const {
    items,
    savedForLater,
    subtotal,
    updateQuantity,
    removeItem,
    saveForLaterItem,
    moveSavedToCart,
    removeSavedForLater,
    refreshCartFacts,
    applySafeCartQuantities,
    crossDeviceEnabled,
    syncStatus,
    syncNotice,
    lastSyncedAt,
    savedBagConflict,
    retrySavedBagSync,
    useAccountSavedBag,
    keepBrowserSavedBag,
  } = useCart();
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionMeta, setSuggestionMeta] = useState({ strategy: "", explanation: "" });
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [quantityReadiness, setQuantityReadiness] = useState(null);
  const [quantityReadinessLoading, setQuantityReadinessLoading] = useState(false);
  const [quantityReadinessError, setQuantityReadinessError] = useState("");
  const [quantityRefreshTick, setQuantityRefreshTick] = useState(0);
  const lastTrackedCart = useRef("");
  const lastRecommendationImpression = useRef("");

  const cartProductIds = useMemo(() => [...new Set(items.map((item) => item.productId).filter(Boolean))], [items]);
  const cartSignature = useMemo(() => cartProductIds.slice().sort().join("|"), [cartProductIds]);
  const recommendationSourceId = cartProductIds[0] || "";
  const quantitySignature = useMemo(() => items.map((item) => `${item.variantId}:${item.quantity}`).sort().join("|"), [items]);
  const quantityByVariant = useMemo(() => new Map((quantityReadiness?.lines || []).map((line) => [line.variantId, line])), [quantityReadiness]);
  const quantityAdjustmentRequired = Number(quantityReadiness?.summary?.adjustmentLines || 0) > 0;

  useEffect(() => {
    if (!items.length) return;
    const signature = items.map((item) => `${item.variantId}:${item.quantity}`).sort().join("|");
    if (lastTrackedCart.current === signature) return;
    lastTrackedCart.current = signature;
    trackCommerce("view_cart", { items, value: subtotal });
  }, [items, subtotal]);

  useEffect(() => {
    if (!items.length) {
      setQuantityReadiness(null);
      setQuantityReadinessError("");
      setQuantityReadinessLoading(false);
      return undefined;
    }
    let active = true;
    setQuantityReadinessLoading(true);
    setQuantityReadinessError("");
    const timer = window.setTimeout(() => {
      apiFetch("/products/cart/quantity-readiness", {
        method: "POST",
        body: JSON.stringify({ items: items.map((item) => ({ variantId: item.variantId, quantity: Number(item.quantity || 1) })) }),
      }).then((response) => {
        if (!active) return;
        const data = response?.data || null;
        setQuantityReadiness(data);
        if (Array.isArray(data?.lines)) refreshCartFacts(data.lines);
      }).catch((error) => {
        if (!active) return;
        setQuantityReadinessError(error.message || "Could not refresh live quantity guidance.");
      }).finally(() => active && setQuantityReadinessLoading(false));
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [quantitySignature, quantityRefreshTick]);

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

  if (!items.length && !savedForLater.length && syncStatus === "syncing") {
    return <div className="container page-space empty-state premium-empty cart-empty"><span className="empty-icon"><Icon name="refresh" /></span><h1>Restoring your saved bag…</h1><p>Riseora is checking your account bag against current price, stock and purchase limits.</p></div>;
  }

  if (!items.length && !savedForLater.length) {
    return <div className="container page-space empty-state premium-empty cart-empty"><span className="empty-icon"><Icon name="cart" /></span><h1>Your cart is empty</h1><p>Discover Riseora products and add something to your routine.</p>{crossDeviceEnabled && <p className="phase69-empty-sync">Your signed-in Saved Bag is up to date on this account.</p>}<Link className="button" to="/shop">Continue shopping</Link></div>;
  }

  return (
    <div className="container page-space cart-page phase15-cart-page phase56-cart-page phase71-cart-page">
      <div className="cart-heading"><div><p className="eyebrow">YOUR BAG</p><h1>Shopping cart</h1></div><span>{items.length} buying now · {savedForLater.length} later</span></div>
      <section className={`phase69-saved-bag ${crossDeviceEnabled ? `is-${syncStatus}` : "is-local"}`} aria-live="polite">
        <div className="phase69-saved-bag-icon"><Icon name={crossDeviceEnabled ? "refresh" : "shield"} /></div>
        <div className="phase69-saved-bag-copy">
          <p className="phase3-eyebrow">PHASE 71 · BAG INTENT</p>
          <h2>{!crossDeviceEnabled ? "Bag choices saved on this browser" : syncStatus === "conflict" ? "Bag changed on another device" : syncStatus === "syncing" ? "Saving your bag choices…" : syncStatus === "error" ? "Account sync needs a retry" : "Buy-now and later choices saved to your account"}</h2>
          <p>{!crossDeviceEnabled ? "Save for later stays on this browser. Sign in to carry both your active bag and later list across devices." : syncStatus === "conflict" ? (syncNotice || "Choose which bag should continue before checkout.") : syncStatus === "error" ? (syncNotice || "Your browser copy is safe while account sync is unavailable.") : (syncNotice || "Active and saved-for-later items share the same revision-safe account bag and are revalidated against the live catalogue.")}</p>
          {crossDeviceEnabled && lastSyncedAt && syncStatus === "synced" && <small>Last account sync {new Date(lastSyncedAt).toLocaleString("en-IN")}</small>}
          {syncStatus === "conflict" && savedBagConflict?.savedAt && <small>Account version saved {new Date(savedBagConflict.savedAt).toLocaleString("en-IN")}</small>}
        </div>
        <div className="phase69-saved-bag-actions">
          {!crossDeviceEnabled && <Link className="button button-secondary" to="/login">SIGN IN</Link>}
          {crossDeviceEnabled && syncStatus === "conflict" && <><button className="button button-secondary" type="button" onClick={useAccountSavedBag}>USE ACCOUNT BAG</button><button className="button" type="button" onClick={keepBrowserSavedBag}>KEEP THIS BAG</button></>}
          {crossDeviceEnabled && syncStatus === "error" && <button className="button button-secondary" type="button" onClick={retrySavedBagSync}>RETRY ACCOUNT SYNC</button>}
        </div>
      </section>
      {syncStatus === "conflict" && <section className="phase70-conflict-explainer" aria-label="Saved Bag conflict resolution"><span><Icon name="alert" /></span><div><p className="phase3-eyebrow">PHASE 70 · MULTI-DEVICE SAFETY</p><strong>Nothing has been overwritten.</strong><p><b>Use account bag</b> loads the newest active + later choices saved by another device. <b>Keep this bag</b> revalidates this browser's choices and makes them the account version.</p></div></section>}

      {items.length > 0 && <section className={`phase72-cart-readiness ${quantityAdjustmentRequired ? "needs-adjustment" : "is-ready"}`} aria-live="polite" aria-labelledby="phase72-readiness-title">
        <div className="phase72-readiness-head"><div><p className="phase3-eyebrow">PHASE 72 · CART READINESS</p><h2 id="phase72-readiness-title">Quantity check before checkout</h2><p>{quantityReadiness?.policy || "Riseora checks current public stock and product purchase limits before you continue."}</p></div><button className="button button-secondary" type="button" disabled={quantityReadinessLoading} onClick={() => setQuantityRefreshTick((value) => value + 1)}>{quantityReadinessLoading ? "CHECKING…" : "REFRESH AVAILABILITY"}</button></div>
        {quantityReadinessError && <p className="phase72-readiness-error">{quantityReadinessError} Checkout will still perform its independent server preflight.</p>}
        {quantityReadiness && <div className="phase72-readiness-metrics">
          <article><small>ACTIVE LINES</small><strong>{quantityReadiness.summary?.lineCount ?? items.length}</strong><span>checked live</span></article>
          <article><small>LOW STOCK</small><strong>{quantityReadiness.summary?.lowStockLines ?? 0}</strong><span>after safety stock</span></article>
          <article><small>AT LIMIT</small><strong>{quantityReadiness.summary?.atLimitLines ?? 0}</strong><span>stock or purchase cap</span></article>
          <article className={quantityAdjustmentRequired ? "attention" : ""}><small>NEEDS ADJUSTMENT</small><strong>{quantityReadiness.summary?.adjustmentLines ?? 0}</strong><span>{quantityAdjustmentRequired ? "resolve before checkout" : "ready"}</span></article>
        </div>}
        {quantityAdjustmentRequired && <div className="phase72-adjust-action"><div><strong>Some quantities exceed today's safe ceiling.</strong><span>Apply the server-checked quantities before checkout. Items that are no longer sellable will leave the active bag.</span></div><button className="button" type="button" onClick={() => applySafeCartQuantities(quantityReadiness?.lines || [])}>APPLY SAFE QUANTITIES</button></div>}
      </section>}

      {items.length > 0 ? <div className="cart-layout">
        <div className="cart-list">
          {items.map((item) => {
            const readiness = quantityByVariant.get(item.variantId);
            const quantityCeiling = Number(readiness?.quantityCeiling ?? item.stockQuantity ?? 0);
            const canIncrease = !readiness || (!readiness.adjustmentRequired && !readiness.atLimit && item.quantity < quantityCeiling);
            return <div className={`cart-item ${readiness?.adjustmentRequired ? "phase72-line-adjust" : ""}`} key={item.variantId}>
              {item.imageUrl ? <img src={mediaUrl(item.imageUrl)} alt={item.productName} /> : <div className="mini-placeholder">R</div>}
              <div className="cart-item-main">
                <Link to={`/product/${item.productSlug}`}><strong>{item.productName}</strong></Link>
                <p>{item.variantName}</p>
                {readiness && <div className={`phase72-line-guidance is-${String(readiness.status || "ready").toLowerCase()}`}><strong>{readiness.adjustmentRequired ? `Safe quantity today: ${readiness.safeQuantity}` : readiness.lowStock ? `Low stock · ${readiness.stockQuantity} available` : readiness.atLimit ? "Current quantity is at a limit" : "Quantity ready"}</strong><span>{readiness.messages?.[0]}</span></div>}
                <div className="cart-controls"><div className="quantity-stepper mini"><button onClick={() => updateQuantity(item.variantId, item.quantity - 1)} aria-label={`Decrease ${item.productName} quantity`}>−</button><span>{item.quantity}</span><button disabled={!canIncrease} onClick={() => updateQuantity(item.variantId, item.quantity + 1)} aria-label={`Increase ${item.productName} quantity`}>+</button></div><button className="link-button" onClick={() => saveForLaterItem(item.variantId)}>Save for later</button><button className="link-button danger" onClick={() => removeItem(item.variantId)}>Remove</button></div>
              </div>
              <strong className="cart-line-price">₹{(item.price * item.quantity).toFixed(0)}</strong>
            </div>;
          })}
        </div>
        <aside className="summary-card"><h2>Order summary</h2><OfferProgress actionable /><div className="summary-row"><span>Subtotal</span><strong>₹{subtotal.toFixed(0)}</strong></div><div className="summary-row"><span>Shipping</span><span>Calculated at checkout</span></div><div className="summary-row total"><span>Estimated total</span><strong>₹{subtotal.toFixed(0)}</strong></div>{quantityAdjustmentRequired ? <button className="button wide" type="button" disabled>Resolve quantities first</button> : <Link className="button wide" to="/checkout">Proceed to checkout <Icon name="arrow" size={18} /></Link>}<Link className="continue-link" to="/shop">Continue shopping</Link><Link className="continue-link" to="/routine-builder">Build a routine</Link></aside>
      </div> : <section className="phase71-active-empty"><span><Icon name="cart" /></span><div><p className="phase3-eyebrow">BUYING NOW</p><h2>Your active bag is empty</h2><p>Everything is safely saved for later. Move an item back whenever you are ready to purchase it.</p></div><Link className="button button-secondary" to="/shop">CONTINUE SHOPPING</Link></section>}

      {savedForLater.length > 0 && <section className="phase71-saved-later" aria-labelledby="phase71-later-title">
        <div className="section-title-row phase71-saved-later-head"><div><p className="phase3-eyebrow">PHASE 71 · SAVE FOR LATER</p><h2 id="phase71-later-title">Keep the decision, not the checkout pressure</h2><p>{crossDeviceEnabled ? "These items travel with your account and are rechecked against current catalogue data on restore." : "These items are saved on this browser. Sign in if you want them on your other devices too."}</p></div><strong>{savedForLater.length} saved</strong></div>
        <div className="phase71-saved-later-list">
          {savedForLater.map((item) => {
            const inStock = Number(item.stockQuantity || 0) > 0;
            return <article className={`phase71-later-item ${inStock ? "is-ready" : "is-waiting"}`} key={item.variantId}>
              {item.imageUrl ? <img src={mediaUrl(item.imageUrl)} alt={item.productName} /> : <div className="mini-placeholder">R</div>}
              <div className="phase71-later-copy"><Link to={`/product/${item.productSlug}`}><strong>{item.productName}</strong></Link><span>{item.variantName} · saved qty {item.quantity}</span><b>₹{Number(item.price || 0).toFixed(0)}</b><small>{inStock ? `${item.stockQuantity} currently available` : "Currently unavailable · keep it here and check again later"}</small></div>
              <div className="phase71-later-actions"><button className="button button-secondary" type="button" disabled={!inStock} onClick={() => moveSavedToCart(item.variantId)}>{inStock ? "MOVE TO BAG" : "WAITING FOR STOCK"}</button><button className="link-button danger" type="button" onClick={() => removeSavedForLater(item.variantId)}>Remove</button></div>
            </article>;
          })}
        </div>
      </section>}

      {items.length > 0 && <section className="phase56-cart-intelligence" aria-labelledby="phase56-cart-title">
        <div className="section-title-row phase56-cart-intelligence-head">
          <div><p className="phase3-eyebrow">COMPLETE YOUR ROUTINE</p><h2 id="phase56-cart-title">Smart picks for your bag</h2><p>{suggestionMeta.explanation || "Riseora matches products to what is already in your bag."}</p></div>
          <Link to="/shop">VIEW ALL</Link>
        </div>
        {suggestionsLoading && <div className="phase56-cart-loading" role="status">Finding products that fit your routine…</div>}
        {!suggestionsLoading && suggestions.length > 0 && <div className="phase56-cart-recommendation-grid">{suggestions.map((product) => <div className="phase56-cart-recommendation" key={product.id}><ProductCard product={product} compact onProductOpen={(item) => reportRecommendation("click", item)} onAddToCart={(item) => reportRecommendation("add", item)} /><div className="phase56-cart-reason"><span>WHY THIS FITS</span><strong>{product.recommendationReason || "Complete your routine"}</strong></div></div>)}</div>}
        {!suggestionsLoading && !suggestions.length && <div className="phase56-cart-empty"><strong>Your bag already looks focused.</strong><span>Explore the full shop if you want to add another step to your routine.</span></div>}
      </section>}

      {items.length > 0 && <div className="phase15-cart-checkout-dock" aria-label="Cart checkout summary"><div><small>SUBTOTAL</small><strong>₹{subtotal.toFixed(0)}</strong></div>{quantityAdjustmentRequired ? <button className="button" type="button" disabled>ADJUST QTY</button> : <Link className="button" to="/checkout">CHECKOUT <Icon name="arrow" size={17} /></Link>}</div>}
    </div>
  );
}
