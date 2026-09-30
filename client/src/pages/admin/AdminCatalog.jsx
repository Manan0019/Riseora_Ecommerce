import { useEffect, useMemo, useState } from "react";
import { apiFetch, mediaUrl } from "../../api/http";
import { Icon } from "../../components/Icons";

const newVariant = () => ({ id: "", name: "", sku: "", size: "", unit: "ml", mrp: "", sellingPrice: "", costPrice: "", stockQuantity: "0", lowStockThreshold: "5", weightGrams: "", hsnCode: "", gstRate: "0", isActive: true });
const emptyProduct = () => ({ id: "", categoryId: "", name: "", shortDescription: "", description: "", isFeatured: false, isActive: true, badge: "", images: [{ url: "", altText: "", isPrimary: true }], variants: [newVariant()] });

export default function AdminCatalog() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [product, setProduct] = useState(emptyProduct());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [uploadingImages, setUploadingImages] = useState(false);
  const editing = Boolean(product.id);

  async function refresh() {
    const [categoryResponse, productResponse] = await Promise.all([apiFetch("/admin/categories"), apiFetch("/admin/products")]);
    setCategories(categoryResponse.data); setProducts(productResponse.data);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function createCategory(event) {
    event.preventDefault(); setError(""); setMessage("");
    try { await apiFetch("/admin/categories", { method: "POST", body: JSON.stringify({ name: categoryName }) }); setCategoryName(""); setMessage("Category created."); await refresh(); } catch (e) { setError(e.message); }
  }

  async function toggleCategory(category) {
    try { await apiFetch(`/admin/categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !category.isActive }) }); await refresh(); }
    catch (e) { setError(e.message); }
  }

  function updateProductField(event) {
    const { name, value, type, checked } = event.target;
    setProduct((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }
  function updateVariant(index, field, value) { setProduct((current) => ({ ...current, variants: current.variants.map((v, i) => i === index ? { ...v, [field]: value } : v) })); }
  function updateImage(index, field, value) { setProduct((current) => ({ ...current, images: current.images.map((v, i) => i === index ? { ...v, [field]: value } : v) })); }
  function addVariant() { setProduct((current) => ({ ...current, variants: [...current.variants, newVariant()] })); }
  function removeVariant(index) { setProduct((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) })); }
  function addImage() { setProduct((current) => ({ ...current, images: [...current.images, { url: "", altText: "", isPrimary: false }] })); }
  function removeImage(index) { setProduct((current) => ({ ...current, images: current.images.filter((_, i) => i !== index) })); }
  function makePrimary(index) { setProduct((current) => ({ ...current, images: current.images.map((image, i) => ({ ...image, isPrimary: i === index })) })); }
  async function uploadImages(files) {
    if (!files?.length) return;
    setError(""); setMessage(""); setUploadingImages(true);
    try {
      const body = new FormData();
      [...files].forEach((file) => body.append("images", file));
      const response = await apiFetch("/admin/uploads/products", { method: "POST", body });
      setProduct((current) => {
        const existing = current.images.filter((image) => image.url.trim());
        const uploaded = response.data.map((file, index) => ({ url: file.url, altText: current.name || file.originalName.replace(/\.[^.]+$/, ""), isPrimary: existing.length === 0 && index === 0 }));
        return { ...current, images: [...existing, ...uploaded] };
      });
      setMessage(`${response.data.length} image${response.data.length === 1 ? "" : "s"} uploaded.`);
    } catch (e) { setError(e.message); } finally { setUploadingImages(false); }
  }

  function editProduct(item) {
    setProduct({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      shortDescription: item.shortDescription || "",
      description: item.description || "",
      isFeatured: item.isFeatured,
      isActive: item.isActive,
      badge: item.badge || "",
      images: item.images?.length ? item.images.map((image) => ({ url: image.url, altText: image.altText || "", isPrimary: image.isPrimary })) : [{ url: "", altText: "", isPrimary: true }],
      variants: item.variants?.length ? item.variants.map((variant) => ({ id: variant.id, name: variant.name, sku: variant.sku, size: variant.size || "", unit: variant.unit || "", mrp: String(Number(variant.mrp)), sellingPrice: String(Number(variant.sellingPrice)), costPrice: variant.costPrice == null ? "" : String(Number(variant.costPrice)), stockQuantity: String(variant.stockQuantity), lowStockThreshold: String(variant.lowStockThreshold), weightGrams: variant.weightGrams == null ? "" : String(Number(variant.weightGrams)), hsnCode: variant.hsnCode || "", gstRate: String(Number(variant.gstRate || 0)), isActive: variant.isActive !== false })) : [newVariant()],
    });
    setMessage(""); setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetProduct() { setProduct(emptyProduct()); }

  async function saveProduct(event) {
    event.preventDefault(); setError(""); setMessage("");
    const cleanImages = product.images.filter((image) => image.url.trim()).map((image, index) => ({ url: image.url.trim(), altText: image.altText.trim(), isPrimary: image.isPrimary || index === 0 }));
    const payload = {
      categoryId: product.categoryId,
      name: product.name,
      shortDescription: product.shortDescription,
      description: product.description,
      isFeatured: product.isFeatured,
      isActive: product.isActive,
      badge: product.badge,
      images: cleanImages,
      variants: product.variants.map((variant) => ({
        ...(variant.id ? { id: variant.id } : {}), name: variant.name, sku: variant.sku, size: variant.size, unit: variant.unit,
        mrp: Number(variant.mrp), sellingPrice: Number(variant.sellingPrice),
        ...(variant.costPrice !== "" ? { costPrice: Number(variant.costPrice) } : {}),
        stockQuantity: Number(variant.stockQuantity), lowStockThreshold: Number(variant.lowStockThreshold), isActive: variant.isActive !== false,
        ...(variant.weightGrams !== "" ? { weightGrams: Number(variant.weightGrams) } : {}),
        hsnCode: variant.hsnCode || "", gstRate: Number(variant.gstRate || 0),
      })),
    };
    try {
      await apiFetch(editing ? `/admin/products/${product.id}` : "/admin/products", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      setMessage(editing ? "Product updated." : "Product created.");
      resetProduct(); await refresh();
    } catch (e) { setError(e.message); }
  }

  async function patchProduct(id, data) {
    try { await apiFetch(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }); await refresh(); }
    catch (e) { setError(e.message); }
  }

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((item) => [item.name, item.category?.name, ...(item.variants || []).map((v) => v.sku)].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)));
  }, [products, search]);

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">CATALOG</p><h1>Products & categories</h1><p>Add products, variants, images, prices and storefront merchandising.</p></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

    <div className="admin-catalog-top-grid">
      <section className="admin-panel category-manager">
        <div className="admin-panel-head"><div><h2>Categories</h2><p>Storefront browsing groups.</p></div></div>
        <form className="category-quick-create" onSubmit={createCategory}><input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="e.g. Hair Care" /><button className="button">Add</button></form>
        <div className="category-admin-list">{categories.map((category) => <div key={category.id}><span><strong>{category.name}</strong><small>{category.isActive ? "Visible" : "Hidden"}</small></span><button className={category.isActive ? "state-toggle active" : "state-toggle"} onClick={() => toggleCategory(category)}>{category.isActive ? "Active" : "Inactive"}</button></div>)}</div>
      </section>

      <form className="admin-panel admin-form product-editor" onSubmit={saveProduct}>
        <div className="admin-panel-head"><div><h2>{editing ? "Edit product" : "Add product"}</h2><p>{editing ? "Update complete product information." : "Create the product and all sellable variants."}</p></div>{editing && <button type="button" className="link-button" onClick={resetProduct}>Cancel edit</button>}</div>
        <div className="admin-field-grid two"><label>Category<select required name="categoryId" value={product.categoryId} onChange={updateProductField}><option value="">Select category</option>{categories.filter((c) => c.isActive || c.id === product.categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Product name<input required name="name" value={product.name} onChange={updateProductField} /></label></div>
        <div className="admin-field-grid two"><label>Badge<input name="badge" value={product.badge} onChange={updateProductField} placeholder="BEST SELLER / NEW / TRENDING" /></label><div className="admin-check-row"><label className="checkbox-row"><input type="checkbox" name="isFeatured" checked={product.isFeatured} onChange={updateProductField} /> Featured</label>{editing && <label className="checkbox-row"><input type="checkbox" name="isActive" checked={product.isActive} onChange={updateProductField} /> Active</label>}</div></div>
        <label>Short description<input name="shortDescription" value={product.shortDescription} onChange={updateProductField} placeholder="Short product card copy" /></label>
        <label>Full description<textarea name="description" value={product.description} onChange={updateProductField} placeholder="Benefits, usage and product story" /></label>

        <div className="editor-section-head"><div><strong>Product images</strong><small>Upload JPG, PNG or WEBP (max 5 MB each), or paste an HTTPS image URL.</small></div><div className="image-editor-actions"><label className={uploadingImages ? "state-toggle disabled" : "state-toggle active"}>{uploadingImages ? "Uploading…" : "Upload images"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={uploadingImages} onChange={(e) => uploadImages(e.target.files)} /></label><button type="button" className="state-toggle" onClick={addImage}>+ URL</button></div></div>
        <div className="admin-image-editor">{product.images.map((image, index) => <div className="admin-image-row phase5-image-row" key={index}>{image.url && <div className="admin-image-preview"><img src={mediaUrl(image.url)} alt="" /></div>}<input type="text" value={image.url} onChange={(e) => updateImage(index, "url", e.target.value)} placeholder="https://... or uploaded image" /><input value={image.altText} onChange={(e) => updateImage(index, "altText", e.target.value)} placeholder="Alt text" /><button type="button" className={image.isPrimary ? "state-toggle active" : "state-toggle"} onClick={() => makePrimary(index)}>{image.isPrimary ? "Primary" : "Make primary"}</button>{product.images.length > 1 && <button type="button" className="mini-danger" onClick={() => removeImage(index)}>×</button>}</div>)}</div>

        <div className="editor-section-head"><div><strong>Variants</strong><small>Each size/pack needs a unique SKU and stock quantity.</small></div><button type="button" className="state-toggle active" onClick={addVariant}>+ Variant</button></div>
        <div className="variant-editor-list">{product.variants.map((variant, index) => <div className="variant-editor-card" key={index}><div className="variant-editor-title"><strong>Variant {index + 1}</strong>{product.variants.length > 1 && <button type="button" onClick={() => removeVariant(index)}>Remove</button>}</div><div className="admin-field-grid three"><label>Name<input required value={variant.name} onChange={(e) => updateVariant(index, "name", e.target.value)} placeholder="100 ml" /></label><label>SKU<input required value={variant.sku} onChange={(e) => updateVariant(index, "sku", e.target.value)} placeholder="RISE-OIL-100" /></label><label>Size<input value={variant.size} onChange={(e) => updateVariant(index, "size", e.target.value)} placeholder="100" /></label></div><div className="admin-field-grid four"><label>Unit<input value={variant.unit} onChange={(e) => updateVariant(index, "unit", e.target.value)} /></label><label>MRP<input required type="number" min="1" step="0.01" value={variant.mrp} onChange={(e) => updateVariant(index, "mrp", e.target.value)} /></label><label>Selling price<input required type="number" min="1" step="0.01" value={variant.sellingPrice} onChange={(e) => updateVariant(index, "sellingPrice", e.target.value)} /></label><label>Cost price<input type="number" min="0" step="0.01" value={variant.costPrice} onChange={(e) => updateVariant(index, "costPrice", e.target.value)} /></label></div><div className="admin-field-grid three"><label>Stock<input type="number" min="0" value={variant.stockQuantity} onChange={(e) => updateVariant(index, "stockQuantity", e.target.value)} /></label><label>Low stock warning<input type="number" min="0" value={variant.lowStockThreshold} onChange={(e) => updateVariant(index, "lowStockThreshold", e.target.value)} /></label><label>Weight grams<input type="number" min="0" step="0.01" value={variant.weightGrams} onChange={(e) => updateVariant(index, "weightGrams", e.target.value)} /></label></div><div className="admin-field-grid two"><label>HSN / SAC code<input value={variant.hsnCode} onChange={(e) => updateVariant(index, "hsnCode", e.target.value)} placeholder="Set with your accountant" /></label><label>GST rate %<input type="number" min="0" max="100" step="0.01" value={variant.gstRate} onChange={(e) => updateVariant(index, "gstRate", e.target.value)} /><small>Used for GST invoice tax split. Confirm the correct rate before production.</small></label></div></div>)}</div>
        <button className="button wide">{editing ? "Save product changes" : "Create product"}</button>
      </form>
    </div>

    <section className="admin-panel catalog-product-list-panel">
      <div className="admin-panel-head"><div><h2>Products</h2><p>{products.length} products in catalog</p></div></div>
      <div className="admin-search-bar catalog-search"><Icon name="search" size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, category or SKU" /></div>
      {visibleProducts.length === 0 ? <div className="admin-empty">No products found.</div> : <div className="admin-product-list">{visibleProducts.map((item) => { const variant = item.variants?.[0]; const image = item.images?.find((i) => i.isPrimary) || item.images?.[0]; return <article className="admin-product-row-v2" key={item.id}><div className="admin-product-thumb">{image?.url ? <img src={mediaUrl(image.url)} alt="" /> : "R"}</div><div className="admin-product-info"><strong>{item.name}</strong><span>{item.category?.name}{item.badge ? ` • ${item.badge}` : ""}</span><small>{item.variants?.length || 0} variant(s) • {variant?.sku || "No SKU"}</small></div><div className="admin-product-pricing"><strong>{variant ? `₹${Number(variant.sellingPrice).toFixed(0)}` : "—"}</strong><span>{item.variants?.reduce((sum, v) => sum + Number(v.stockQuantity), 0) || 0} stock</span></div><div className="admin-inline-actions"><button className="state-toggle" onClick={() => editProduct(item)}>Edit</button><button className={item.isFeatured ? "state-toggle active" : "state-toggle"} onClick={() => patchProduct(item.id, { isFeatured: !item.isFeatured })}>{item.isFeatured ? "Featured" : "Feature"}</button><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => patchProduct(item.id, { isActive: !item.isActive })}>{item.isActive ? "Active" : "Inactive"}</button></div></article>; })}</div>}
    </section>
  </>;
}
