import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { Icon } from "../components/Icons";
import ProductCard from "../components/ProductCard";
import SmartSearch from "../components/SmartSearch";
import Seo from "../components/Seo";
import { trackEvent } from "../analytics";

const emptyFacets = {
  categories: [], suitability: [], ingredients: [], benefits: [], ratings: [], collections: [],
  availability: { inStock: 0, total: 0 }, price: { min: 0, max: 0 }, guidance: "",
};

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [facets, setFacets] = useState(emptyFacets);
  const [search, setSearch] = useState(params.get("search") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [sort, setSort] = useState(params.get("sort") || "featured");
  const [inStock, setInStock] = useState(params.get("inStock") === "true");
  const [minPrice, setMinPrice] = useState(params.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(params.get("maxPrice") || "");
  const [badge, setBadge] = useState(params.get("badge") || "");
  const [suitableFor, setSuitableFor] = useState(params.get("suitableFor") || "");
  const [ingredient, setIngredient] = useState(params.get("ingredient") || "");
  const [benefit, setBenefit] = useState(params.get("benefit") || "");
  const [minRating, setMinRating] = useState(params.get("minRating") || "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchIntelligence, setSearchIntelligence] = useState(null);
  const lastTrackedSearch = useRef("");
  const lastDiscoverySignature = useRef("");
  const hydrated = useRef(false);

  function recordDiscovery(type, detail = {}) {
    apiFetch("/products/discovery/event", { method: "POST", body: JSON.stringify({ type, ...detail }) }).catch(() => {});
  }

  useEffect(() => {
    Promise.all([apiFetch("/categories"), apiFetch("/products/discovery/facets")]).then(([categoryResponse, facetResponse]) => {
      setCategories(categoryResponse.data || []);
      setFacets({ ...emptyFacets, ...(facetResponse.data || {}) });
    }).catch(() => {});
    recordDiscovery("view");
  }, []);

  useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return; }
    setSearch(params.get("search") || ""); setCategory(params.get("category") || ""); setSort(params.get("sort") || "featured");
    setInStock(params.get("inStock") === "true"); setMinPrice(params.get("minPrice") || ""); setMaxPrice(params.get("maxPrice") || "");
    setBadge(params.get("badge") || ""); setSuitableFor(params.get("suitableFor") || ""); setIngredient(params.get("ingredient") || "");
    setBenefit(params.get("benefit") || ""); setMinRating(params.get("minRating") || "");
  }, [params.toString()]);

  const queryParams = useMemo(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set("search", search.trim()); if (category) next.set("category", category); if (sort !== "featured") next.set("sort", sort);
    if (inStock) next.set("inStock", "true"); if (minPrice !== "") next.set("minPrice", minPrice); if (maxPrice !== "") next.set("maxPrice", maxPrice);
    if (badge) next.set("badge", badge); if (suitableFor) next.set("suitableFor", suitableFor); if (ingredient) next.set("ingredient", ingredient);
    if (benefit) next.set("benefit", benefit); if (minRating) next.set("minRating", minRating);
    return next;
  }, [search, category, sort, inStock, minPrice, maxPrice, badge, suitableFor, ingredient, benefit, minRating]);
  const queryString = queryParams.toString();
  const query = queryString ? `?${queryString}` : "";

  useEffect(() => {
    const timer = setTimeout(() => setParams(queryParams, { replace: true }), 250);
    return () => clearTimeout(timer);
  }, [queryString]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      apiFetch(`/products${query}`).then((response) => { if (!cancelled) setProducts(response.data || []); }).catch((err) => { if (!cancelled) setError(err.message); }).finally(() => { if (!cancelled) setLoading(false); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    const term = search.trim().toLowerCase();
    if (loading || term.length < 2 || lastTrackedSearch.current === term) return;
    lastTrackedSearch.current = term;
    trackEvent("search", { search_term: term.slice(0, 100), results_count: products.length });
  }, [search, loading, products.length]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) { setSearchIntelligence(null); return undefined; }
    if (loading) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      apiFetch(`/products/search/intelligence?q=${encodeURIComponent(term)}&limit=6&source=shop`)
        .then((response) => { if (!cancelled) setSearchIntelligence(response.data || null); })
        .catch(() => { if (!cancelled) setSearchIntelligence(null); });
    }, 80);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [search, loading, products.length]);

  const activeFacets = useMemo(() => [
    category && "category", suitableFor && "suitableFor", ingredient && "ingredient", benefit && "benefit", minRating && "rating",
    badge && "badge", inStock && "stock", (minPrice !== "" || maxPrice !== "") && "price", search.trim() && "search",
  ].filter(Boolean), [category, suitableFor, ingredient, benefit, minRating, badge, inStock, minPrice, maxPrice, search]);

  useEffect(() => {
    if (loading || !activeFacets.length) return undefined;
    const signature = `${queryString}|${products.length}`;
    if (lastDiscoverySignature.current === signature) return undefined;
    const timer = window.setTimeout(() => {
      lastDiscoverySignature.current = signature;
      recordDiscovery("filter", { facets: activeFacets, resultCount: products.length });
    }, 550);
    return () => window.clearTimeout(timer);
  }, [queryString, loading, products.length, activeFacets.join("|")]);

  const activeFilterCount = [category, inStock, minPrice !== "", maxPrice !== "", badge, suitableFor, ingredient, benefit, minRating].filter(Boolean).length;
  const activeCategory = categories.find((item) => item.slug === category);
  const categoryCountMap = useMemo(() => new Map((facets.categories || []).map((item) => [item.slug, item.count])), [facets.categories]);

  function clearFilters() {
    setCategory(""); setInStock(false); setMinPrice(""); setMaxPrice(""); setBadge(""); setSuitableFor(""); setIngredient(""); setBenefit(""); setMinRating("");
  }
  function resetDiscovery() { setSearch(""); clearFilters(); setSearchIntelligence(null); }
  function applySearchTerm(term) {
    const next = String(term || "").trim();
    if (!next) return;
    trackEvent("search_recovery", { from_term: search.trim().slice(0, 100), to_term: next.slice(0, 100), source: "shop" });
    setSearch(next);
  }
  function applyCollection(collection) {
    setSearch(""); clearFilters();
    if (collection.type === "category") setCategory(collection.value);
    if (collection.type === "ingredient") setIngredient(collection.value);
    if (collection.type === "suitableFor") setSuitableFor(collection.value);
    if (collection.type === "benefit") setBenefit(collection.value);
    recordDiscovery("collection", { facets: [`collection:${collection.type}`] });
  }

  const activeChips = [
    category && { key: "category", label: activeCategory?.name || category, clear: () => setCategory("") },
    suitableFor && { key: "suitable", label: `Suitable for: ${suitableFor}`, clear: () => setSuitableFor("") },
    ingredient && { key: "ingredient", label: `Ingredient: ${ingredient}`, clear: () => setIngredient("") },
    benefit && { key: "benefit", label: `Benefit: ${benefit}`, clear: () => setBenefit("") },
    minRating && { key: "rating", label: `${minRating}★ & up`, clear: () => setMinRating("") },
    badge && { key: "badge", label: badge, clear: () => setBadge("") },
    inStock && { key: "stock", label: "In stock", clear: () => setInStock(false) },
    (minPrice !== "" || maxPrice !== "") && { key: "price", label: `₹${minPrice || facets.price?.min || 0} – ₹${maxPrice || facets.price?.max || "Any"}`, clear: () => { setMinPrice(""); setMaxPrice(""); } },
  ].filter(Boolean);

  return <>
    <Seo title="Shop" description="Shop Riseora Herbals by category, ingredient, catalogue benefit, suitability, approved rating, price and live availability." />
    <div className="container shop-page page-space phase9-shop phase35-shop phase67-shop">
      <div className="shop-title-row"><div><p className="eyebrow">RISEORA STORE · PHASE 67</p><h1>{activeCategory ? activeCategory.name : "Find your ritual"}</h1><p className="muted">Search naturally, explore catalogue-guided collections and compare products before you choose.</p></div></div>
      {activeCategory && <section className="phase18-shop-category-banner"><div className="phase18-shop-category-image">{activeCategory.imageUrl ? <img src={mediaUrl(activeCategory.imageUrl)} alt={activeCategory.name} /> : <span>{activeCategory.name.charAt(0)}</span>}</div><div><small>SHOP CATEGORY</small><strong>{activeCategory.name}</strong><p>{activeCategory.description || `Explore all ${activeCategory.name} products from Riseora.`}</p></div></section>}

      {(facets.collections || []).length > 0 && <section className="phase67-guided-collections">
        <div className="phase67-guided-head"><div><small>DISCOVER BY CATALOGUE</small><strong>Guided collections</strong><p>Fast paths built only from active Riseora product information.</p></div><a href="/ingredients">Ingredient library →</a></div>
        <div className="phase67-collection-grid">{facets.collections.map((item) => <button type="button" key={item.id} onClick={() => applyCollection(item)}><small>{item.kicker}</small><strong>{item.label}</strong><span>{item.description}</span><em>{item.count} {item.count === 1 ? "product" : "products"}</em></button>)}</div>
        <p className="phase67-guidance">{facets.guidance || "Catalogue filters support shopping decisions and do not diagnose conditions or promise treatment outcomes."}</p>
      </section>}

      {facets.suitability?.length > 0 && <section className="phase35-discovery-strip phase67-suitability-strip"><div><small>CATALOGUE FIT</small><strong>Browse by suitable-for information</strong></div><div>{facets.suitability.slice(0, 10).map((item) => <button type="button" key={item.name} className={suitableFor === item.name ? "active" : ""} onClick={() => setSuitableFor((current) => current === item.name ? "" : item.name)}>{item.name}{item.count ? ` · ${item.count}` : ""}</button>)}</div></section>}

      <div className="phase9-shop-toolbar"><div className="shop-search-wrap"><Icon name="search" size={20} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try ‘neem’, ‘face oil’, a benefit, product name or SKU" aria-label="Search products" /></div><button className={activeFilterCount ? "phase9-filter-button active" : "phase9-filter-button"} onClick={() => setFiltersOpen((value) => !value)}><Icon name="tag" size={18} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</button><select className="phase9-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort products"><option value="featured">Best match</option><option value="newest">Newest</option><option value="rating">Top rated</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="name">Name A–Z</option></select></div>
      <div className="filter-chip-row" aria-label="Product categories"><button className={!category ? "filter-chip active" : "filter-chip"} onClick={() => setCategory("")}>All{facets.availability?.total ? ` · ${facets.availability.total}` : ""}</button>{categories.map((item) => <button key={item.id} className={category === item.slug ? "filter-chip active" : "filter-chip"} onClick={() => setCategory(item.slug)}>{item.name}{categoryCountMap.get(item.slug) ? ` · ${categoryCountMap.get(item.slug)}` : ""}</button>)}</div>
      {activeChips.length > 0 && <div className="phase35-active-filters">{activeChips.map((chip) => <button type="button" key={chip.key} onClick={chip.clear}>{chip.label} <Icon name="close" size={12} /></button>)}<button type="button" className="clear" onClick={clearFilters}>Clear all</button></div>}

      {filtersOpen && <><button className="phase15-filter-backdrop" type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters" /><section className="phase9-filter-panel phase15-filter-sheet phase35-filter-sheet phase67-filter-sheet" role="dialog" aria-modal="true" aria-label="Shop filters"><div className="phase15-filter-sheet-head"><div><small>REFINE PRODUCTS</small><strong>Catalogue filters</strong></div><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><Icon name="close" size={20} /></button></div>
        <label>Suitable for<select value={suitableFor} onChange={(e) => setSuitableFor(e.target.value)}><option value="">Any catalogue fit</option>{facets.suitability?.map((item) => <option key={item.name} value={item.name}>{item.name}{item.count ? ` (${item.count})` : ""}</option>)}</select></label>
        <label>Key ingredient<select value={ingredient} onChange={(e) => setIngredient(e.target.value)}><option value="">Any ingredient</option>{facets.ingredients?.map((item) => <option key={item.name} value={item.name}>{item.name}{item.count ? ` (${item.count})` : ""}</option>)}</select></label>
        <label>Catalogue benefit<select value={benefit} onChange={(e) => setBenefit(e.target.value)}><option value="">Any listed benefit</option>{facets.benefits?.map((item) => <option key={item.name} value={item.name}>{item.name}{item.count ? ` (${item.count})` : ""}</option>)}</select></label>
        <label>Approved customer rating<select value={minRating} onChange={(e) => setMinRating(e.target.value)}><option value="">Any rating</option>{facets.ratings?.map((item) => <option key={item.value} value={String(item.value)}>{item.label}{item.count ? ` (${item.count})` : ""}</option>)}</select></label>
        <label>Min price ₹<input type="number" min="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder={String(facets.price?.min || 0)} /></label><label>Max price ₹<input type="number" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder={String(facets.price?.max || 2000)} /></label>
        <label>Merchandising<select value={badge} onChange={(e) => setBadge(e.target.value)}><option value="">All products</option><option value="BEST SELLER">Best seller</option><option value="NEW">New</option><option value="TRENDING">Trending</option></select></label><label className="checkbox-row phase9-stock-check"><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> In stock only ({facets.availability?.inStock ?? 0})</label>
        <p className="phase67-filter-note">Benefit and suitable-for filters reflect catalogue content. Approved rating filters use approved customer reviews only.</p>
        <div className="phase15-filter-sheet-actions"><button className="link-button" onClick={clearFilters}>Clear all</button><button className="button" type="button" onClick={() => setFiltersOpen(false)}>VIEW {products.length} {products.length === 1 ? "PRODUCT" : "PRODUCTS"}</button></div></section></>}

      <div className="shop-result-row"><strong>{loading ? "Finding the best matches…" : `${products.length} ${products.length === 1 ? "product" : "products"}`}</strong>{search.trim() && !loading && <span className="phase35-result-context">for “{search.trim()}”</span>}</div>
      {error && <p className="alert error">{error}</p>}
      {!loading && !error && products.length > 0 && search.trim().length >= 2 && <SmartSearch intelligence={searchIntelligence} query={search} compact onSearch={applySearchTerm} />}
      {!loading && !error && products.length === 0 && <section className="phase54-zero-results">
        <div className="empty-state premium-empty"><span className="empty-icon"><Icon name="search" /></span><h3>No exact matches</h3><p>Riseora can broaden the search, correct a likely spelling or take you back to the full catalogue.</p><div className="phase54-zero-actions"><button className="button button-secondary" onClick={clearFilters}>Clear filters</button><button className="link-button" onClick={resetDiscovery}>View all products</button></div></div>
        <SmartSearch intelligence={searchIntelligence} query={search} onSearch={applySearchTerm} />
        {((searchIntelligence?.products?.length || 0) > 0 || (searchIntelligence?.rescueProducts?.length || 0) > 0) && <div className="phase54-rescue-products"><div><small>{searchIntelligence?.products?.length ? "POSSIBLE MATCHES" : "POPULAR PRODUCTS"}</small><strong>{searchIntelligence?.products?.length ? `Products matching “${searchIntelligence.didYouMean || search.trim()}”` : "Explore these while you refine your search"}</strong></div><div className="product-grid shop-grid">{(searchIntelligence?.products?.length ? searchIntelligence.products : searchIntelligence.rescueProducts).slice(0, 4).map((product) => <ProductCard key={product.id} product={product} compact />)}</div></div>}
      </section>}
      <div className="product-grid shop-grid">{products.map((product) => <ProductCard key={product.id} product={product} compact />)}</div>
    </div>
  </>;
}
