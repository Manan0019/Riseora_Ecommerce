import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";
import { useCompare } from "../context/CompareContext";
import { useWishlist } from "../context/WishlistContext";
import { Icon } from "../components/Icons";
import Seo from "../components/Seo";

const money = (value) => `₹${Number(value || 0).toFixed(0)}`;
const join = (items) => Array.isArray(items) && items.length ? items.join(" • ") : "—";

export default function Compare() {
  const { items: selected, remove, clear } = useCompare();
  const { addItem } = useCart();
  const { toggle: toggleWishlist, has: wished } = useWishlist();
  const [products, setProducts] = useState([]);
  const [shared, setShared] = useState({ ingredients: [], suitableFor: [] });
  const [methodology, setMethodology] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lastTracked = useRef("");
  const ids = useMemo(() => selected.map((item) => item.id), [selected]);
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!ids.length) { setProducts([]); setShared({ ingredients: [], suitableFor: [] }); return; }
    setLoading(true); setError("");
    apiFetch(`/products/compare?ids=${encodeURIComponent(idsKey)}`)
      .then((response) => {
        const data = response.data;
        if (Array.isArray(data)) {
          setProducts(data);
          setShared({ ingredients: [], suitableFor: [] });
          setMethodology("");
          return;
        }
        setProducts(Array.isArray(data?.products) ? data.products : []);
        setShared(data?.shared || { ingredients: [], suitableFor: [] });
        setMethodology(data?.methodology || "");
      })
      .catch((e) => setError(e.message || "Could not load comparison"))
      .finally(() => setLoading(false));
  }, [idsKey]);

  useEffect(() => {
    if (products.length < 2 || lastTracked.current === idsKey) return;
    lastTracked.current = idsKey;
    apiFetch("/products/compare/event", { method: "POST", body: JSON.stringify({ type: "view", productIds: ids }) }).catch(() => {});
  }, [products.length, idsKey]);

  function record(type, productId) {
    apiFetch("/products/compare/event", { method: "POST", body: JSON.stringify({ type, productIds: ids, productId }) }).catch(() => {});
  }

  return <div className="container page-space phase35-compare-page phase65-compare-page">
    <Seo title="Compare products" noindex />
    <div className="shop-title-row"><div><p className="eyebrow">PHASE 65 · DECISION SUPPORT</p><h1>Compare with clarity</h1><p className="muted">Side-by-side catalogue facts, live availability and approved-review trust signals. No medical efficacy claims and no hidden winner.</p></div>{selected.length > 0 && <button className="button button-secondary" type="button" onClick={clear}>Clear comparison</button>}</div>
    {error && <p className="alert error">{error}</p>}
    {!loading && products.length < 2 ? <div className="empty-state premium-empty"><span className="empty-icon"><Icon name="compare" /></span><h3>Choose at least two products</h3><p>Use Compare on product cards or Product Details to build a shortlist of up to three products.</p><Link className="button" to="/shop">Explore products</Link></div> : null}
    {loading ? <div className="skeleton-card tall" /> : products.length >= 2 && <>
      <section className="phase65-decision-panel">
        <div className="phase65-decision-head"><div><p className="eyebrow">DECISION SNAPSHOT</p><h2>Objective highlights</h2><p>Highlights are calculated only from current catalogue values and approved reviews.</p></div><span>{products.length} products</span></div>
        <div className="phase65-highlight-grid">{products.map((product) => <article key={product.id}>
          <strong>{product.name}</strong>
          <div>{(product.comparisonHighlights || []).map((item) => <span key={item}>{item}</span>)}</div>
          <small>{product.isAvailable ? `${product.availablePackCount}/${product.packCount} pack${product.packCount === 1 ? "" : "s"} available` : "Currently unavailable"}</small>
        </article>)}</div>
        {(shared.ingredients?.length || shared.suitableFor?.length) ? <div className="phase65-shared-facts">
          {shared.ingredients?.length ? <div><b>Shared ingredients</b><p>{join(shared.ingredients)}</p></div> : null}
          {shared.suitableFor?.length ? <div><b>Shared suitable-for information</b><p>{join(shared.suitableFor)}</p></div> : null}
        </div> : null}
        {methodology && <p className="phase65-methodology">{methodology}</p>}
      </section>

      <div className="phase35-compare-scroll"><table className="phase35-compare-table phase65-compare-table"><thead><tr><th>Compare</th>{products.map((product) => { const image = product.images?.find((item) => item.isPrimary) || product.images?.[0]; const variant = product.variants?.find((item) => Number(item.availableQuantity ?? item.stockQuantity ?? 0)>0) || product.variants?.[0]; return <th key={product.id}><button className="phase35-compare-remove" type="button" onClick={() => remove(product.id)}><Icon name="close" size={14}/> Remove</button><Link to={`/product/${product.slug}`} className="phase35-compare-product" onClick={() => record("product_open", product.id)}>{image?.url ? <img src={mediaUrl(image.url)} alt={product.name} /> : <span>R</span>}<small>{product.category?.name}</small><strong>{product.name}</strong><b>{variant ? money(variant.sellingPrice) : "Unavailable"}</b></Link><div className="phase35-compare-product-actions"><button type="button" onClick={() => toggleWishlist(product)} className={wished(product.id) ? "active" : ""}><Icon name="heart" size={15}/> {wished(product.id) ? "Saved" : "Save"}</button><button type="button" disabled={!variant || Number(variant.availableQuantity ?? variant.stockQuantity ?? 0)<=0} onClick={() => { if (!variant) return; addItem(product, variant, 1); record("add_to_cart", product.id); }}><Icon name="cart" size={15}/> Add</button></div></th>; })}</tr></thead><tbody>
        <Row label="Starting price" products={products} render={(p) => p.startingPrice ? `${money(p.startingPrice)}${p.startingMrp > p.startingPrice ? ` · MRP ${money(p.startingMrp)} · save ${money(p.mrpSaving)}` : ""}` : "Unavailable"} />
        <Row label="Availability" products={products} render={(p) => p.isAvailable ? `${p.availablePackCount} of ${p.packCount} pack${p.packCount === 1 ? "" : "s"} available` : "Currently unavailable"} />
        <Row label="Approved rating" products={products} render={(p) => p.reviewCount ? `★ ${Number(p.ratingAverage).toFixed(1)} · ${p.reviewCount} review${p.reviewCount === 1 ? "" : "s"}` : "No approved reviews yet"} />
        <Row label="Verified review trust" products={products} render={(p) => p.reviewCount ? `${p.verifiedReviewCount} verified (${p.verifiedReviewPercent}%)${p.photoReviewCount ? ` · ${p.photoReviewCount} with photos` : ""}` : "—"} />
        <Row label="Answered Q&A" products={products} render={(p) => `${p.answeredQuestionCount || 0} published answer${Number(p.answeredQuestionCount || 0) === 1 ? "" : "s"}`} />
        <Row label="Suitable for" products={products} render={(p) => join(p.suitableForList)} />
        <Row label="Key benefits" products={products} render={(p) => join(p.benefitsList)} />
        <Row label="Ingredients" products={products} render={(p) => join(p.ingredientsList)} />
        <Row label="Pack sizes" products={products} render={(p) => p.variants?.map((v) => `${v.name} · ${money(v.sellingPrice)}${Number(v.availableQuantity ?? v.stockQuantity ?? 0)>0 ? "" : " · sold out"}`).join("\n") || "—"} preserve />
        <Row label="Cash on delivery" products={products} render={(p) => p.codAllowed === false ? "Prepaid only" : "Available"} />
      </tbody></table></div>
    </>}
  </div>;
}

function Row({ label, products, render, preserve=false }) { return <tr><th>{label}</th>{products.map((product) => <td key={product.id} className={preserve ? "preline" : ""}>{render(product)}</td>)}</tr>; }
