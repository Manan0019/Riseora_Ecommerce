import { useEffect, useState } from "react";
import { apiFetch } from "../api/http";

const emptyProduct = { categoryId: "", name: "", shortDescription: "", description: "", isFeatured: false, imageUrl: "", variantName: "", sku: "", size: "", unit: "ml", mrp: "", sellingPrice: "", stockQuantity: "0" };

export default function Admin() {
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [product, setProduct] = useState(emptyProduct);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const [categoryResponse, orderResponse] = await Promise.all([apiFetch("/categories"), apiFetch("/admin/orders")]);
    setCategories(categoryResponse.data); setOrders(orderResponse.data);
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
      await apiFetch("/admin/products", {
        method: "POST",
        body: JSON.stringify({
          categoryId: product.categoryId,
          name: product.name,
          shortDescription: product.shortDescription,
          description: product.description,
          isFeatured: product.isFeatured,
          images: product.imageUrl ? [{ url: product.imageUrl, isPrimary: true }] : [],
          variants: [{ name: product.variantName, sku: product.sku, size: product.size, unit: product.unit, mrp: Number(product.mrp), sellingPrice: Number(product.sellingPrice), stockQuantity: Number(product.stockQuantity) }],
        }),
      });
      setProduct(emptyProduct); setMessage("Product created.");
    } catch (e) { setError(e.message); }
  }

  async function updateOrder(id, status) {
    try { await apiFetch(`/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await refresh(); } catch (e) { setError(e.message); }
  }

  return <div className="container page-space"><div className="section-heading"><div><p className="eyebrow">ADMIN</p><h1>Store management</h1></div></div>{message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}<div className="admin-grid"><form className="form-card" onSubmit={createCategory}><h2>Add category</h2><label>Name<input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} /></label><button className="button">Create category</button></form><form className="form-card" onSubmit={createProduct}><h2>Add product</h2><label>Category<select required name="categoryId" value={product.categoryId} onChange={updateProduct}><option value="">Select</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Product name<input required name="name" value={product.name} onChange={updateProduct} /></label><label>Short description<input name="shortDescription" value={product.shortDescription} onChange={updateProduct} /></label><label>Full description<textarea name="description" value={product.description} onChange={updateProduct} /></label><label>Image URL<input type="url" name="imageUrl" value={product.imageUrl} onChange={updateProduct} /></label><label className="checkbox-row"><input type="checkbox" name="isFeatured" checked={product.isFeatured} onChange={updateProduct} /> Featured product</label><div className="form-grid two"><label>Variant name<input required name="variantName" value={product.variantName} onChange={updateProduct} placeholder="100 ml" /></label><label>SKU<input required name="sku" value={product.sku} onChange={updateProduct} /></label></div><div className="form-grid three"><label>Size<input name="size" value={product.size} onChange={updateProduct} /></label><label>Unit<input name="unit" value={product.unit} onChange={updateProduct} /></label><label>Stock<input type="number" min="0" name="stockQuantity" value={product.stockQuantity} onChange={updateProduct} /></label></div><div className="form-grid two"><label>MRP<input type="number" min="0" step="0.01" required name="mrp" value={product.mrp} onChange={updateProduct} /></label><label>Selling price<input type="number" min="0" step="0.01" required name="sellingPrice" value={product.sellingPrice} onChange={updateProduct} /></label></div><button className="button">Create product</button></form></div><section className="page-space"><h2>Recent orders</h2>{orders.length === 0 ? <div className="empty-state">No orders yet.</div> : <div className="order-list">{orders.map((order) => <article className="order-card" key={order.id}><div className="order-head"><div><strong>{order.orderNumber}</strong><p>{order.customerName} • {order.customerPhone}</p></div><select value={order.status} onChange={(e) => updateOrder(order.id, e.target.value)}>{["PENDING","CONFIRMED","PROCESSING","SHIPPED","DELIVERED","CANCELLED"].map((status) => <option key={status}>{status}</option>)}</select></div><div className="summary-row total"><span>Total</span><strong>₹{Number(order.totalAmount).toFixed(0)}</strong></div></article>)}</div>}</section></div>;
}
