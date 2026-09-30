import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import { Icon } from "../components/Icons";
import ProductCard from "../components/ProductCard";
import Seo from "../components/Seo";

export default function Shop() {
  const [params] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState(params.get("search") || "");
  const [category, setCategory] = useState(params.get("category") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/categories").then((response) => setCategories(response.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setCategory(params.get("category") || "");
    setSearch(params.get("search") || "");
  }, [params]);

  const query = useMemo(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set("search", search.trim());
    if (category) next.set("category", category);
    const value = next.toString();
    return value ? `?${value}` : "";
  }, [search, category]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      apiFetch(`/products${query}`)
        .then((response) => setProducts(response.data))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <>
      <Seo title="Shop" description="Shop Riseora Herbals products, variants and current offers online." />
      <div className="container shop-page page-space">
      <div className="shop-title-row">
        <div><p className="eyebrow">RISEORA STORE</p><h1>Shop herbal care</h1><p className="muted">Browse the complete Riseora catalogue.</p></div>
      </div>

      <div className="shop-search-wrap">
        <Icon name="search" size={20} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" aria-label="Search products" />
      </div>

      <div className="filter-chip-row" aria-label="Product categories">
        <button className={!category ? "filter-chip active" : "filter-chip"} onClick={() => setCategory("")}>All</button>
        {categories.map((item) => <button key={item.id} className={category === item.slug ? "filter-chip active" : "filter-chip"} onClick={() => setCategory(item.slug)}>{item.name}</button>)}
      </div>

      <div className="shop-result-row"><strong>{loading ? "Loading…" : `${products.length} ${products.length === 1 ? "product" : "products"}`}</strong>{category && <button className="link-button muted" onClick={() => setCategory("")}>Clear filter</button>}</div>

      {error && <p className="alert error">{error}</p>}
      {!loading && !error && products.length === 0 && <div className="empty-state premium-empty"><span className="empty-icon"><Icon name="search" /></span><h3>No matching products</h3><p>Try another search or category.</p></div>}
      <div className="product-grid shop-grid">{products.map((product) => <ProductCard key={product.id} product={product} compact />)}</div>
      </div>
    </>
  );
}
