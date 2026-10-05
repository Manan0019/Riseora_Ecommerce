import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import Seo from "../components/Seo";

function money(value) { return `₹${Number(value || 0).toFixed(0)}`; }

function ProductMini({ product }) {
  const image = product.images?.[0];
  return <Link className="phase66-ingredient-product" to={`/product/${product.slug}`}>
    <div>{image?.url ? <img src={mediaUrl(image.url)} alt={image.altText || product.name} /> : <span>R</span>}</div>
    <section><small>{product.category?.name}</small><strong>{product.name}</strong><p>{product.shortDescription || "Explore this Riseora product."}</p><b>{product.startingPrice ? `From ${money(product.startingPrice)}` : "View product"}</b></section>
    <em className={product.available ? "available" : ""}>{product.available ? "AVAILABLE" : "CHECK STOCK"}</em>
  </Link>;
}

export default function IngredientLibrary() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const query = params.get("q") || "";

  useEffect(() => {
    let live = true; setLoading(true); setError("");
    const request = slug
      ? apiFetch(`/products/ingredients/${encodeURIComponent(slug)}`)
      : apiFetch(`/products/ingredients/library${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    request.then((response) => {
      if (!live) return;
      if (slug) setDetail(response.data); else setItems(Array.isArray(response.data) ? response.data : []);
    }).catch((err) => live && setError(err.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [slug, query]);

  const totalProducts = useMemo(() => items.reduce((sum, item) => sum + Number(item.productCount || 0), 0), [items]);
  if (loading) return <div className="container page-space"><div className="skeleton-card tall" /></div>;
  if (error) return <div className="container page-space"><p className="alert error">{error}</p></div>;

  if (slug && detail) return <>
    <Seo title={`${detail.name} in Riseora products`} description={`Explore Riseora products whose current catalogue ingredient information includes ${detail.name}.`} />
    <main className="container page-space phase66-ingredient-page">
      <div className="phase66-breadcrumb"><Link to="/ingredients">Ingredient library</Link><span>›</span><b>{detail.name}</b></div>
      <header className="phase66-ingredient-hero phase66-detail-hero"><div><p className="phase3-eyebrow">PHASE 66 · INGREDIENT TRANSPARENCY</p><h1>{detail.name}</h1><p>Found in {detail.productCount} active Riseora product{detail.productCount === 1 ? "" : "s"} across {detail.categoryCount} categor{detail.categoryCount === 1 ? "y" : "ies"}.</p></div><span>{detail.productCount} PRODUCTS</span></header>
      <section className="phase66-guidance-card"><strong>Catalogue information, not medical advice</strong><p>{detail.guidance?.note}</p><small>{detail.guidance?.safety}</small></section>
      {detail.categories?.length > 0 && <div className="phase66-category-chips">{detail.categories.map((category) => <Link key={category.id} to={`/shop?category=${encodeURIComponent(category.slug)}`}>{category.name}</Link>)}</div>}
      <section className="phase66-section"><div className="section-title-row"><div><p className="phase3-eyebrow">SHOP BY INGREDIENT</p><h2>Products containing {detail.name}</h2></div></div><div className="phase66-product-grid">{detail.products.map((product) => <ProductMini key={product.id} product={product} />)}</div></section>
      {detail.relatedIngredients?.length > 0 && <section className="phase66-section"><div className="section-title-row"><div><p className="phase3-eyebrow">ALSO APPEARS WITH</p><h2>Related catalogue ingredients</h2></div></div><div className="phase66-related-grid">{detail.relatedIngredients.map((item) => <Link key={item.slug} to={`/ingredients/${item.slug}`}><strong>{item.name}</strong><span>{item.count} shared product{item.count === 1 ? "" : "s"}</span></Link>)}</div></section>}
    </main>
  </>;

  return <>
    <Seo title="Ingredient Library" description="Explore ingredients listed across current Riseora products and find the products that contain them." />
    <main className="container page-space phase66-ingredient-page">
      <header className="phase66-ingredient-hero"><div><p className="phase3-eyebrow">PHASE 66 · PRODUCT EDUCATION</p><h1>Riseora ingredient library</h1><p>Browse ingredient names derived from current Riseora product information, then open the individual product for its complete formula and product-specific usage directions.</p></div><span>{items.length} INGREDIENTS</span></header>
      <form className="phase66-search" onSubmit={(event) => event.preventDefault()}><input value={query} onChange={(event) => setParams(event.target.value.trim() ? { q: event.target.value } : {})} placeholder="Search ingredient name" aria-label="Search ingredient library" />{query && <button type="button" onClick={() => setParams({})}>CLEAR</button>}</form>
      <section className="phase66-guidance-card"><strong>How to use this library</strong><p>Ingredient names come from Riseora catalogue content and may not replace the complete ingredient list printed on the product pack.</p><small>This library does not diagnose conditions, assess allergies, or make medical-treatment claims.</small></section>
      {items.length ? <div className="phase66-library-grid">{items.map((item) => <Link key={item.slug} to={`/ingredients/${item.slug}`}><div><strong>{item.name}</strong><span>{item.productCount} product{item.productCount === 1 ? "" : "s"} · {item.categoryCount} categor{item.categoryCount === 1 ? "y" : "ies"}</span></div><em>{item.availableProductCount} currently available</em></Link>)}</div> : <div className="empty-state"><h3>No ingredient found</h3><p>Try a shorter ingredient name or clear the search.</p></div>}
      {!query && items.length > 0 && <p className="phase66-library-footnote">The library currently represents {items.length} unique parsed ingredient names across {totalProducts} ingredient-to-product associations.</p>}
    </main>
  </>;
}
