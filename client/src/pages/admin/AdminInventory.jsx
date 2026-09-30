import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/http";
import { Icon } from "../../components/Icons";

export default function AdminInventory() {
  const [variants, setVariants] = useState([]);
  const [search, setSearch] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh(query = "") {
    const response = await apiFetch(`/admin/inventory${query ? `?search=${encodeURIComponent(query)}` : ""}`);
    setVariants(response.data);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  const visible = useMemo(() => variants.filter((v) => !onlyLow || Number(v.stockQuantity) <= Number(v.lowStockThreshold)), [variants, onlyLow]);
  const lowCount = variants.filter((v) => Number(v.stockQuantity) <= Number(v.lowStockThreshold)).length;

  async function save(variant, values) {
    setError(""); setMessage("");
    try {
      await apiFetch(`/admin/inventory/${variant.id}`, { method: "PATCH", body: JSON.stringify(values) });
      setMessage(`${variant.product.name} stock updated.`);
      await refresh(search);
    } catch (e) { setError(e.message); }
  }

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">INVENTORY</p><h1>Stock & pricing</h1><p>Fast stock control for every product variant.</p></div><button className={onlyLow ? "button" : "button button-secondary"} onClick={() => setOnlyLow((v) => !v)}>Low stock {lowCount}</button></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    <section className="admin-panel">
      <form className="admin-search-bar" onSubmit={(e) => { e.preventDefault(); refresh(search).catch((err) => setError(err.message)); }}><Icon name="search" size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product or SKU" /><button>Search</button></form>
      <div className="inventory-list">{visible.map((variant) => <InventoryRow key={variant.id} variant={variant} onSave={save} />)}</div>
      {visible.length === 0 && <div className="admin-empty">No matching variants.</div>}
    </section>
  </>;
}

function InventoryRow({ variant, onSave }) {
  const [stock, setStock] = useState(String(variant.stockQuantity));
  const [threshold, setThreshold] = useState(String(variant.lowStockThreshold));
  const [price, setPrice] = useState(String(Number(variant.sellingPrice)));
  const low = Number(stock) <= Number(threshold);

  useEffect(() => { setStock(String(variant.stockQuantity)); setThreshold(String(variant.lowStockThreshold)); setPrice(String(Number(variant.sellingPrice))); }, [variant]);

  return <article className={low ? "inventory-row low" : "inventory-row"}><div className="inventory-product"><span className="inventory-status-dot" /><div><strong>{variant.product.name}</strong><span>{variant.name} • {variant.sku}</span></div></div><label>Stock<input type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} /></label><label>Low at<input type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label><label>Price ₹<input type="number" min="1" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label><button className="state-toggle active" onClick={() => onSave(variant, { stockQuantity: Number(stock), lowStockThreshold: Number(threshold), sellingPrice: Number(price) })}>Save</button></article>;
}
