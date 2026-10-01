import { useEffect, useState } from "react";
import { apiFetch, mediaUrl } from "../../api/http";

const emptyPartner = { name: "", code: "", trackingUrlTemplate: "", sortOrder: 0 };
const emptyZone = { name: "", postalPrefixes: "", city: "", state: "", shippingFee: "", freeShippingThreshold: "", codAllowed: true, deliveryMinDays: "", deliveryMaxDays: "", priority: 0, isActive: true };

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [partners, setPartners] = useState([]);
  const [partner, setPartner] = useState(emptyPartner);
  const [zones, setZones] = useState([]);
  const [zone, setZone] = useState(emptyZone);
  const [editingZoneId, setEditingZoneId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploadingBrand, setUploadingBrand] = useState("");

  async function load() {
    const [settingResponse, partnerResponse, zoneResponse] = await Promise.all([apiFetch("/admin/settings"), apiFetch("/admin/shipping-partners"), apiFetch("/admin/shipping-zones")]);
    const value = settingResponse.data;
    setSettings({ ...value, freeShippingThreshold: value.freeShippingThreshold == null ? "" : String(Number(value.freeShippingThreshold)), flatShippingFee: String(Number(value.flatShippingFee || 0)), codFee: String(Number(value.codFee || 0)), codMinOrderAmount: value.codMinOrderAmount == null ? "" : String(Number(value.codMinOrderAmount)), codMaxOrderAmount: value.codMaxOrderAmount == null ? "" : String(Number(value.codMaxOrderAmount)), maxOpenCodOrdersPerCustomer: value.maxOpenCodOrdersPerCustomer == null ? "" : String(value.maxOpenCodOrdersPerCustomer), dispatchWithinDays: String(value.dispatchWithinDays ?? 2), deliveryMinDays: String(value.deliveryMinDays ?? 3), deliveryMaxDays: String(value.deliveryMaxDays ?? 7), lowStockUrgencyThreshold: String(value.lowStockUrgencyThreshold ?? 5), returnWindowDays: String(value.returnWindowDays ?? 7) });
    setPartners(partnerResponse.data);
    setZones(zoneResponse.data || []);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  function update(event) {
    const { name, value, type, checked } = event.target;
    setSettings((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function uploadBrand(file, field) {
    if (!file) return;
    setError(""); setMessage(""); setUploadingBrand(field);
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await apiFetch("/admin/uploads/brand", { method: "POST", body });
      setSettings((current) => ({ ...current, [field]: response.data.url }));
      setMessage(field === "logoUrl" ? "Logo uploaded. Save store settings to publish it." : "Logo mark uploaded. Save store settings to publish it.");
    } catch (e) { setError(e.message); }
    finally { setUploadingBrand(""); }
  }

  async function save(event) {
    event.preventDefault(); setMessage(""); setError("");
    try {
      const payload = {
        ...settings,
        supportEmail: settings.supportEmail?.trim() || null,
        supportPhone: settings.supportPhone?.trim() || null,
        legalName: settings.legalName?.trim() || null, gstin: settings.gstin?.trim() || null,
        addressLine1: settings.addressLine1?.trim() || null, addressLine2: settings.addressLine2?.trim() || null,
        city: settings.city?.trim() || null, state: settings.state?.trim() || null, postalCode: settings.postalCode?.trim() || null,
        returnPolicy: settings.returnPolicy?.trim() || null, shippingPolicy: settings.shippingPolicy?.trim() || null, privacyPolicy: settings.privacyPolicy?.trim() || null, termsPolicy: settings.termsPolicy?.trim() || null,
        brandTagline: settings.brandTagline?.trim() || null,
        logoUrl: settings.logoUrl?.trim() || null,
        logoMarkUrl: settings.logoMarkUrl?.trim() || null,
        logoAlt: settings.logoAlt?.trim() || null,
        announcementText: settings.announcementText?.trim() || null, announcementSecondary: settings.announcementSecondary?.trim() || null,
        siteUrl: settings.siteUrl?.trim() || null, seoTitle: settings.seoTitle?.trim() || null, seoDescription: settings.seoDescription?.trim() || null,
        aboutTitle: settings.aboutTitle?.trim() || null, aboutBody: settings.aboutBody?.trim() || null, contactIntro: settings.contactIntro?.trim() || null,
        instagramUrl: settings.instagramUrl?.trim() || null, facebookUrl: settings.facebookUrl?.trim() || null, youtubeUrl: settings.youtubeUrl?.trim() || null, whatsappNumber: settings.whatsappNumber?.trim() || null,
        freeShippingThreshold: settings.freeShippingThreshold === "" ? null : Number(settings.freeShippingThreshold),
        flatShippingFee: Number(settings.flatShippingFee || 0), codFee: Number(settings.codFee || 0), codEnabled: settings.codEnabled !== false, codMinOrderAmount: settings.codMinOrderAmount === "" ? null : Number(settings.codMinOrderAmount), codMaxOrderAmount: settings.codMaxOrderAmount === "" ? null : Number(settings.codMaxOrderAmount), maxOpenCodOrdersPerCustomer: settings.maxOpenCodOrdersPerCustomer === "" ? null : Number(settings.maxOpenCodOrdersPerCustomer), dispatchWithinDays: Number(settings.dispatchWithinDays || 0), deliveryMinDays: Number(settings.deliveryMinDays || 1), deliveryMaxDays: Math.max(Number(settings.deliveryMinDays || 1), Number(settings.deliveryMaxDays || 1)), lowStockUrgencyThreshold: Number(settings.lowStockUrgencyThreshold || 5), returnWindowDays: Number(settings.returnWindowDays || 0),
      };
      delete payload.id; delete payload.invoiceNextNumber; delete payload.createdAt; delete payload.updatedAt;
      await apiFetch("/admin/settings", { method: "PATCH", body: JSON.stringify(payload) });
      setMessage("Store settings saved."); await load();
    } catch (e) { setError(e.message); }
  }

  async function addPartner(event) {
    event.preventDefault(); setMessage(""); setError("");
    try { await apiFetch("/admin/shipping-partners", { method: "POST", body: JSON.stringify({ ...partner, sortOrder: Number(partner.sortOrder || 0) }) }); setPartner(emptyPartner); setMessage("Courier partner added."); await load(); } catch (e) { setError(e.message); }
  }

  async function togglePartner(item) {
    try { await apiFetch(`/admin/shipping-partners/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !item.isActive }) }); await load(); } catch (e) { setError(e.message); }
  }

  function zonePayload() {
    const prefixes = [...new Set(String(zone.postalPrefixes || "").split(/[\s,;]+/).map((item) => item.replace(/\D/g, "").slice(0, 6)).filter((item) => item.length >= 2))];
    return {
      name: zone.name.trim(), postalPrefixes: prefixes, city: zone.city.trim() || null, state: zone.state.trim() || null,
      shippingFee: zone.shippingFee === "" ? null : Number(zone.shippingFee),
      freeShippingThreshold: zone.freeShippingThreshold === "" ? null : Number(zone.freeShippingThreshold),
      codAllowed: zone.codAllowed !== false,
      deliveryMinDays: zone.deliveryMinDays === "" ? null : Number(zone.deliveryMinDays),
      deliveryMaxDays: zone.deliveryMaxDays === "" ? null : Number(zone.deliveryMaxDays),
      priority: Number(zone.priority || 0), isActive: zone.isActive !== false,
    };
  }

  function editZone(item) {
    setEditingZoneId(item.id);
    setZone({
      name: item.name || "", postalPrefixes: Array.isArray(item.postalPrefixes) ? item.postalPrefixes.join(", ") : "", city: item.city || "", state: item.state || "",
      shippingFee: item.shippingFee == null ? "" : String(Number(item.shippingFee)), freeShippingThreshold: item.freeShippingThreshold == null ? "" : String(Number(item.freeShippingThreshold)),
      codAllowed: item.codAllowed !== false, deliveryMinDays: item.deliveryMinDays == null ? "" : String(item.deliveryMinDays), deliveryMaxDays: item.deliveryMaxDays == null ? "" : String(item.deliveryMaxDays),
      priority: item.priority || 0, isActive: item.isActive !== false,
    });
    document.getElementById("delivery-zone-editor")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function saveZone(event) {
    event.preventDefault(); setMessage(""); setError("");
    try {
      const payload = zonePayload();
      if (!payload.postalPrefixes.length) throw new Error("Add at least one PIN prefix between 2 and 6 digits.");
      await apiFetch(editingZoneId ? `/admin/shipping-zones/${editingZoneId}` : "/admin/shipping-zones", { method: editingZoneId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setMessage(editingZoneId ? "Delivery zone updated." : "Delivery zone added."); setEditingZoneId(""); setZone(emptyZone); await load();
    } catch (e) { setError(e.message); }
  }

  async function toggleZone(item) {
    try { await apiFetch(`/admin/shipping-zones/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !item.isActive }) }); await load(); } catch (e) { setError(e.message); }
  }

  async function removeZone(item) {
    if (!window.confirm(`Delete delivery zone “${item.name}”? Existing orders keep their saved delivery snapshot.`)) return;
    try { await apiFetch(`/admin/shipping-zones/${item.id}`, { method: "DELETE" }); if (editingZoneId === item.id) { setEditingZoneId(""); setZone(emptyZone); } setMessage("Delivery zone deleted."); await load(); } catch (e) { setError(e.message); }
  }

  async function exportDispatch(status) {
    setError("");
    try {
      const response = await apiFetch(`/admin/dispatch?status=${status}`);
      const rows = response.data;
      if (!rows.length) return setMessage(`No ${status.toLowerCase()} orders to export.`);
      const keys = ["orderNumber","customerName","customerPhone","customerEmail","addressLine1","addressLine2","landmark","city","state","postalCode","country","shippingZoneName","paymentMethod","codAmount","totalAmount","totalWeightGrams","skuSummary"];
      const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `riseora-${status.toLowerCase()}-dispatch.csv`; anchor.click(); URL.revokeObjectURL(url);
      setMessage(`${rows.length} dispatch row(s) exported.`);
    } catch (e) { setError(e.message); }
  }

  if (!settings) return <div className="admin-panel"><div className="skeleton-card tall" /></div>;

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">STORE CONTROL</p><h1>Settings, shipping & tax</h1><p>Business identity, shipping fees, return policy, GST invoice setup and courier tools.</p></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

    <form className="admin-panel admin-form settings-form" onSubmit={save}>
      <div className="admin-panel-head"><div><h2>Business & invoice identity</h2><p>These details are used on customer documents and tax invoices.</p></div></div>
      <div className="admin-field-grid two"><label>Store name<input name="storeName" value={settings.storeName || ""} onChange={update} /></label><label>Legal business name<input name="legalName" value={settings.legalName || ""} onChange={update} /></label></div>
      <div className="admin-field-grid three"><label>Support email<input type="email" name="supportEmail" value={settings.supportEmail || ""} onChange={update} /></label><label>Support phone<input name="supportPhone" value={settings.supportPhone || ""} onChange={update} /></label><label>GSTIN<input name="gstin" value={settings.gstin || ""} onChange={update} placeholder="Confirm with owner/accountant" /></label></div>
      <div className="admin-field-grid two"><label>Address line 1<input name="addressLine1" value={settings.addressLine1 || ""} onChange={update} /></label><label>Address line 2<input name="addressLine2" value={settings.addressLine2 || ""} onChange={update} /></label></div>
      <div className="admin-field-grid four"><label>City<input name="city" value={settings.city || ""} onChange={update} /></label><label>State<input name="state" value={settings.state || ""} onChange={update} /></label><label>PIN code<input name="postalCode" value={settings.postalCode || ""} onChange={update} /></label><label>Invoice prefix<input name="invoicePrefix" value={settings.invoicePrefix || ""} onChange={update} /></label></div>

      <div className="editor-section-head"><div><strong>Shipping & returns</strong><small>Checkout uses these values server-side.</small></div></div>
      <div className="admin-field-grid four"><label>Free shipping above ₹<input type="number" min="0" step="0.01" name="freeShippingThreshold" value={settings.freeShippingThreshold} onChange={update} placeholder="Blank = never automatic" /></label><label>Flat shipping fee ₹<input type="number" min="0" step="0.01" name="flatShippingFee" value={settings.flatShippingFee} onChange={update} /></label><label>COD fee ₹<input type="number" min="0" step="0.01" name="codFee" value={settings.codFee} onChange={update} /></label><label>Return window days<input type="number" min="0" max="90" name="returnWindowDays" value={settings.returnWindowDays} onChange={update} /></label></div>
      <div className="phase20-cod-settings"><div className="editor-section-head"><div><strong>Cash on Delivery safeguards</strong><small>Optional seller-protection rules. Online payment remains available when COD is blocked.</small></div><label className="checkbox-row"><input type="checkbox" name="codEnabled" checked={settings.codEnabled !== false} onChange={update} /> Enable COD</label></div><div className="admin-field-grid three"><label>COD minimum merchandise ₹<input type="number" min="0" step="0.01" name="codMinOrderAmount" value={settings.codMinOrderAmount} onChange={update} placeholder="Blank = no minimum" /></label><label>COD maximum merchandise ₹<input type="number" min="0" step="0.01" name="codMaxOrderAmount" value={settings.codMaxOrderAmount} onChange={update} placeholder="Blank = no maximum" /></label><label>Max active COD orders/customer<input type="number" min="1" max="100" name="maxOpenCodOrdersPerCustomer" value={settings.maxOpenCodOrdersPerCustomer} onChange={update} placeholder="Blank = unlimited" /><small>Counts pending, confirmed, processing and shipped COD orders for the same account/email/phone.</small></label></div><p className="admin-help-note">Recommended starting point: keep the amount fields blank until you decide a policy, then consider 1–2 active COD orders per customer. These rules are enforced by the API, not only the browser.</p></div>
      <div className="admin-field-grid four phase17-delivery-settings"><label>Dispatch within days<input type="number" min="0" max="30" name="dispatchWithinDays" value={settings.dispatchWithinDays} onChange={update} /></label><label>Delivery minimum days<input type="number" min="1" max="45" name="deliveryMinDays" value={settings.deliveryMinDays} onChange={update} /></label><label>Delivery maximum days<input type="number" min="1" max="60" name="deliveryMaxDays" value={settings.deliveryMaxDays} onChange={update} /></label><label>Low-stock urgency at ≤<input type="number" min="1" max="100" name="lowStockUrgencyThreshold" value={settings.lowStockUrgencyThreshold} onChange={update} /></label></div>
      <p className="admin-help-note phase17-delivery-note">Delivery days are the fallback estimate. Phase 21 delivery zones can override ETA, shipping and COD for matching PIN codes.</p>
      <label className="checkbox-row phase21-strict-serviceability"><input type="checkbox" name="requireServiceablePostalCode" checked={Boolean(settings.requireServiceablePostalCode)} onChange={update} /> <span><strong>Require a configured delivery zone for checkout</strong><small>OFF = unmatched PIN codes use store-wide shipping rules. ON = checkout is allowed only when a PIN matches an active zone. Keep this OFF until your zone list is complete.</small></span></label>
      <label className="checkbox-row"><input type="checkbox" name="returnsEnabled" checked={Boolean(settings.returnsEnabled)} onChange={update} /> Allow customer return requests</label>
      <div className="admin-field-grid two"><label>Shipping policy<textarea name="shippingPolicy" value={settings.shippingPolicy || ""} onChange={update} /></label><label>Return policy<textarea name="returnPolicy" value={settings.returnPolicy || ""} onChange={update} /></label></div>
      <div className="admin-field-grid two"><label>Privacy policy<textarea name="privacyPolicy" value={settings.privacyPolicy || ""} onChange={update} /></label><label>Terms & conditions<textarea name="termsPolicy" value={settings.termsPolicy || ""} onChange={update} /></label></div>
      <div className="editor-section-head"><div><strong>Storefront, SEO & social</strong><small>Used by mobile navigation, search previews and customer pages.</small></div></div>
      <section className="phase12-brand-settings">
        <div className="phase12-brand-upload-card">
          <div className="phase12-brand-preview full"><img src={settings.logoUrl ? mediaUrl(settings.logoUrl) : "/brand/riseora-logo-Horizontal.png"} alt={settings.logoAlt || "Riseora logo"} onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>
          <div><strong>Horizontal logo</strong><small>Used in the navbar, footer and invoices. If blank, Riseora uses client/src/assets/riseora-logo-Horizontal.png.</small></div>
          <label className={uploadingBrand === "logoUrl" ? "state-toggle disabled" : "state-toggle active"}>{uploadingBrand === "logoUrl" ? "Uploading…" : "Upload logo"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploadingBrand)} onChange={(e) => uploadBrand(e.target.files?.[0], "logoUrl")} /></label>
        </div>
        <div className="phase12-brand-upload-card">
          <div className="phase12-brand-preview mark"><img src={settings.logoMarkUrl ? mediaUrl(settings.logoMarkUrl) : "/brand/riseora-Logo-Vertical.png"} alt="Riseora vertical logo" onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>
          <div><strong>Vertical logo / compact mark</strong><small>Used on login, loading and compact admin spaces. If blank, Riseora uses client/src/assets/riseora-Logo-Vertical.png.</small></div>
          <label className={uploadingBrand === "logoMarkUrl" ? "state-toggle disabled" : "state-toggle active"}>{uploadingBrand === "logoMarkUrl" ? "Uploading…" : "Upload vertical logo"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploadingBrand)} onChange={(e) => uploadBrand(e.target.files?.[0], "logoMarkUrl")} /></label>
        </div>
      </section>
      <div className="admin-field-grid two"><label>Primary logo URL<input name="logoUrl" value={settings.logoUrl || ""} onChange={update} placeholder="Uploaded automatically or https://..." /></label><label>Vertical logo / mark URL<input name="logoMarkUrl" value={settings.logoMarkUrl || ""} onChange={update} placeholder="Optional" /></label></div>
      <div className="admin-field-grid two"><label>Logo alt text<input name="logoAlt" value={settings.logoAlt || ""} onChange={update} placeholder="Riseora Herbals" /></label><label>Brand tagline<input name="brandTagline" value={settings.brandTagline || ""} onChange={update} placeholder="Everyday herbal care, thoughtfully made." /></label></div>
      <label>Public site URL<input name="siteUrl" value={settings.siteUrl || ""} onChange={update} placeholder="https://www.riseora.com" /></label>
      <div className="admin-field-grid two"><label>Announcement line 1<input name="announcementText" value={settings.announcementText || ""} onChange={update} /></label><label>Announcement line 2<input name="announcementSecondary" value={settings.announcementSecondary || ""} onChange={update} /></label></div>
      <div className="admin-field-grid two"><label>SEO title<input name="seoTitle" value={settings.seoTitle || ""} onChange={update} placeholder="Riseora Herbals | Herbal Care" /></label><label>SEO description<textarea name="seoDescription" value={settings.seoDescription || ""} onChange={update} /></label></div>
      <div className="admin-field-grid two"><label>About page title<input name="aboutTitle" value={settings.aboutTitle || ""} onChange={update} /></label><label>Contact page introduction<textarea name="contactIntro" value={settings.contactIntro || ""} onChange={update} /></label></div>
      <label>About page story<textarea name="aboutBody" value={settings.aboutBody || ""} onChange={update} rows="6" /></label>
      <div className="admin-field-grid four"><label>Instagram URL<input name="instagramUrl" value={settings.instagramUrl || ""} onChange={update} /></label><label>Facebook URL<input name="facebookUrl" value={settings.facebookUrl || ""} onChange={update} /></label><label>YouTube URL<input name="youtubeUrl" value={settings.youtubeUrl || ""} onChange={update} /></label><label>WhatsApp number<input name="whatsappNumber" value={settings.whatsappNumber || ""} onChange={update} placeholder="9198…" /></label></div>

      <p className="admin-help-note"><strong>GST note:</strong> GSTIN, HSN/SAC and GST rates are business/tax data. Confirm the correct values with Riseora's accountant before issuing production tax invoices.</p>
      <button className="button">Save store settings</button>
    </form>

    <section className="admin-panel phase21-zone-admin">
      <div className="admin-panel-head"><div><p className="eyebrow">DELIVERY CONTROL</p><h2>PIN-code delivery zones</h2><p>Define real serviceability rules by PIN prefix. The longest matching prefix wins; priority resolves ties.</p></div><span className="phase21-zone-count">{zones.filter((item) => item.isActive).length} active</span></div>
      <form id="delivery-zone-editor" className="admin-form phase21-zone-form" onSubmit={saveZone}>
        <div className="admin-field-grid three"><label>Zone name<input required value={zone.name} onChange={(e) => setZone({ ...zone, name: e.target.value })} placeholder="Surat city" /></label><label>City label<input value={zone.city} onChange={(e) => setZone({ ...zone, city: e.target.value })} placeholder="Surat" /></label><label>State label<input value={zone.state} onChange={(e) => setZone({ ...zone, state: e.target.value })} placeholder="Gujarat" /></label></div>
        <label>PIN prefixes<textarea required value={zone.postalPrefixes} onChange={(e) => setZone({ ...zone, postalPrefixes: e.target.value })} rows="3" placeholder="395, 394, 396001&#10;Use commas, spaces or new lines. 395 matches all 395xxx PIN codes; 395007 is exact." /><small>Use 2–6 digits. More-specific prefixes automatically win over broader ones.</small></label>
        <div className="admin-field-grid four"><label>Shipping fee ₹<input type="number" min="0" step="0.01" value={zone.shippingFee} onChange={(e) => setZone({ ...zone, shippingFee: e.target.value })} placeholder="Blank = global" /></label><label>Free shipping above ₹<input type="number" min="0" step="0.01" value={zone.freeShippingThreshold} onChange={(e) => setZone({ ...zone, freeShippingThreshold: e.target.value })} placeholder="Blank = global" /></label><label>Delivery min days<input type="number" min="1" max="45" value={zone.deliveryMinDays} onChange={(e) => setZone({ ...zone, deliveryMinDays: e.target.value })} placeholder="Global" /></label><label>Delivery max days<input type="number" min="1" max="60" value={zone.deliveryMaxDays} onChange={(e) => setZone({ ...zone, deliveryMaxDays: e.target.value })} placeholder="Global" /></label></div>
        <div className="phase21-zone-controls"><label className="checkbox-row"><input type="checkbox" checked={zone.codAllowed} onChange={(e) => setZone({ ...zone, codAllowed: e.target.checked })} /> COD allowed in this zone</label><label className="checkbox-row"><input type="checkbox" checked={zone.isActive} onChange={(e) => setZone({ ...zone, isActive: e.target.checked })} /> Active</label><label>Priority<input type="number" min="0" max="9999" value={zone.priority} onChange={(e) => setZone({ ...zone, priority: e.target.value })} /></label><div className="phase21-zone-editor-actions"><button className="button">{editingZoneId ? "Update zone" : "Add zone"}</button>{editingZoneId && <button type="button" className="button button-secondary" onClick={() => { setEditingZoneId(""); setZone(emptyZone); }}>Cancel edit</button>}</div></div>
      </form>
      <div className="phase21-zone-list">
        {zones.length === 0 && <div className="admin-empty"><strong>No delivery zones yet</strong><p>Add zones first, test PIN codes on the storefront, then optionally enable strict serviceability above.</p></div>}
        {zones.map((item) => <article key={item.id} className={`phase21-zone-card${item.isActive ? "" : " inactive"}`}>
          <div className="phase21-zone-card-head"><div><strong>{item.name}</strong><small>{[item.city, item.state].filter(Boolean).join(", ") || "No city/state label"}</small></div><span>{item.isActive ? "ACTIVE" : "INACTIVE"}</span></div>
          <div className="phase21-prefixes">{(Array.isArray(item.postalPrefixes) ? item.postalPrefixes : []).map((prefix) => <code key={prefix}>{prefix}{String(prefix).length < 6 ? "…" : ""}</code>)}</div>
          <div className="phase21-zone-facts"><span><b>{item.shippingFee == null ? "Global" : `₹${Number(item.shippingFee).toFixed(0)}`}</b> Shipping</span><span><b>{item.freeShippingThreshold == null ? "Global" : `₹${Number(item.freeShippingThreshold).toFixed(0)}`}</b> Free-shipping threshold</span><span><b>{item.deliveryMinDays == null && item.deliveryMaxDays == null ? "Global" : `${item.deliveryMinDays ?? "G"}–${item.deliveryMaxDays ?? "G"}d`}</b> Delivery</span><span><b>{item.codAllowed ? "YES" : "NO"}</b> COD</span></div>
          <div className="phase21-zone-card-actions"><button type="button" className="button button-secondary" onClick={() => editZone(item)}>Edit</button><button type="button" className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => toggleZone(item)}>{item.isActive ? "Active" : "Inactive"}</button><button type="button" className="danger-link" onClick={() => removeZone(item)}>Delete</button></div>
        </article>)}
      </div>
    </section>

    <div className="admin-settings-grid">
      <section className="admin-panel">
        <div className="admin-panel-head"><div><h2>Courier partners</h2><p>Store common carriers and tracking URL templates.</p></div></div>
        <form className="admin-form" onSubmit={addPartner}><div className="admin-field-grid two"><label>Name<input required value={partner.name} onChange={(e) => setPartner({ ...partner, name: e.target.value })} placeholder="Delhivery" /></label><label>Code<input required value={partner.code} onChange={(e) => setPartner({ ...partner, code: e.target.value })} placeholder="DELHIVERY" /></label></div><label>Tracking URL template<input value={partner.trackingUrlTemplate} onChange={(e) => setPartner({ ...partner, trackingUrlTemplate: e.target.value })} placeholder="https://courier.example/track/{trackingNumber}" /></label><button className="button button-secondary">Add courier</button></form>
        <div className="settings-partner-list">{partners.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.trackingUrlTemplate || "Manual tracking URL"}</small></span><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => togglePartner(item)}>{item.isActive ? "Active" : "Inactive"}</button></div>)}</div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head"><div><h2>Courier dispatch export</h2><p>Export shipping-ready rows for portal upload or courier processing.</p></div></div>
        <div className="dispatch-actions"><button className="button" onClick={() => exportDispatch("PROCESSING")}>Export processing orders CSV</button><button className="button button-secondary" onClick={() => exportDispatch("CONFIRMED")}>Export confirmed orders CSV</button></div>
        <p className="admin-help-note">CSV contains customer delivery details, COD amount, order value, SKU summary and calculated product weight. Adapt/import it according to your courier's current template.</p>
      </section>
    </div>
  </>;
}
