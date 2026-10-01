import { useEffect, useMemo, useState } from "react";
import { apiFetch, mediaUrl } from "../../api/http";
import { Icon } from "../../components/Icons";
import RichTextEditor from "../../components/RichTextEditor";
import SuitabilityPicker from "../../components/SuitabilityPicker";

const newVariant = () => ({ id: "", erpManaged: false, name: "", sku: "", size: "", unit: "ml", mrp: "", sellingPrice: "", costPrice: "", stockQuantity: "0", lowStockThreshold: "5", weightGrams: "", hsnCode: "", gstRate: "0", isActive: true });
const emptyProduct = () => ({ id: "", erpManaged: false, categoryId: "", name: "", shortDescription: "", description: "", benefits: "", ingredients: "", howToUse: "", suitableFor: "", faq: [{ question: "", answer: "" }], isFeatured: false, isActive: true, badge: "", maxPurchaseQuantity: "", codAllowed: true, images: [{ url: "", altText: "", isPrimary: true }], variants: [newVariant()] });
const emptyCategory = () => ({ id: "", erpManaged: false, name: "", description: "", imageUrl: "", isActive: true, sortOrder: 0 });

export default function AdminCatalog() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [suitabilityOptions, setSuitabilityOptions] = useState([]);
  const [categoryDraft, setCategoryDraft] = useState(emptyCategory());
  const [uploadingCategory, setUploadingCategory] = useState(false);
  const [product, setProduct] = useState(emptyProduct());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [uploadingImages, setUploadingImages] = useState(false);
  const [dragImageIndex, setDragImageIndex] = useState(null);
  const editing = Boolean(product.id);

  async function refresh() {
    const [categoryResponse, productResponse, suitabilityResponse] = await Promise.all([apiFetch("/admin/categories"), apiFetch("/admin/products"), apiFetch("/admin/suitability-options")]);
    setCategories(categoryResponse.data); setProducts(productResponse.data); setSuitabilityOptions(suitabilityResponse.data);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function saveCategory(event) {
    event.preventDefault(); setError(""); setMessage("");
    const payload = categoryDraft.id && categoryDraft.erpManaged ? {
      description: categoryDraft.description,
      imageUrl: categoryDraft.imageUrl,
    } : {
      name: categoryDraft.name,
      description: categoryDraft.description,
      imageUrl: categoryDraft.imageUrl,
      ...(categoryDraft.id ? { isActive: categoryDraft.isActive } : {}),
    };
    try {
      await apiFetch(categoryDraft.id ? `/admin/categories/${categoryDraft.id}` : "/admin/categories", {
        method: categoryDraft.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setMessage(categoryDraft.id ? "Category updated." : "Category created.");
      setCategoryDraft(emptyCategory());
      await refresh();
    } catch (e) { setError(e.message); }
  }

  function editCategory(category) {
    setCategoryDraft({
      id: category.id,
      erpManaged: category.erpManaged === true,
      name: category.name || "",
      description: category.description || "",
      imageUrl: category.imageUrl || "",
      isActive: category.isActive !== false,
      sortOrder: Number(category.sortOrder || 0),
    });
  }

  async function uploadCategoryImage(file) {
    if (!file) return;
    setUploadingCategory(true); setError(""); setMessage("");
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await apiFetch("/admin/uploads/categories", { method: "POST", body });
      setCategoryDraft((current) => ({ ...current, imageUrl: response.data.url }));
      setMessage("Category image uploaded. Save the category to apply it.");
    } catch (e) { setError(e.message); }
    finally { setUploadingCategory(false); }
  }

  async function toggleCategory(category) {
    try { await apiFetch(`/admin/categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !category.isActive }) }); await refresh(); }
    catch (e) { setError(e.message); }
  }

  async function moveCategory(index, direction) {
    const to = index + direction;
    if (to < 0 || to >= categories.length) return;
    const current = categories[index];
    const target = categories[to];
    const currentOrder = Number(current.sortOrder || index * 10);
    const targetOrder = Number(target.sortOrder || to * 10);
    try {
      await Promise.all([
        apiFetch(`/admin/categories/${current.id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: targetOrder }) }),
        apiFetch(`/admin/categories/${target.id}`, { method: "PATCH", body: JSON.stringify({ sortOrder: currentOrder }) }),
      ]);
      await refresh();
    } catch (e) { setError(e.message); }
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
  function moveImage(from, to) {
    if (to < 0 || to >= product.images.length || from === to) return;
    setProduct((current) => {
      const images = [...current.images];
      const [moved] = images.splice(from, 1);
      images.splice(to, 0, moved);
      return { ...current, images };
    });
  }
  function dropImage(to) {
    if (dragImageIndex == null) return;
    moveImage(dragImageIndex, to);
    setDragImageIndex(null);
  }
  function addFaq() { setProduct((current) => ({ ...current, faq: [...current.faq, { question: "", answer: "" }] })); }
  function updateFaq(index, field, value) { setProduct((current) => ({ ...current, faq: current.faq.map((item, i) => i === index ? { ...item, [field]: value } : item) })); }
  function removeFaq(index) { setProduct((current) => ({ ...current, faq: current.faq.filter((_, i) => i !== index) })); }
  function removeImage(index) { setProduct((current) => { const images = current.images.filter((_, i) => i !== index); if (images.length && !images.some((image) => image.isPrimary)) images[0] = { ...images[0], isPrimary: true }; return { ...current, images }; }); }
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
      erpManaged: item.erpManaged === true,
      categoryId: item.categoryId,
      name: item.name,
      shortDescription: item.shortDescription || "",
      description: item.description || "",
      benefits: item.benefits || "",
      ingredients: item.ingredients || "",
      howToUse: item.howToUse || "",
      suitableFor: item.suitableFor || "",
      faq: Array.isArray(item.faq) && item.faq.length ? item.faq.map((faq) => ({ question: faq.question || "", answer: faq.answer || "" })) : [{ question: "", answer: "" }],
      isFeatured: item.isFeatured,
      isActive: item.isActive,
      badge: item.badge || "",
      maxPurchaseQuantity: item.maxPurchaseQuantity == null ? "" : String(item.maxPurchaseQuantity),
      codAllowed: item.codAllowed !== false,
      images: item.images?.length ? item.images.map((image) => ({ url: image.url, altText: image.altText || "", isPrimary: image.isPrimary })) : [{ url: "", altText: "", isPrimary: true }],
      variants: item.variants?.length ? item.variants.map((variant) => ({ id: variant.id, erpManaged: variant.erpManaged === true, name: variant.name, sku: variant.sku, size: variant.size || "", unit: variant.unit || "", mrp: String(Number(variant.mrp)), sellingPrice: String(Number(variant.sellingPrice)), costPrice: variant.costPrice == null ? "" : String(Number(variant.costPrice)), stockQuantity: String(variant.stockQuantity), lowStockThreshold: String(variant.lowStockThreshold), weightGrams: variant.weightGrams == null ? "" : String(Number(variant.weightGrams)), hsnCode: variant.hsnCode || "", gstRate: String(Number(variant.gstRate || 0)), isActive: variant.isActive !== false })) : [newVariant()],
    });
    setMessage(""); setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetProduct() { setProduct(emptyProduct()); }

  async function addSuitabilityOption(name) {
    setError("");
    try {
      const response = await apiFetch("/admin/suitability-options", { method: "POST", body: JSON.stringify({ name }) });
      setSuitabilityOptions((current) => [...current.filter((item) => item.id !== response.data.id), response.data].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.name.localeCompare(b.name)));
      setMessage(`“${response.data.name}” added to Suitable for list.`);
      return response.data;
    } catch (e) { setError(e.message); return null; }
  }

  async function saveProduct(event) {
    event.preventDefault(); setError(""); setMessage("");
    const validImages = product.images.filter((image) => image.url.trim());
    const requestedPrimary = validImages.findIndex((image) => image.isPrimary);
    const primaryIndex = requestedPrimary >= 0 ? requestedPrimary : 0;
    const cleanImages = validImages.map((image, index) => ({ url: image.url.trim(), altText: image.altText.trim(), isPrimary: index === primaryIndex }));
    const payload = {
      categoryId: product.categoryId,
      name: product.name,
      shortDescription: product.shortDescription,
      description: product.description,
      benefits: product.benefits,
      ingredients: product.ingredients,
      howToUse: product.howToUse,
      suitableFor: product.suitableFor,
      faq: product.faq.filter((item) => item.question.trim() && item.answer.trim()).map((item) => ({ question: item.question.trim(), answer: item.answer.trim() })),
      isFeatured: product.isFeatured,
      isActive: product.isActive,
      badge: product.badge,
      maxPurchaseQuantity: product.maxPurchaseQuantity === "" ? null : Number(product.maxPurchaseQuantity),
      codAllowed: product.codAllowed !== false,
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
      <section className="admin-panel category-manager phase18-category-manager">
        <div className="admin-panel-head"><div><h2>Categories</h2><p>Add an image for Hair Care, Skin Care and every storefront category. Reorder them to control the mobile home circles.</p></div>{categoryDraft.id && <button type="button" className="link-button" onClick={() => setCategoryDraft(emptyCategory())}>New category</button>}</div>
        <form className="phase18-category-form" onSubmit={saveCategory}>
          <div className="phase18-category-preview">{categoryDraft.imageUrl ? <img src={mediaUrl(categoryDraft.imageUrl)} alt="" /> : <span>{categoryDraft.name?.charAt(0) || "R"}</span>}</div>
          <div className="phase18-category-fields">
            <input required disabled={categoryDraft.erpManaged} value={categoryDraft.name} onChange={(e) => setCategoryDraft((current) => ({ ...current, name: e.target.value }))} placeholder="e.g. Hair Care" />
            {categoryDraft.erpManaged && <small className="phase25-owned-note">ERP-managed name/status. Website image, description and display order remain editable here.</small>}
            <textarea value={categoryDraft.description} onChange={(e) => setCategoryDraft((current) => ({ ...current, description: e.target.value }))} placeholder="Short category description (optional)" />
            <input value={categoryDraft.imageUrl} onChange={(e) => setCategoryDraft((current) => ({ ...current, imageUrl: e.target.value }))} placeholder="Image URL or upload below" />
            <div className="phase18-category-form-actions">
              <label className={uploadingCategory ? "state-toggle disabled" : "state-toggle active"}>{uploadingCategory ? "Uploading…" : "Upload image"}<input type="file" hidden accept="image/jpeg,image/png,image/webp" disabled={uploadingCategory} onChange={(e) => uploadCategoryImage(e.target.files?.[0])} /></label>
              <button className="button">{categoryDraft.id ? "Save category" : "Create category"}</button>
            </div>
          </div>
        </form>
        <div className="category-admin-list phase18-category-list">{categories.map((category, index) => <div key={category.id}><div className="phase18-category-list-thumb">{category.imageUrl ? <img src={mediaUrl(category.imageUrl)} alt="" /> : <span>{category.name.charAt(0)}</span>}</div><span><strong>{category.name}{category.erpManaged && <em className="phase25-erp-badge">ERP</em>}</strong><small>{category.isActive ? "Visible on store" : "Hidden"}{category.imageUrl ? " • image ready" : " • no image"}</small></span><div className="phase18-category-order"><button type="button" disabled={index === 0} onClick={() => moveCategory(index, -1)}>↑</button><button type="button" disabled={index === categories.length - 1} onClick={() => moveCategory(index, 1)}>↓</button></div><button type="button" className="state-toggle" onClick={() => editCategory(category)}>Edit</button><button type="button" disabled={category.erpManaged} className={category.isActive ? "state-toggle active" : "state-toggle"} onClick={() => toggleCategory(category)}>{category.erpManaged ? "ERP state" : (category.isActive ? "Active" : "Inactive")}</button></div>)}</div>
      </section>

      <form className="admin-panel admin-form product-editor" onSubmit={saveProduct}>
        <div className="admin-panel-head"><div><h2>{editing ? "Edit product" : "Add product"}</h2><p>{editing ? (product.erpManaged ? "ERP owns product identity, availability and operational variant data. Website content and merchandising remain editable." : "Update complete product information.") : "Create the product and all sellable variants."}</p></div>{editing && <button type="button" className="link-button" onClick={resetProduct}>Cancel edit</button>}</div>
        {product.erpManaged && <div className="phase25-owned-banner"><Icon name="refresh" size={18} /><span><strong>Managed by Riseora ERP</strong><small>Name, category, active state, SKU, price, stock, HSN/GST and pack details are read-only here and refresh from ERP.</small></span></div>}
        <div className="admin-field-grid two"><label>Category<select required disabled={product.erpManaged} name="categoryId" value={product.categoryId} onChange={updateProductField}><option value="">Select category</option>{categories.filter((c) => c.isActive || c.id === product.categoryId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Product name<input required disabled={product.erpManaged} name="name" value={product.name} onChange={updateProductField} /></label></div>
        <div className="admin-field-grid two"><label>Badge<input name="badge" value={product.badge} onChange={updateProductField} placeholder="BEST SELLER / NEW / TRENDING" /></label><div className="admin-check-row"><label className="checkbox-row"><input type="checkbox" name="isFeatured" checked={product.isFeatured} onChange={updateProductField} /> Featured</label>{editing && <label className="checkbox-row"><input type="checkbox" disabled={product.erpManaged} name="isActive" checked={product.isActive} onChange={updateProductField} /> {product.erpManaged ? "Active (ERP)" : "Active"}</label>}</div></div>
        <div className="phase18-purchase-limit-card"><label className="checkbox-row"><input type="checkbox" checked={product.maxPurchaseQuantity !== ""} onChange={(e) => setProduct((current) => ({ ...current, maxPurchaseQuantity: e.target.checked ? (current.maxPurchaseQuantity || "5") : "" }))} /> Limit how many units of this product a customer can place in one order</label>{product.maxPurchaseQuantity !== "" && <label>Maximum units per order<input type="number" min="1" max="10000" value={product.maxPurchaseQuantity} onChange={(e) => setProduct((current) => ({ ...current, maxPurchaseQuantity: e.target.value }))} /><small>The backend enforces this across all sizes/variants of the same product. Leave the option off for no product-specific limit.</small></label>}</div>
        <div className={product.codAllowed !== false ? "phase20-payment-rule-card" : "phase20-payment-rule-card prepaid"}><label className="checkbox-row"><input type="checkbox" checked={product.codAllowed !== false} onChange={(e) => setProduct((current) => ({ ...current, codAllowed: e.target.checked }))} /> Allow Cash on Delivery for this product</label><small>{product.codAllowed !== false ? "Customers can use COD when the rest of the order also passes store COD rules." : "Prepaid only: any cart containing this product must use online payment."}</small></div>
        <label>Short description<input name="shortDescription" value={product.shortDescription} onChange={updateProductField} placeholder="Short product card copy" /></label>
        <div className="phase19-editor-field"><label>Full description</label><RichTextEditor value={product.description} onChange={(value) => setProduct((current) => ({ ...current, description: value }))} placeholder="Product story, paragraphs, bullets and formatted content…" /></div>
        <div className="admin-field-grid two phase9-content-grid phase19-content-editor-grid"><div className="phase19-editor-field"><label>Key benefits</label><RichTextEditor compact value={product.benefits} onChange={(value) => setProduct((current) => ({ ...current, benefits: value }))} placeholder="Add benefits as bullets or formatted text" /></div><div className="phase19-editor-field"><label>Suitable for</label><SuitabilityPicker value={product.suitableFor} options={suitabilityOptions} onChange={(value) => setProduct((current) => ({ ...current, suitableFor: value }))} onAddOption={addSuitabilityOption} /></div></div>
        <div className="admin-field-grid two phase9-content-grid phase19-content-editor-grid"><div className="phase19-editor-field"><label>Ingredients</label><RichTextEditor compact value={product.ingredients} onChange={(value) => setProduct((current) => ({ ...current, ingredients: value }))} placeholder="Ingredients, key actives, bullet list…" /></div><div className="phase19-editor-field"><label>How to use</label><RichTextEditor compact value={product.howToUse} onChange={(value) => setProduct((current) => ({ ...current, howToUse: value }))} placeholder="Steps, bullets and usage instructions…" /></div></div>
        <div className="editor-section-head"><div><strong>Product FAQ</strong><small>Shown as collapsible questions on the product page.</small></div><button type="button" className="state-toggle active" onClick={addFaq}>+ FAQ</button></div>
        <div className="phase9-faq-editor">{product.faq.map((item, index) => <div className="phase9-faq-row" key={index}><input value={item.question} onChange={(e) => updateFaq(index, "question", e.target.value)} placeholder="Question" /><RichTextEditor compact value={item.answer} onChange={(value) => updateFaq(index, "answer", value)} placeholder="Answer with bullets or formatted text" />{product.faq.length > 1 && <button type="button" className="mini-danger" onClick={() => removeFaq(index)}>×</button>}</div>)}</div>

        <div className="editor-section-head"><div><strong>Product images</strong><small>Upload multiple JPG, PNG or WEBP images. Drag or use arrows to set the storefront/hover slideshow order. The primary image is shown first.</small></div><div className="image-editor-actions"><label className={uploadingImages ? "state-toggle disabled" : "state-toggle active"}>{uploadingImages ? "Uploading…" : "Upload images"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={uploadingImages} onChange={(e) => uploadImages(e.target.files)} /></label><button type="button" className="state-toggle" onClick={addImage}>+ URL</button></div></div>
        <div className="admin-image-editor">{product.images.map((image, index) => <div className={`admin-image-row phase5-image-row phase12-sortable-image ${dragImageIndex === index ? "dragging" : ""}`} key={`${image.url || "blank"}-${index}`} draggable onDragStart={() => setDragImageIndex(index)} onDragEnd={() => setDragImageIndex(null)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropImage(index)}><div className="phase12-image-order"><span className="phase12-drag-handle" title="Drag to reorder">⋮⋮</span><b>{index + 1}</b><button type="button" disabled={index === 0} onClick={() => moveImage(index, index - 1)} aria-label="Move image earlier">↑</button><button type="button" disabled={index === product.images.length - 1} onClick={() => moveImage(index, index + 1)} aria-label="Move image later">↓</button></div>{image.url && <div className="admin-image-preview"><img src={mediaUrl(image.url)} alt="" /></div>}<input type="text" value={image.url} onChange={(e) => updateImage(index, "url", e.target.value)} placeholder="https://... or uploaded image" /><input value={image.altText} onChange={(e) => updateImage(index, "altText", e.target.value)} placeholder="Alt text" /><button type="button" className={image.isPrimary ? "state-toggle active" : "state-toggle"} onClick={() => makePrimary(index)}>{image.isPrimary ? "Primary" : "Make primary"}</button>{product.images.length > 1 && <button type="button" className="mini-danger" onClick={() => removeImage(index)}>×</button>}</div>)}</div>

        <div className="editor-section-head"><div><strong>Variants</strong><small>ERP-managed variants keep operational fields read-only. You can still change the website low-stock alert or add a website-only variant.</small></div><button type="button" className="state-toggle active" onClick={addVariant}>+ Variant</button></div>
        <div className="variant-editor-list">{product.variants.map((variant, index) => <div className="variant-editor-card" key={index}><div className="variant-editor-title"><strong>Variant {index + 1}{variant.erpManaged && <em className="phase25-erp-badge">ERP</em>}</strong>{product.variants.length > 1 && !variant.erpManaged && <button type="button" onClick={() => removeVariant(index)}>Remove</button>}</div><div className="admin-field-grid three"><label>Name<input required disabled={variant.erpManaged} value={variant.name} onChange={(e) => updateVariant(index, "name", e.target.value)} placeholder="100 ml" /></label><label>SKU<input required disabled={variant.erpManaged} value={variant.sku} onChange={(e) => updateVariant(index, "sku", e.target.value)} placeholder="RISE-OIL-100" /></label><label>Size<input disabled={variant.erpManaged} value={variant.size} onChange={(e) => updateVariant(index, "size", e.target.value)} placeholder="100" /></label></div><div className="admin-field-grid four"><label>Unit<input disabled={variant.erpManaged} value={variant.unit} onChange={(e) => updateVariant(index, "unit", e.target.value)} /></label><label>MRP<input required disabled={variant.erpManaged} type="number" min="1" step="0.01" value={variant.mrp} onChange={(e) => updateVariant(index, "mrp", e.target.value)} /></label><label>Selling price<input required disabled={variant.erpManaged} type="number" min="1" step="0.01" value={variant.sellingPrice} onChange={(e) => updateVariant(index, "sellingPrice", e.target.value)} /></label><label>Cost price<input disabled={variant.erpManaged} type="number" min="0" step="0.01" value={variant.costPrice} onChange={(e) => updateVariant(index, "costPrice", e.target.value)} /></label></div><div className="admin-field-grid three"><label>Stock<input disabled={variant.erpManaged} type="number" min="0" value={variant.stockQuantity} onChange={(e) => updateVariant(index, "stockQuantity", e.target.value)} /></label><label>Low stock warning<input type="number" min="0" value={variant.lowStockThreshold} onChange={(e) => updateVariant(index, "lowStockThreshold", e.target.value)} /></label><label>Weight grams<input disabled={variant.erpManaged} type="number" min="0" step="0.01" value={variant.weightGrams} onChange={(e) => updateVariant(index, "weightGrams", e.target.value)} /></label></div><div className="admin-field-grid two"><label>HSN / SAC code<input disabled={variant.erpManaged} value={variant.hsnCode} onChange={(e) => updateVariant(index, "hsnCode", e.target.value)} placeholder="Set with your accountant" /></label><label>GST rate %<input disabled={variant.erpManaged} type="number" min="0" max="100" step="0.01" value={variant.gstRate} onChange={(e) => updateVariant(index, "gstRate", e.target.value)} /><small>Used for GST invoice tax split. Confirm the correct rate before production.</small></label></div></div>)}</div>
        <button className="button wide">{editing ? "Save product changes" : "Create product"}</button>
      </form>
    </div>

    <section className="admin-panel catalog-product-list-panel">
      <div className="admin-panel-head"><div><h2>Products</h2><p>{products.length} products in catalog</p></div></div>
      <div className="admin-search-bar catalog-search"><Icon name="search" size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, category or SKU" /></div>
      {visibleProducts.length === 0 ? <div className="admin-empty">No products found.</div> : <div className="admin-product-list">{visibleProducts.map((item) => { const variant = item.variants?.[0]; const image = item.images?.find((i) => i.isPrimary) || item.images?.[0]; return <article className="admin-product-row-v2" key={item.id}><div className="admin-product-thumb">{image?.url ? <img src={mediaUrl(image.url)} alt="" /> : "R"}</div><div className="admin-product-info"><strong>{item.name}{item.erpManaged && <em className="phase25-erp-badge">ERP</em>}</strong><span>{item.category?.name}{item.badge ? ` • ${item.badge}` : ""}</span><small>{item.variants?.length || 0} variant(s) • {variant?.sku || "No SKU"}{item.maxPurchaseQuantity ? ` • max ${item.maxPurchaseQuantity}/order` : ""}{item.codAllowed === false ? " • prepaid only" : ""}</small></div><div className="admin-product-pricing"><strong>{variant ? `₹${Number(variant.sellingPrice).toFixed(0)}` : "—"}</strong><span>{item.variants?.reduce((sum, v) => sum + Number(v.stockQuantity), 0) || 0} stock</span></div><div className="admin-inline-actions"><button className="state-toggle" onClick={() => editProduct(item)}>Edit</button><button className={item.isFeatured ? "state-toggle active" : "state-toggle"} onClick={() => patchProduct(item.id, { isFeatured: !item.isFeatured })}>{item.isFeatured ? "Featured" : "Feature"}</button><button disabled={item.erpManaged} className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => patchProduct(item.id, { isActive: !item.isActive })}>{item.erpManaged ? "ERP state" : (item.isActive ? "Active" : "Inactive")}</button></div></article>; })}</div>}
    </section>
  </>;
}
