import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";
import { Icon } from "../components/Icons";
import Seo from "../components/Seo";

function primaryImage(product) {
  const item = product.images?.find((image) => image.isPrimary) || product.images?.[0];
  return mediaUrl(item?.url);
}

function firstAvailableVariant(product) {
  return product.variants?.find((variant) => Number(variant.stockQuantity || 0) > 0) || product.variants?.[0] || null;
}

export default function RoutineBuilder() {
  const { addItem } = useCart();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [selected, setSelected] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([apiFetch("/products?limit=60"), apiFetch("/categories")])
      .then(([productResponse, categoryResponse]) => { setProducts(productResponse.data || []); setCategories(categoryResponse.data || []); })
      .catch((err) => setError(err.message));
  }, []);

  const visible = useMemo(() => products.filter((product) => {
    if (activeCategory !== "ALL" && product.category?.slug !== activeCategory) return false;
    return product.variants?.some((variant) => Number(variant.stockQuantity || 0) > 0);
  }), [products, activeCategory]);

  const chosen = useMemo(() => products.flatMap((product) => {
    const variantId = selected[product.id];
    if (!variantId) return [];
    const variant = product.variants?.find((item) => item.id === variantId);
    return variant ? [{ product, variant }] : [];
  }), [products, selected]);

  const total = chosen.reduce((sum, item) => sum + Number(item.variant.sellingPrice || 0), 0);

  function toggleProduct(product) {
    setSelected((current) => {
      if (current[product.id]) { const next = { ...current }; delete next[product.id]; return next; }
      if (Object.keys(current).length >= 4) return current;
      const variant = firstAvailableVariant(product);
      return variant && Number(variant.stockQuantity || 0) > 0 ? { ...current, [product.id]: variant.id } : current;
    });
  }

  function chooseVariant(productId, variantId) { setSelected((current) => ({ ...current, [productId]: variantId })); }
  function addRoutine() { chosen.forEach(({ product, variant }) => addItem(product, variant, 1)); }

  return <>
    <Seo title="Build Your Routine" description="Build a personalised Riseora shopping routine from the products you choose." />
    <section className="phase14-routine-hero"><div className="container"><p className="phase3-eyebrow">YOUR RISEORA RITUAL</p><h1>Build a routine that fits you.</h1><p>Choose up to four Riseora products, pick the size you want, review the total and add the complete routine to your bag in one tap.</p><div><span><b>1</b> Choose products</span><span><b>2</b> Pick sizes</span><span><b>3</b> Add the routine</span></div></div></section>

    <div className="container page-space phase14-routine-page">
      {error && <p className="alert error">{error}</p>}
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
          {!error && visible.length === 0 && <div className="empty-state"><h3>No available products in this category</h3><p>Choose another category or add stock from Admin.</p></div>}
        </div>

        <aside className="phase14-routine-summary">
          <p className="phase3-eyebrow">YOUR ROUTINE</p><h2>{chosen.length ? `${chosen.length} product${chosen.length === 1 ? "" : "s"} selected` : "Start with your favourites"}</h2>
          {chosen.length ? <div className="phase14-routine-picked">{chosen.map(({ product, variant }, index) => <div key={variant.id}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{product.name}</strong><small>{variant.name}</small></span><em>₹{Number(variant.sellingPrice).toFixed(0)}</em></div>)}</div> : <p>Select products from the grid. This builder does not make medical recommendations; you decide what belongs in your routine.</p>}
          <div className="phase14-routine-total"><span>Routine total</span><strong>₹{total.toFixed(0)}</strong></div>
          <button className="button wide" disabled={!chosen.length} onClick={addRoutine}>ADD ROUTINE TO CART <Icon name="plus" size={17} /></button>
          <Link to="/shop">Prefer to browse normally? Shop all products</Link>
        </aside>
      </div>
    </div>
  </>;
}
