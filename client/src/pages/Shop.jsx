import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/http";
import ProductCard from "../components/ProductCard";

export default function Shop() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/categories").then((response) => setCategories(response.data)).catch(() => {});
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (category) params.set("category", category);
    const value = params.toString();
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
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="container page-space">
      <div className="section-heading"><div><p className="eyebrow">STORE</p><h1>Shop Riseora</h1></div></div>
      <div className="filters">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" />
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
        </select>
      </div>
      {loading && <p>Loading products...</p>}
      {error && <p className="alert error">{error}</p>}
      {!loading && !error && products.length === 0 && <div className="empty-state">No matching products yet.</div>}
      <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </div>
  );
}
