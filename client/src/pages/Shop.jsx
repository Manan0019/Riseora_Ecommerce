import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { Icon } from "../components/Icons";
import ProductCard from "../components/ProductCard";
import Seo from "../components/Seo";
import { trackEvent } from "../analytics";

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [facets, setFacets] = useState({ suitability: [], ingredients: [], price: { min: 0, max: 0 } });
  const [search, setSearch] = useState(params.get("search") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [sort, setSort] = useState(params.get("sort") || "featured");
  const [inStock, setInStock] = useState(params.get("inStock") === "true");
  const [minPrice, setMinPrice] = useState(params.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(params.get("maxPrice") || "");
  const [badge, setBadge] = useState(params.get("badge") || "");
  const [suitableFor, setSuitableFor] = useState(params.get("suitableFor") || "");
  const [ingredient, setIngredient] = useState(params.get("ingredient") || "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const lastTrackedSearch = useRef("");
  const hydrated = useRef(false);

  useEffect(() => {
    Promise.all([apiFetch("/categories"), apiFetch("/products/discovery/facets")]).then(([categoryResponse, facetResponse]) => {
      setCategories(categoryResponse.data || []);
      setFacets(facetResponse.data || { suitability: [], ingredients: [], price: { min: 0, max: 0 } });
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return; }
    setSearch(params.get("search") || ""); setCategory(params.get("category") || ""); setSort(params.get("sort") || "featured");
    setInStock(params.get("inStock") === "true"); setMinPrice(params.get("minPrice") || ""); setMaxPrice(params.get("maxPrice") || "");
    setBadge(params.get("badge") || ""); setSuitableFor(params.get("suitableFor") || ""); setIngredient(params.get("ingredient") || "");
  }, [params.toString()]);

  const queryParams = useMemo(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set("search", search.trim()); if (category) next.set("category", category); if (sort !== "featured") next.set("sort", sort);
    if (inStock) next.set("inStock", "true"); if (minPrice !== "") next.set("minPrice", minPrice); if (maxPrice !== "") next.set("maxPrice", maxPrice);
    if (badge) next.set("badge", badge); if (suitableFor) next.set("suitableFor", suitableFor); if (ingredient) next.set("ingredient", ingredient);
    return next;
  }, [search, category, sort, inStock, minPrice, maxPrice, badge, suitableFor, ingredient]);
  const query = queryParams.toString() ? `?${queryParams}` : "";

  useEffect(() => {
    const timer = setTimeout(() => setParams(queryParams, { replace: true }), 250);
    return () => clearTimeout(timer);
  }, [queryParams.toString()]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => { setLoading(true); setError(""); apiFetch(`/products${query}`).then((response) => { if (!cancelled) setProducts(response.data || []); }).catch((err) => { if (!cancelled) setError(err.message); }).finally(() => { if (!cancelled) setLoading(false); }); }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  useEffect(() => { const term = search.trim().toLowerCase(); if (loading || term.length < 2 || lastTrackedSearch.current === term) return; lastTrackedSearch.current = term; trackEvent("search", { search_term: term.slice(0, 100), results_count: products.length }); }, [search, loading, products.length]);

  const activeFilterCount = [category, inStock, minPrice !== "", maxPrice !== "", badge, suitableFor, ingredient].filter(Boolean).length;
  const activeCategory = categories.find((item) => item.slug === category);
  function clearFilters() { setCategory(""); setInStock(false); setMinPrice(""); setMaxPrice(""); setBadge(""); setSuitableFor(""); setIngredient(""); }
  const activeChips = [
    category && { key:"category", label: activeCategory?.name || category, clear:()=>setCategory("") },
    suitableFor && { key:"suitable", label:`For: ${suitableFor}`, clear:()=>setSuitableFor("") },
    ingredient && { key:"ingredient", label:`Ingredient: ${ingredient}`, clear:()=>setIngredient("") },
    badge && { key:"badge", label:badge, clear:()=>setBadge("") },
    inStock && { key:"stock", label:"In stock", clear:()=>setInStock(false) },
    (minPrice!=="" || maxPrice!=="") && { key:"price", label:`₹${minPrice || facets.price?.min || 0} – ₹${maxPrice || facets.price?.max || "Any"}`, clear:()=>{setMinPrice("");setMaxPrice("");} },
  ].filter(Boolean);

  return <>
    <Seo title="Shop" description="Shop Riseora Herbals by category, ingredient, suitability, price and availability." />
    <div className="container shop-page page-space phase9-shop phase35-shop">
      <div className="shop-title-row"><div><p className="eyebrow">RISEORA STORE</p><h1>{activeCategory ? activeCategory.name : "Find your ritual"}</h1><p className="muted">Search naturally, browse by need and compare products before you choose.</p></div></div>
      {activeCategory && <section className="phase18-shop-category-banner"><div className="phase18-shop-category-image">{activeCategory.imageUrl ? <img src={mediaUrl(activeCategory.imageUrl)} alt={activeCategory.name} /> : <span>{activeCategory.name.charAt(0)}</span>}</div><div><small>SHOP CATEGORY</small><strong>{activeCategory.name}</strong><p>{activeCategory.description || `Explore all ${activeCategory.name} products from Riseora.`}</p></div></section>}

      {facets.suitability?.length > 0 && <section className="phase35-discovery-strip"><div><small>SHOP BY NEED</small><strong>What are you shopping for?</strong></div><div>{facets.suitability.slice(0,10).map((item) => <button type="button" key={item.id || item.name} className={suitableFor===item.name ? "active" : ""} onClick={() => setSuitableFor((current)=>current===item.name?"":item.name)}>{item.name}</button>)}</div></section>}

      <div className="phase9-shop-toolbar"><div className="shop-search-wrap"><Icon name="search" size={20} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try ‘hair fall’, ‘neem’, ‘face oil’ or SKU" aria-label="Search products" /></div><button className={activeFilterCount ? "phase9-filter-button active" : "phase9-filter-button"} onClick={() => setFiltersOpen((value) => !value)}><Icon name="tag" size={18} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</button><select className="phase9-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort products"><option value="featured">Best match</option><option value="newest">Newest</option><option value="rating">Top rated</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="name">Name A–Z</option></select></div>
      <div className="filter-chip-row" aria-label="Product categories"><button className={!category ? "filter-chip active" : "filter-chip"} onClick={() => setCategory("")}>All</button>{categories.map((item) => <button key={item.id} className={category === item.slug ? "filter-chip active" : "filter-chip"} onClick={() => setCategory(item.slug)}>{item.name}</button>)}</div>
      {activeChips.length > 0 && <div className="phase35-active-filters">{activeChips.map((chip) => <button type="button" key={chip.key} onClick={chip.clear}>{chip.label} <Icon name="close" size={12}/></button>)}<button type="button" className="clear" onClick={clearFilters}>Clear all</button></div>}

      {filtersOpen && <><button className="phase15-filter-backdrop" type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters" /><section className="phase9-filter-panel phase15-filter-sheet phase35-filter-sheet" role="dialog" aria-modal="true" aria-label="Shop filters"><div className="phase15-filter-sheet-head"><div><small>REFINE PRODUCTS</small><strong>Filters</strong></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><Icon name="close" size={20} /></button></div>
        <label>Suitable for<select value={suitableFor} onChange={(e)=>setSuitableFor(e.target.value)}><option value="">Any need</option>{facets.suitability?.map((item)=><option key={item.id||item.name} value={item.name}>{item.name}</option>)}</select></label>
        <label>Key ingredient<select value={ingredient} onChange={(e)=>setIngredient(e.target.value)}><option value="">Any ingredient</option>{facets.ingredients?.map((item)=><option key={item.name} value={item.name}>{item.name}{item.count>1?` (${item.count})`:""}</option>)}</select></label>
        <label>Min price ₹<input type="number" min="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder={String(facets.price?.min || 0)} /></label><label>Max price ₹<input type="number" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder={String(facets.price?.max || 2000)} /></label>
        <label>Merchandising<select value={badge} onChange={(e) => setBadge(e.target.value)}><option value="">All products</option><option value="BEST SELLER">Best seller</option><option value="NEW">New</option><option value="TRENDING">Trending</option></select></label><label className="checkbox-row phase9-stock-check"><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> In stock only</label>
        <div className="phase15-filter-sheet-actions"><button className="link-button" onClick={clearFilters}>Clear all</button><button className="button" type="button" onClick={() => setFiltersOpen(false)}>VIEW {products.length} {products.length === 1 ? "PRODUCT" : "PRODUCTS"}</button></div></section></>}

      <div className="shop-result-row"><strong>{loading ? "Finding the best matches…" : `${products.length} ${products.length === 1 ? "product" : "products"}`}</strong>{search.trim() && !loading && <span className="phase35-result-context">for “{search.trim()}”</span>}</div>
      {error && <p className="alert error">{error}</p>}
      {!loading && !error && products.length === 0 && <div className="empty-state premium-empty"><span className="empty-icon"><Icon name="search" /></span><h3>No matching products</h3><p>Try fewer words or remove one of the filters.</p><button className="button button-secondary" onClick={clearFilters}>Clear filters</button></div>}
      <div className="product-grid shop-grid">{products.map((product) => <ProductCard key={product.id} product={product} compact />)}</div>
    </div>
  </>;
}
