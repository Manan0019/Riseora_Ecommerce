import { useEffect, useState } from "react";
import { apiFetch } from "../../api/http";

const emptyProduct = { categoryId: "", name: "", shortDescription: "", description: "", isFeatured: false, badge: "", imageUrl: "", variantName: "", sku: "", size: "", unit: "ml", mrp: "", sellingPrice: "", stockQuantity: "0" };

export default function AdminCatalog() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [product, setProduct] = useState(emptyProduct);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const [categoryResponse, productResponse] = await Promise.all([apiFetch("/categories"), apiFetch("/admin/products")]);
    setCategories(categoryResponse.data); setProducts(productResponse.data);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function createCategory(event) {
    event.preventDefault(); setError(""); setMessage("");
    try { await apiFetch("/admin/categories", { method: "POST", body: JSON.stringify({ name: categoryName }) }); setCategoryName(""); setMessage("Category created."); await refresh(); } catch (e) { setError(e.message); }
  }
  function updateProduct(event) { const { name, value, type, checked } = event.target; setProduct((current) => ({ ...current, [name]: type === "checkbox" ? checked : value })); }
  async function createProduct(event) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      await apiFetch("/admin/products", { method: "POST", body: JSON.stringify({ categoryId: product.categoryId, name: product.name, shortDescription: product.shortDescription, description: product.description, isFeatured: product.isFeatured, badge: product.badge, images: product.imageUrl ? [{ url: product.imageUrl, isPrimary: true }] : [], variants: [{ name: product.variantName, sku: product.sku, size: product.size, unit: product.unit, mrp: Number(product.mrp), sellingPrice: Number(product.sellingPrice), stockQuantity: Number(product.stockQuantity) }] }) });
      setProduct(emptyProduct); setMessage("Product created."); await refresh();
    } catch (e) { setError(e.message); }
  }
  async function patchProduct(id, data) {
    try { await apiFetch(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }); await refresh(); } catch (e) { setError(e.message); }
  }

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">CATALOG</p><h1>Products & categories</h1><p>Manage what customers see in the Riseora storefront.</p></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    <div className="admin-form-grid">
      <form className="admin-panel admin-form" onSubmit={createCategory}><div className="admin-panel-head"><div><h2>Add category</h2><p>Create a storefront category.</p></div></div><label>Name<input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="e.g. Hair Care" /></label><button className="button">Create category</button></form>
      <form className="admin-panel admin-form product-admin-form" onSubmit={createProduct}>
        <div className="admin-panel-head"><div><h2>Add product</h2><p>Create a product with its first sellable variant.</p></div></div>
        <div className="admin-field-grid two"><label>Category<select required name="categoryId" value={product.categoryId} onChange={updateProduct}><option value="">Select category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Product name<input required name="name" value={product.name} onChange={updateProduct} /></label></div>
        <div className="admin-field-grid two"><label>Badge<input name="badge" value={product.badge} onChange={updateProduct} placeholder="BEST SELLER / NEW" /></label><label>Primary image URL<input type="url" name="imageUrl" value={product.imageUrl} onChange={updateProduct} placeholder="https://..." /></label></div>
        <label>Short description<input name="shortDescription" value={product.shortDescription} onChange={updateProduct} /></label><label>Full description<textarea name="description" value={product.description} onChange={updateProduct} /></label>
        <label className="checkbox-row"><input type="checkbox" name="isFeatured" checked={product.isFeatured} onChange={updateProduct} /> Show in bestseller / featured shelf</label>
        <div className="admin-field-grid two"><label>Variant name<input required name="variantName" value={product.variantName} onChange={updateProduct} placeholder="100 ml" /></label><label>SKU<input required name="sku" value={product.sku} onChange={updateProduct} placeholder="RISE-OIL-100" /></label></div>
        <div className="admin-field-grid three"><label>Size<input name="size" value={product.size} onChange={updateProduct} /></label><label>Unit<input name="unit" value={product.unit} onChange={updateProduct} /></label><label>Stock<input type="number" min="0" name="stockQuantity" value={product.stockQuantity} onChange={updateProduct} /></label></div>
        <div className="admin-field-grid two"><label>MRP<input type="number" min="0" step="0.01" required name="mrp" value={product.mrp} onChange={updateProduct} /></label><label>Selling price<input type="number" min="0" step="0.01" required name="sellingPrice" value={product.sellingPrice} onChange={updateProduct} /></label></div>
        <button className="button">Create product</button>
      </form>
    </div>
    <section className="admin-panel admin-catalog-list"><div className="admin-panel-head"><div><h2>Current catalog</h2><p>{products.length} product{products.length === 1 ? "" : "s"}</p></div></div>{products.length === 0 ? <div className="admin-empty">No products yet.</div> : <div className="admin-product-list">{products.map((item) => { const variant = item.variants?.[0]; return <div key={item.id} className={`admin-product-row ${!item.isActive ? "inactive-row" : ""}`}><div className="admin-product-thumb">{item.images?.[0]?.url ? <img src={item.images[0].url} alt="" /> : "R"}</div><div><strong>{item.name}</strong><span>{item.category?.name} • {variant?.name || "No variant"}{item.badge ? ` • ${item.badge}` : ""}</span><div className="admin-inline-actions"><button className={item.isFeatured ? "state-toggle active" : "state-toggle"} onClick={() => patchProduct(item.id, { isFeatured: !item.isFeatured })}>{item.isFeatured ? "Featured" : "Feature"}</button><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => patchProduct(item.id, { isActive: !item.isActive })}>{item.isActive ? "Active" : "Inactive"}</button></div></div><div className="admin-product-meta"><strong>{variant ? `₹${Number(variant.sellingPrice).toFixed(0)}` : "—"}</strong><span>{variant ? `${variant.stockQuantity} in stock` : ""}</span></div></div>; })}</div>}</section>
  </>;
}
