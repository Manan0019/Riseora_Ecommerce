import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";
import { useCompare } from "../context/CompareContext";
import { useWishlist } from "../context/WishlistContext";
import { Icon } from "../components/Icons";
import Seo from "../components/Seo";
import { richTextToPlain } from "../components/RichText";

const plain = (value) => richTextToPlain(value || "") || "—";
export default function Compare() {
  const { items: selected, remove, clear } = useCompare();
  const { addItem } = useCart();
  const { toggle: toggleWishlist, has: wished } = useWishlist();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ids = useMemo(() => selected.map((item) => item.id), [selected]);
  useEffect(() => {
    if (!ids.length) { setProducts([]); return; }
    setLoading(true); setError("");
    apiFetch(`/products/compare?ids=${encodeURIComponent(ids.join(","))}`)
      .then((response) => setProducts(Array.isArray(response.data) ? response.data : []))
      .catch((e) => setError(e.message || "Could not load comparison"))
      .finally(() => setLoading(false));
  }, [ids.join(",")]);
  return <div className="container page-space phase35-compare-page">
    <Seo title="Compare products" noindex />
    <div className="shop-title-row"><div><p className="eyebrow">SIDE BY SIDE</p><h1>Compare your Riseora picks</h1><p className="muted">Compare price, ingredients, suitability, ratings and available pack sizes before you choose.</p></div>{selected.length > 0 && <button className="button button-secondary" type="button" onClick={clear}>Clear comparison</button>}</div>
    {error && <p className="alert error">{error}</p>}
    {!loading && products.length < 2 ? <div className="empty-state premium-empty"><span className="empty-icon"><Icon name="compare" /></span><h3>Choose at least two products</h3><p>Use the Compare button on product cards to build a side-by-side shortlist.</p><Link className="button" to="/shop">Explore products</Link></div> : null}
    {loading ? <div className="skeleton-card tall" /> : products.length >= 2 && <div className="phase35-compare-scroll"><table className="phase35-compare-table"><thead><tr><th>Compare</th>{products.map((product) => { const image = product.images?.find((item) => item.isPrimary) || product.images?.[0]; const variant = product.variants?.find((item) => Number(item.stockQuantity || 0)>0) || product.variants?.[0]; return <th key={product.id}><button className="phase35-compare-remove" type="button" onClick={() => remove(product.id)}><Icon name="close" size={14}/> Remove</button><Link to={`/product/${product.slug}`} className="phase35-compare-product">{image?.url ? <img src={mediaUrl(image.url)} alt={product.name} /> : <span>R</span>}<small>{product.category?.name}</small><strong>{product.name}</strong><b>{variant ? `₹${Number(variant.sellingPrice).toFixed(0)}` : "Unavailable"}</b></Link><div className="phase35-compare-product-actions"><button type="button" onClick={() => toggleWishlist(product)} className={wished(product.id) ? "active" : ""}><Icon name="heart" size={15}/> {wished(product.id) ? "Saved" : "Save"}</button><button type="button" disabled={!variant || Number(variant.stockQuantity||0)<=0} onClick={() => variant && addItem(product, variant, 1)}><Icon name="cart" size={15}/> Add</button></div></th>; })}</tr></thead><tbody>
      <Row label="Rating" products={products} render={(p) => p.reviewCount ? `★ ${Number(p.ratingAverage).toFixed(1)} (${p.reviewCount})` : "No reviews yet"} />
      <Row label="Suitable for" products={products} render={(p) => String(p.suitableFor || "—").split(/[\n,;|]+/).filter(Boolean).join(" • ")} />
      <Row label="Key benefits" products={products} render={(p) => plain(p.benefits)} />
      <Row label="Ingredients" products={products} render={(p) => plain(p.ingredients)} />
      <Row label="Pack sizes" products={products} render={(p) => p.variants?.map((v) => `${v.name} · ₹${Number(v.sellingPrice).toFixed(0)}${Number(v.stockQuantity)>0 ? "" : " · sold out"}`).join("\n") || "—"} preserve />
      <Row label="Cash on delivery" products={products} render={(p) => p.codAllowed === false ? "Prepaid only" : "Available"} />
    </tbody></table></div>}
  </div>;
}
function Row({ label, products, render, preserve=false }) { return <tr><th>{label}</th>{products.map((product) => <td key={product.id} className={preserve ? "preline" : ""}>{render(product)}</td>)}</tr>; }
