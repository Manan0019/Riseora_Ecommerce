import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { useWishlist } from "../context/WishlistContext";
import { useAuth } from "../context/AuthContext";
import { Icon } from "../components/Icons";
import { apiFetch } from "../api/http";

const filters = [
  { key: "ALL", label: "All saved" },
  { key: "GOOD_NEWS", label: "Good news" },
  { key: "READY", label: "Ready now" },
  { key: "WATCHING", label: "Watching" },
  { key: "WAITING", label: "Waiting stock" },
];

function matchesFilter(info, filter) {
  if (filter === "ALL") return true;
  if (!info) return filter === "READY";
  if (filter === "GOOD_NEWS") return info.state === "PRICE_DROP" || info.state === "BACK_IN_STOCK";
  if (filter === "READY") return info.availableQuantity > 0 && info.state !== "PRICE_DROP" && info.state !== "BACK_IN_STOCK";
  if (filter === "WATCHING") return info.state === "PRICE_WATCH" || info.state === "STOCK_WATCH";
  if (filter === "WAITING") return info.availableQuantity <= 0;
  return true;
}

export default function Wishlist() {
  const { user } = useAuth();
  const { items, syncing, accountSynced } = useWishlist();
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [intelligence, setIntelligence] = useState(null);
  const [watchBusy, setWatchBusy] = useState("");
  const [filter, setFilter] = useState("ALL");
  const viewReported = useRef(false);

  async function refreshIntelligence() {
    if (!accountSynced) { setIntelligence(null); return; }
    try {
      const response = await apiFetch("/wishlist/intelligence");
      setIntelligence(response.data || null);
    } catch (e) {
      setIntelligence(null);
      setError((current) => current || e.message || "Saved-shopping intelligence is temporarily unavailable.");
    }
  }

  useEffect(() => {
    if (!accountSynced) { setIntelligence(null); viewReported.current = false; return; }
    refreshIntelligence();
  }, [accountSynced, items.length]);

  useEffect(() => {
    if (!accountSynced || !intelligence || viewReported.current) return;
    viewReported.current = true;
    apiFetch("/wishlist/event", { method: "POST", body: JSON.stringify({ type: "view" }) }).catch(() => {});
  }, [accountSynced, intelligence]);

  const intelligenceByProduct = useMemo(() => new Map((intelligence?.items || []).map((item) => [item.productId, item])), [intelligence]);
  const visibleItems = useMemo(() => items.filter((product) => matchesFilter(intelligenceByProduct.get(product.id), filter)), [items, intelligenceByProduct, filter]);

  function reportSavedEvent(type, alertType) {
    if (!accountSynced) return;
    apiFetch("/wishlist/event", { method: "POST", body: JSON.stringify({ type, ...(alertType ? { alertType } : {}) }) }).catch(() => {});
  }

  async function startWatch(info) {
    if (!info?.watch || !user?.email || watchBusy) return;
    setWatchBusy(info.productId); setMessage(""); setError("");
    try {
      const isPrice = info.watch.type === "PRICE";
      const response = await apiFetch(isPrice ? "/price-alerts" : "/stock-alerts", {
        method: "POST",
        body: JSON.stringify({
          variantId: info.watch.variantId,
          email: user.email,
          name: user.firstName || "",
          ...(isPrice ? { targetPrice: null } : {}),
        }),
      });
      setMessage(response.message || (isPrice ? "Price watch started." : "Back-in-stock watch started."));
      reportSavedEvent("alert_create", info.watch.type);
      await refreshIntelligence();
    } catch (e) { setError(e.message || "Could not start this watch."); }
    finally { setWatchBusy(""); }
  }

  async function shareWishlist() {
    if (!items.length || sharing) return;
    setSharing(true); setMessage(""); setError("");
    try {
      const response = await apiFetch("/wishlist/share", {
        method: "POST",
        body: JSON.stringify({ title: "My Riseora wishlist", productIds: items.map((item) => item.id) }),
      });
      const url = `${window.location.origin}/wishlist/shared/${response.data.token}`;
      if (navigator.share) {
        await navigator.share({ title: "My Riseora wishlist", text: "Products I saved from Riseora Herbals", url });
        setMessage("Wishlist shared. The private link expires in 30 days.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setMessage("Private wishlist link copied. It expires in 30 days.");
      } else {
        window.prompt("Copy this wishlist link", url);
        setMessage("Wishlist link created. It expires in 30 days.");
      }
    } catch (e) {
      if (e?.name !== "AbortError") setError(e.message || "Could not share wishlist");
    } finally { setSharing(false); }
  }

  const summary = intelligence?.summary || null;

  return (
    <div className="container page-space wishlist-page phase68-wishlist-page">
      {accountSynced && <div className="phase35-wishlist-sync"><Icon name="refresh" size={16}/><span><strong>Synced to your Riseora account</strong><small>Your saved products follow you across signed-in devices.</small></span></div>}
      <div className="shop-title-row phase23-wishlist-head"><div><p className="eyebrow">SAVED FOR LATER · PHASE 68</p><h1>Your wishlist</h1><p className="muted">Save products, compare today’s availability, and explicitly choose which price or stock changes Riseora should watch for you.</p></div>{items.length > 0 && <button className="button button-secondary phase23-share-wishlist" type="button" onClick={shareWishlist} disabled={sharing}><Icon name="share" size={17} /> {sharing ? "Creating link…" : "Share wishlist"}</button>}</div>
      {message && <p className="alert success">{message}</p>}
      {error && <p className="alert error">{error}</p>}

      {accountSynced && summary && items.length > 0 && <section className="phase68-saved-intelligence">
        <div className="phase68-saved-intelligence-head"><div><p className="phase3-eyebrow">PHASE 68 · SAVED SHOPPING INTELLIGENCE</p><h2>Your saved-shopping watchlist</h2><p>Live prices, sellable stock after safety stock, and the alerts you explicitly asked Riseora to watch.</p></div><Link to="/account#shopping-alerts">MANAGE ALERTS →</Link></div>
        <div className="phase68-saved-metrics">
          <article><small>SAVED</small><strong>{summary.savedProducts}</strong><span>products</span></article>
          <article><small>READY NOW</small><strong>{summary.readyNow}</strong><span>currently sellable</span></article>
          <article><small>GOOD NEWS</small><strong>{summary.goodNews}</strong><span>price/stock updates</span></article>
          <article><small>PRICE WATCHES</small><strong>{summary.priceWatches}</strong><span>explicitly active</span></article>
          <article><small>STOCK WATCHES</small><strong>{summary.stockWatches}</strong><span>waiting availability</span></article>
        </div>
        <p className="phase68-consent-note"><strong>Your choice stays explicit.</strong> Saving a product never starts a price or stock alert automatically. Watches begin only when you press a watch button, and they can be cancelled from My Riseora.</p>
        <div className="phase68-filter-row" role="group" aria-label="Wishlist filters">{filters.map((item) => <button type="button" key={item.key} className={filter === item.key ? "active" : ""} onClick={() => setFilter(item.key)}>{item.label}</button>)}</div>
      </section>}

      {!accountSynced && items.length > 0 && <section className="phase68-guest-watch"><div><p className="phase3-eyebrow">OPTIONAL WATCHLIST</p><strong>Want price-drop and back-in-stock watches?</strong><span>Sign in to sync this wishlist and explicitly choose the products Riseora should watch. Saving alone never subscribes you.</span></div><Link className="button button-secondary" to="/login">SIGN IN</Link></section>}

      {syncing ? <div className="skeleton-card tall" /> : items.length === 0 ? (
        <div className="empty-state premium-empty"><span className="empty-icon"><Icon name="heart" /></span><h3>No favourites yet</h3><p>Tap the heart on any product to save it here.</p><Link className="button" to="/shop">Explore products</Link></div>
      ) : visibleItems.length === 0 ? (
        <div className="empty-state premium-empty"><span className="empty-icon"><Icon name="heart" /></span><h3>Nothing in this view</h3><p>Your saved products do not currently match this watchlist filter.</p><button className="button button-secondary" type="button" onClick={() => setFilter("ALL")}>Show all saved</button></div>
      ) : <>
        <div className="phase23-share-note"><strong>Share privately</strong><span>Shared links contain product choices only—no account, email or address details—and expire after 30 days.</span></div>
        <div className="product-grid shop-grid phase68-saved-grid">{visibleItems.map((product) => {
          const info = intelligenceByProduct.get(product.id);
          return <div className="phase68-saved-card" key={product.id}>
            <ProductCard product={product} compact onProductOpen={() => reportSavedEvent("product_open")} onAddToCart={() => reportSavedEvent("add")} />
            {accountSynced && info && <div className={`phase68-decision phase68-${String(info.state || "ready").toLowerCase()}`}>
              <div><small>{info.headline}</small><span>{info.detail}</span>{info.startingPrice != null && <b>From ₹{Number(info.startingPrice).toFixed(0)}{info.reviewCount > 0 ? ` · ★ ${info.ratingAverage}` : ""}</b>}</div>
              {info.watch && <button type="button" onClick={() => startWatch(info)} disabled={watchBusy === info.productId}>{watchBusy === info.productId ? "SAVING…" : info.watch.type === "PRICE" ? "WATCH ANY PRICE DROP" : "NOTIFY WHEN AVAILABLE"}</button>}
              {!info.watch && info.priceWatch && <em>{info.priceWatch.targetPrice == null ? "Any price drop watch active" : `Target ₹${Number(info.priceWatch.targetPrice).toFixed(0)} watch active`}</em>}
              {!info.watch && info.stockWatch && <em>Back-in-stock watch active</em>}
            </div>}
          </div>;
        })}</div>
      </>}
    </div>
  );
}
