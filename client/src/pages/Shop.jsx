import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { Icon } from "../components/Icons";
import ProductCard from "../components/ProductCard";
import Seo from "../components/Seo";

export default function Shop() {
  const [params] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState(params.get("search") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [sort, setSort] = useState("featured");
  const [inStock, setInStock] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [badge, setBadge] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { apiFetch("/categories").then((response) => setCategories(response.data)).catch(() => {}); }, []);
  useEffect(() => { setCategory(params.get("category") || ""); setSearch(params.get("search") || ""); }, [params]);

  const query = useMemo(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set("search", search.trim());
    if (category) next.set("category", category);
    if (sort !== "featured") next.set("sort", sort);
    if (inStock) next.set("inStock", "true");
    if (minPrice !== "") next.set("minPrice", minPrice);
    if (maxPrice !== "") next.set("maxPrice", maxPrice);
    if (badge) next.set("badge", badge);
    const value = next.toString();
    return value ? `?${value}` : "";
  }, [search, category, sort, inStock, minPrice, maxPrice, badge]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      apiFetch(`/products${query}`).then((response) => setProducts(response.data)).catch((err) => setError(err.message)).finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const activeFilterCount = [category, inStock, minPrice !== "", maxPrice !== "", badge].filter(Boolean).length;
  const activeCategory = categories.find((item) => item.slug === category);
  function clearFilters() { setCategory(""); setInStock(false); setMinPrice(""); setMaxPrice(""); setBadge(""); }

  return <>
    <Seo title="Shop" description="Shop Riseora Herbals products, variants and current offers online." />
    <div className="container shop-page page-space phase9-shop">
      <div className="shop-title-row"><div><p className="eyebrow">RISEORA STORE</p><h1>{activeCategory ? activeCategory.name : "Find your ritual"}</h1><p className="muted">{activeCategory?.description || "Search, filter and compare the complete Riseora catalogue."}</p></div></div>

      {activeCategory && <section className="phase18-shop-category-banner">
        <div className="phase18-shop-category-image">{activeCategory.imageUrl ? <img src={mediaUrl(activeCategory.imageUrl)} alt={activeCategory.name} /> : <span>{activeCategory.name.charAt(0)}</span>}</div>
        <div><small>SHOP CATEGORY</small><strong>{activeCategory.name}</strong><p>{activeCategory.description || `Explore all ${activeCategory.name} products from Riseora.`}</p></div>
      </section>}

      <div className="phase9-shop-toolbar">
        <div className="shop-search-wrap"><Icon name="search" size={20} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products, benefits or SKU" aria-label="Search products" /></div>
        <button className={activeFilterCount ? "phase9-filter-button active" : "phase9-filter-button"} onClick={() => setFiltersOpen((value) => !value)}><Icon name="tag" size={18} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>
        <select className="phase9-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort products"><option value="featured">Featured</option><option value="newest">Newest</option><option value="rating">Top rated</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="name">Name A–Z</option></select>
      </div>

      <div className="filter-chip-row" aria-label="Product categories"><button className={!category ? "filter-chip active" : "filter-chip"} onClick={() => setCategory("")}>All</button>{categories.map((item) => <button key={item.id} className={category === item.slug ? "filter-chip active" : "filter-chip"} onClick={() => setCategory(item.slug)}>{item.name}</button>)}</div>

      {filtersOpen && <>
        <button className="phase15-filter-backdrop" type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters" />
        <section className="phase9-filter-panel phase15-filter-sheet" role="dialog" aria-modal="true" aria-label="Shop filters">
          <div className="phase15-filter-sheet-head"><div><small>REFINE PRODUCTS</small><strong>Filters</strong></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><Icon name="close" size={20} /></button></div>
          <label>Min price ₹<input type="number" min="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0" /></label>
          <label>Max price ₹<input type="number" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="2000" /></label>
          <label>Merchandising<select value={badge} onChange={(e) => setBadge(e.target.value)}><option value="">All products</option><option value="BEST SELLER">Best seller</option><option value="NEW">New</option><option value="TRENDING">Trending</option></select></label>
          <label className="checkbox-row phase9-stock-check"><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> In stock only</label>
          <div className="phase15-filter-sheet-actions"><button className="link-button" onClick={clearFilters}>Clear all</button><button className="button" type="button" onClick={() => setFiltersOpen(false)}>VIEW {products.length} {products.length === 1 ? "PRODUCT" : "PRODUCTS"}</button></div>
        </section>
      </>}

      <div className="shop-result-row"><strong>{loading ? "Loading…" : `${products.length} ${products.length === 1 ? "product" : "products"}`}</strong>{activeFilterCount > 0 && <button className="link-button muted" onClick={clearFilters}>Reset</button>}</div>
      {error && <p className="alert error">{error}</p>}
      {!loading && !error && products.length === 0 && <div className="empty-state premium-empty"><span className="empty-icon"><Icon name="search" /></span><h3>No matching products</h3><p>Try changing the search, price or stock filters.</p><button className="button button-secondary" onClick={clearFilters}>Clear filters</button></div>}
      <div className="product-grid shop-grid">{products.map((product) => <ProductCard key={product.id} product={product} compact />)}</div>
    </div>
  </>;
}
