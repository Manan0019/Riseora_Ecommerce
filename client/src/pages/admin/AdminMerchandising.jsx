import { useEffect, useMemo, useState } from "react";
import { apiFetch, mediaUrl } from "../../api/http";

function freshForm() {
  return {
    name: "", type: "BUNDLE_DISCOUNT", description: "", badge: "COMBO", imageUrl: "", discountPercent: 10,
    bundleItems: [{ variantId: "", quantity: 1 }, { variantId: "", quantity: 1 }],
    buyVariantId: "", giftVariantId: "", buyQuantity: 1, giftQuantity: 1, minOrderAmount: 999,
    isFeatured: true, priority: 0, startsAt: "", endsAt: "",
  };
}

function toIso(value) { return value ? new Date(value).toISOString() : ""; }
function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function AdminMerchandising() {
  const [products, setProducts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [form, setForm] = useState(freshForm);
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [productResponse, dealResponse] = await Promise.all([apiFetch("/admin/products"), apiFetch("/admin/deals")]);
    setProducts(productResponse.data || []);
    setDeals(dealResponse.data || []);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const variants = useMemo(() => products.flatMap((product) => (product.variants || []).map((variant) => ({ ...variant, product }))), [products]);
  function label(variant) { return `${variant.product.name} • ${variant.name} • ${variant.sku} • ₹${Number(variant.sellingPrice).toFixed(0)} • stock ${variant.stockQuantity}`; }
  function updateBundle(index, field, value) { setForm((current) => ({ ...current, bundleItems: current.bundleItems.map((item, i) => i === index ? { ...item, [field]: field === "quantity" ? Number(value || 1) : value } : item) })); }
  function addBundleRow() { setForm((current) => ({ ...current, bundleItems: [...current.bundleItems, { variantId: "", quantity: 1 }] })); }
  function removeBundleRow(index) { setForm((current) => ({ ...current, bundleItems: current.bundleItems.filter((_, i) => i !== index) })); }

  async function uploadImage(file) {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const body = new FormData(); body.append("image", file);
      const response = await apiFetch("/admin/uploads/campaigns", { method: "POST", body });
      setForm((current) => ({ ...current, imageUrl: response.data.url }));
    } catch (e) { setError(e.message); }
    finally { setUploading(false); }
  }

  function payload() {
    return {
      ...form,
      discountPercent: form.type === "BUNDLE_DISCOUNT" ? Number(form.discountPercent) : undefined,
      bundleItems: form.type === "BUNDLE_DISCOUNT" ? form.bundleItems.filter((item) => item.variantId).map((item) => ({ variantId: item.variantId, quantity: Number(item.quantity || 1) })) : undefined,
      buyVariantId: form.type === "BUY_X_GET_Y" ? form.buyVariantId : "",
      giftVariantId: ["BUY_X_GET_Y", "GIFT_WITH_PURCHASE"].includes(form.type) ? form.giftVariantId : "",
      buyQuantity: Number(form.buyQuantity || 1),
      giftQuantity: Number(form.giftQuantity || 1),
      minOrderAmount: form.type === "GIFT_WITH_PURCHASE" ? Number(form.minOrderAmount || 0) : undefined,
      priority: Number(form.priority || 0),
      startsAt: toIso(form.startsAt),
      endsAt: toIso(form.endsAt),
    };
  }

  async function submit(event) {
    event.preventDefault(); setMessage(""); setError(""); setSaving(true);
    try {
      if (editingId) {
        await apiFetch(`/admin/deals/${editingId}`, { method: "PUT", body: JSON.stringify(payload()) });
        setMessage("Merchandising deal updated.");
      } else {
        await apiFetch("/admin/deals", { method: "POST", body: JSON.stringify(payload()) });
        setMessage("Merchandising deal published.");
      }
      setEditingId(""); setForm(freshForm()); await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  function edit(item) {
    const rawBundle = Array.isArray(item.bundleItems) ? item.bundleItems : [];
    const bundleItems = rawBundle.length ? rawBundle.map((row) => ({ variantId: row.variantId || "", quantity: Number(row.quantity || 1) })) : [{ variantId: "", quantity: 1 }, { variantId: "", quantity: 1 }];
    setForm({
      name: item.name || "", type: item.type || "BUNDLE_DISCOUNT", description: item.description || "", badge: item.badge || "", imageUrl: item.imageUrl || "",
      discountPercent: Number(item.discountPercent || 10), bundleItems,
      buyVariantId: item.buyVariantId || "", giftVariantId: item.giftVariantId || "", buyQuantity: Number(item.buyQuantity || 1), giftQuantity: Number(item.giftQuantity || 1),
      minOrderAmount: Number(item.minOrderAmount || 0), isFeatured: Boolean(item.isFeatured), priority: Number(item.priority || 0),
      startsAt: toLocalInput(item.startsAt), endsAt: toLocalInput(item.endsAt),
    });
    setEditingId(item.id); setMessage(""); setError(""); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() { setEditingId(""); setForm(freshForm()); setError(""); }
  async function patch(item, data) { try { await apiFetch(`/admin/deals/${item.id}`, { method: "PATCH", body: JSON.stringify(data) }); await load(); } catch (e) { setError(e.message); } }
  async function duplicate(item) { try { const response = await apiFetch(`/admin/deals/${item.id}/duplicate`, { method: "POST" }); setMessage(response.message || "Deal duplicated."); await load(); } catch (e) { setError(e.message); } }
  async function remove(item) { if (!window.confirm(`Delete ${item.name}?`)) return; try { await apiFetch(`/admin/deals/${item.id}`, { method: "DELETE" }); if (editingId === item.id) cancelEdit(); await load(); } catch (e) { setError(e.message); } }

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">MERCHANDISING V2</p><h1>Combos & automatic deals</h1><p>Create, edit, duplicate and schedule conversion-focused offers. Checkout still recalculates the single highest-value eligible automatic deal securely.</p></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

    <div className="phase13-merch-grid phase28-merch-grid">
      <form className={editingId ? "admin-panel admin-form phase28-editing-panel" : "admin-panel admin-form"} onSubmit={submit}>
        <div className="admin-panel-head"><div><h2>{editingId ? "Edit deal" : "Create deal"}</h2><p>{editingId ? "Changes update the existing public offer without changing its URL." : "Build a combo, Buy X Get Y or cart-value gift."}</p></div>{editingId && <button type="button" className="state-toggle" onClick={cancelEdit}>Cancel edit</button>}</div>
        <div className="admin-field-grid two"><label>Deal name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Hair Strength Combo" /></label><label>Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="BUNDLE_DISCOUNT">Combo / bundle discount</option><option value="BUY_X_GET_Y">Buy X Get Y</option><option value="GIFT_WITH_PURCHASE">Gift with purchase</option></select></label></div>
        <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Explain the offer in one or two clear lines." /></label>
        <div className="admin-field-grid three"><label>Badge<input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="BEST VALUE" /></label><label>Priority<input type="number" min="0" max="1000" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></label><label className="checkbox-row"><input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} /> Feature on home</label></div>
        <div className="phase13-deal-image"><div>{form.imageUrl ? <img src={mediaUrl(form.imageUrl)} alt="" /> : <span>Offer image</span>}</div><label className={uploading ? "state-toggle disabled" : "state-toggle active"}>{uploading ? "Uploading…" : "Upload image"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => uploadImage(e.target.files?.[0])} /></label><input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="or image URL" /></div>

        {form.type === "BUNDLE_DISCOUNT" && <section className="phase13-rule-box"><div className="editor-section-head"><div><strong>Combo contents</strong><small>Customer must have each required variant in the cart.</small></div><button type="button" className="state-toggle" onClick={addBundleRow}>+ Item</button></div>{form.bundleItems.map((item, index) => <div className="phase13-bundle-row" key={index}><select required value={item.variantId} onChange={(e) => updateBundle(index, "variantId", e.target.value)}><option value="">Select variant</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{label(variant)}</option>)}</select><input type="number" min="1" max="20" value={item.quantity} onChange={(e) => updateBundle(index, "quantity", e.target.value)} /><button type="button" className="mini-danger" disabled={form.bundleItems.length <= 2} onClick={() => removeBundleRow(index)}>×</button></div>)}<label>Automatic combo discount %<input required type="number" min="0.01" max="90" step="0.01" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} /></label></section>}

        {form.type === "BUY_X_GET_Y" && <section className="phase13-rule-box"><div className="admin-field-grid two"><label>Qualifying variant<select required value={form.buyVariantId} onChange={(e) => setForm({ ...form, buyVariantId: e.target.value })}><option value="">Select variant</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{label(variant)}</option>)}</select></label><label>Free variant<select required value={form.giftVariantId} onChange={(e) => setForm({ ...form, giftVariantId: e.target.value })}><option value="">Select free variant</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{label(variant)}</option>)}</select></label></div><div className="admin-field-grid two"><label>Buy quantity<input type="number" min="1" max="20" value={form.buyQuantity} onChange={(e) => setForm({ ...form, buyQuantity: e.target.value })} /></label><label>Free quantity<input type="number" min="1" max="20" value={form.giftQuantity} onChange={(e) => setForm({ ...form, giftQuantity: e.target.value })} /></label></div></section>}

        {form.type === "GIFT_WITH_PURCHASE" && <section className="phase13-rule-box"><label>Free gift variant<select required value={form.giftVariantId} onChange={(e) => setForm({ ...form, giftVariantId: e.target.value })}><option value="">Select gift</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{label(variant)}</option>)}</select></label><label>Minimum merchandise value ₹<input required type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} /></label><label>Gift quantity<input type="number" min="1" max="20" value={form.giftQuantity} onChange={(e) => setForm({ ...form, giftQuantity: e.target.value })} /></label></section>}

        <div className="admin-field-grid two"><label>Starts<input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label><label>Ends<input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label></div>
        <button className="button" disabled={saving}>{saving ? "SAVING…" : editingId ? "SAVE CHANGES" : "PUBLISH DEAL"}</button>
      </form>

      <section className="admin-panel"><div className="admin-panel-head"><div><h2>Merchandising library</h2><p>{deals.length} deal{deals.length === 1 ? "" : "s"} · edit live rules or duplicate a safe inactive draft</p></div></div>{deals.length === 0 ? <div className="admin-empty">No combo or automatic deals yet.</div> : <div className="phase13-deal-list phase28-deal-admin-list">{deals.map((item) => <article key={item.id} className={editingId === item.id ? "phase28-current-edit" : ""}><div className="phase13-deal-list-image">{item.imageUrl ? <img src={mediaUrl(item.imageUrl)} alt="" /> : <span>R</span>}</div><div><span>{item.type.replaceAll("_", " ")}</span><strong>{item.name}</strong><small>{item.type === "BUNDLE_DISCOUNT" ? `${Number(item.discountPercent)}% combo discount` : item.type === "BUY_X_GET_Y" ? `Buy ${item.buyQuantity}, get ${item.giftQuantity}` : `Gift above ₹${Number(item.minOrderAmount || 0).toFixed(0)}`}</small><em>{item.isActive ? "Public when schedule permits" : "Inactive draft"}</em></div><div className="phase13-deal-list-actions phase28-admin-deal-actions"><button className="state-toggle" onClick={() => edit(item)}>Edit</button><button className="state-toggle" onClick={() => duplicate(item)}>Duplicate</button><button className={item.isFeatured ? "state-toggle active" : "state-toggle"} onClick={() => patch(item, { isFeatured: !item.isFeatured })}>{item.isFeatured ? "Featured" : "Not featured"}</button><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => patch(item, { isActive: !item.isActive })}>{item.isActive ? "Active" : "Inactive"}</button><button className="mini-danger" onClick={() => remove(item)}>×</button></div></article>)}</div>}</section>
    </div>
    <p className="admin-help-note"><strong>Checkout authority:</strong> storefront previews are guidance only. Stock, pricing and the final winning automatic deal are always recalculated by the backend before an order can be paid or created.</p>
  </>;
}
