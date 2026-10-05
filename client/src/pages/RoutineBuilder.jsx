import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";
import { Icon } from "../components/Icons";
import Seo from "../components/Seo";

function primaryImage(product) {
  const item = product?.images?.find((image) => image.isPrimary) || product?.images?.[0];
  return mediaUrl(item?.url);
}

function firstAvailableVariant(product) {
  return product?.variants?.find((variant) => Number(variant.stockQuantity || 0) > 0) || null;
}

export default function RoutineBuilder() {
  const { addItems } = useCart();
  const [searchParams] = useSearchParams();
  const seedSlug = (searchParams.get("seed") || "").trim();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [selected, setSelected] = useState({});
  const [guide, setGuide] = useState({ products: [], selected: [], seedProduct: null, strategy: "catalog", note: "" });
  const [guideBusy, setGuideBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const viewTracked = useRef(false);

  useEffect(() => {
    Promise.all([apiFetch("/products?limit=60"), apiFetch("/categories")])
      .then(([productResponse, categoryResponse]) => {
        setProducts(Array.isArray(productResponse.data) ? productResponse.data : []);
        setCategories(Array.isArray(categoryResponse.data) ? categoryResponse.data : []);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    apiFetch("/products/routine/event", { method: "POST", body: JSON.stringify({ type: "view", selectedCount: 0 }) }).catch(() => {});
  }, []);

  const selectedIds = useMemo(() => Object.keys(selected).sort(), [selected]);
  const selectedKey = selectedIds.join(",");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setGuideBusy(true);
      try {
        const response = await apiFetch("/products/routine/intelligence", {
          method: "POST",
          body: JSON.stringify({ productIds: selectedIds, seedSlug, limit: 8 }),
        });
        if (active) setGuide(response.data || { products: [], selected: [], seedProduct: null, strategy: "catalog", note: "" });
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setGuideBusy(false);
      }
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [selectedKey, seedSlug]);

  useEffect(() => {
    const seed = guide?.seedProduct;
    if (!seed?.id || selected[seed.id]) return;
    if (Object.keys(selected).length >= 4) return;
    const variant = firstAvailableVariant(seed);
    if (variant) setSelected((current) => current[seed.id] ? current : { ...current, [seed.id]: variant.id });
  }, [guide?.seedProduct?.id]);

  const catalogMap = useMemo(() => {
    const map = new Map();
    for (const product of [...products, ...(guide.products || []), ...(guide.selected || []), ...(guide.seedProduct ? [guide.seedProduct] : [])]) {
      if (product?.id) map.set(product.id, product);
    }
    return map;
  }, [products, guide]);

  const visible = useMemo(() => products.filter((product) => {
    if (activeCategory !== "ALL" && product.category?.slug !== activeCategory) return false;
    return product.variants?.some((variant) => Number(variant.stockQuantity || 0) > 0);
  }), [products, activeCategory]);

  const chosen = useMemo(() => Object.entries(selected).flatMap(([productId, variantId]) => {
    const product = catalogMap.get(productId);
    const variant = product?.variants?.find((item) => item.id === variantId);
    return product && variant ? [{ product, variant }] : [];
  }), [catalogMap, selected]);

  const total = chosen.reduce((sum, item) => sum + Number(item.variant.sellingPrice || 0), 0);
  const mrpTotal = chosen.reduce((sum, item) => sum + Number(item.variant.mrp || item.variant.sellingPrice || 0), 0);
  const catalogSavings = Math.max(0, mrpTotal - total);
  const suggestions = (guide.products || []).filter((product) => !selected[product.id]).slice(0, chosen.length >= 4 ? 0 : chosen.length ? 6 : 4);

  function toggleProduct(product) {
    setMessage("");
    setSelected((current) => {
      if (current[product.id]) {
        const next = { ...current };
        delete next[product.id];
        return next;
      }
      if (Object.keys(current).length >= 4) return current;
      const variant = firstAvailableVariant(product);
      return variant ? { ...current, [product.id]: variant.id } : current;
    });
  }

  function chooseVariant(productId, variantId) {
    setSelected((current) => ({ ...current, [productId]: variantId }));
  }

  function addGuidedProduct(product) {
    if (selected[product.id] || Object.keys(selected).length >= 4) return;
    const variant = firstAvailableVariant(product);
    if (!variant) return;
    setSelected((current) => ({ ...current, [product.id]: variant.id }));
    apiFetch("/products/routine/event", { method: "POST", body: JSON.stringify({ type: "guided_pick", selectedCount: Math.min(4, chosen.length + 1) }) }).catch(() => {});
  }

  async function addRoutine() {
    if (!chosen.length || adding) return;
    setAdding(true); setMessage(""); setError("");
    try {
      const response = await apiFetch("/products/routine/preview", {
        method: "POST",
        body: JSON.stringify({ selections: chosen.map(({ variant }) => ({ variantId: variant.id, quantity: 1 })) }),
      });
      const preview = response.data || {};
      if (!preview.ready) {
        const firstIssue = preview.issues?.[0]?.message || "One or more routine items changed. Review your selections and try again.";
        setError(firstIssue);
        return;
      }
      const entries = (preview.lines || []).map((line) => ({ product: line.product, variant: line.variant, quantity: line.quantity || 1 }));
      if (!entries.length || !addItems(entries)) throw new Error("No routine items could be added to the cart");
      setMessage(`Routine added to Cart · ₹${Number(preview.merchandiseTotal || 0).toFixed(0)}${Number(preview.catalogSavings || 0) > 0 ? ` · ₹${Number(preview.catalogSavings).toFixed(0)} below current MRP` : ""}`);
      apiFetch("/products/routine/event", { method: "POST", body: JSON.stringify({ type: "add", selectedCount: entries.length }) }).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  return <>
    <Seo title="Build Your Routine" description="Build a personalised Riseora shopping routine from products you choose, with catalogue-guided companion picks." />
    <section className="phase14-routine-hero phase63-routine-hero"><div className="container"><p className="phase3-eyebrow">PHASE 63 · SMART ROUTINE BUILDER</p><h1>Build a routine that fits you.</h1><p>Start with any Riseora product, get catalogue-guided companion ideas, choose up to four products and review today's live price before adding the routine to Cart.</p><div><span><b>1</b> Start anywhere</span><span><b>2</b> Review guided picks</span><span><b>3</b> Add together</span></div></div></section>

    <div className="container page-space phase14-routine-page">
      {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

      {(guideBusy || suggestions.length > 0 || guide.seedProduct) && <section className="phase63-guided-panel">
        <div className="section-title-row"><div><p className="phase3-eyebrow">GUIDED COMPANIONS</p><h2>{guide.seedProduct ? `Build around ${guide.seedProduct.name}` : chosen.length ? "Complete what you've selected" : "Easy places to start"}</h2><p>Suggestions use catalogue category, ingredients, suitable-for text, product goals, ratings and live availability. They are shopping guidance, not medical advice.</p></div><span className="phase63-guide-status">{guideBusy ? "REFRESHING" : guide.strategy === "guided" ? "LIVE MATCH" : "CATALOG PICKS"}</span></div>
        {guideBusy && !suggestions.length ? <div className="loading-card">Finding suitable catalogue companions…</div> : <div className="phase63-guided-grid">{suggestions.map((product) => {
          const variant = firstAvailableVariant(product);
          const image = primaryImage(product);
          return <article key={product.id} className="phase63-guided-card"><Link to={`/product/${product.slug}`}>{image ? <img src={image} alt={product.name} /> : <span className="phase63-guided-fallback">R</span>}</Link><div><small>{product.category?.name || "Riseora"}</small><Link to={`/product/${product.slug}`}><strong>{product.name}</strong></Link><p>{product.routineReason || "Suggested for your routine"}</p>{variant && <b>₹{Number(variant.sellingPrice || 0).toFixed(0)}</b>}</div><button className="state-toggle active" disabled={!variant || chosen.length >= 4} onClick={() => addGuidedProduct(product)}>{chosen.length >= 4 ? "ROUTINE FULL" : "+ ADD"}</button></article>;
        })}</div>}
      </section>}

      <div className="phase14-routine-toolbar"><div className="phase14-routine-filters"><button className={activeCategory === "ALL" ? "active" : ""} onClick={() => setActiveCategory("ALL")}>All</button>{categories.map((category) => <button key={category.id} className={activeCategory === category.slug ? "active" : ""} onClick={() => setActiveCategory(category.slug)}>{category.name}</button>)}</div><span>{chosen.length}/4 selected</span></div>

      <div className="phase14-routine-layout">
        <div className="phase14-routine-grid">
          {visible.map((product) => {
            const picked = Boolean(selected[product.id]);
            const image = primaryImage(product);
            const activeVariant = product.variants?.find((variant) => variant.id === selected[product.id]) || firstAvailableVariant(product);
            return <article key={product.id} className={picked ? "phase14-routine-card selected" : "phase14-routine-card"}>
              <button className="phase14-routine-select" onClick={() => toggleProduct(product)} aria-label={picked ? `Remove ${product.name}` : `Select ${product.name}`}><span>{picked ? "✓" : "+"}</span></button>
              <Link to={`/product/${product.slug}`} className="phase14-routine-image">{image ? <img src={image} alt={product.name} /> : <span>R</span>}</Link>
              <div><small>{product.category?.name || "Riseora"}</small><Link to={`/product/${product.slug}`}><strong>{product.name}</strong></Link>{activeVariant && <span>₹{Number(activeVariant.sellingPrice).toFixed(0)}</span>}</div>
              {picked && <select value={selected[product.id]} onChange={(e) => chooseVariant(product.id, e.target.value)}>{product.variants?.filter((variant) => Number(variant.stockQuantity || 0) > 0).map((variant) => <option key={variant.id} value={variant.id}>{variant.name} • ₹{Number(variant.sellingPrice).toFixed(0)}</option>)}</select>}
            </article>;
          })}
          {!error && visible.length === 0 && <div className="empty-state"><h3>No available products in this category</h3><p>Choose another category or check back after stock is replenished.</p></div>}
        </div>

        <aside className="phase14-routine-summary phase63-routine-summary">
          <p className="phase3-eyebrow">YOUR ROUTINE</p><h2>{chosen.length ? `${chosen.length} product${chosen.length === 1 ? "" : "s"} selected` : "Start with your favourites"}</h2>
          {chosen.length ? <div className="phase14-routine-picked">{chosen.map(({ product, variant }, index) => <div key={variant.id}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{product.name}</strong><small>{variant.name}</small></span><em>₹{Number(variant.sellingPrice).toFixed(0)}</em></div>)}</div> : <p>Select products manually or use the guided companion picks. You decide what belongs in your routine.</p>}
          <div className="phase63-price-review"><div><span>Today's routine total</span><strong>₹{total.toFixed(0)}</strong></div>{catalogSavings > 0 && <p><b>₹{catalogSavings.toFixed(0)}</b> below current MRP across selected products</p>}</div>
          <button className="button wide" disabled={!chosen.length || adding} onClick={addRoutine}>{adding ? "RECHECKING LIVE STOCK…" : "ADD ROUTINE TO CART"} <Icon name="plus" size={17} /></button>
          <small className="phase63-routine-policy">Stock and current selling price are revalidated immediately before Cart. Additional coupons or automatic deals are calculated later by Checkout.</small>
          <Link to="/shop">Prefer to browse normally? Shop all products</Link>
        </aside>
      </div>
    </div>
  </>;
}
