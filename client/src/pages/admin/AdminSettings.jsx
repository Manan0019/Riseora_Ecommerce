import { useEffect, useState } from "react";
import { apiFetch, mediaUrl } from "../../api/http";

const emptyPartner = { name: "", code: "", trackingUrlTemplate: "", sortOrder: 0 };

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [partners, setPartners] = useState([]);
  const [partner, setPartner] = useState(emptyPartner);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploadingBrand, setUploadingBrand] = useState("");

  async function load() {
    const [settingResponse, partnerResponse] = await Promise.all([apiFetch("/admin/settings"), apiFetch("/admin/shipping-partners")]);
    const value = settingResponse.data;
    setSettings({ ...value, freeShippingThreshold: value.freeShippingThreshold == null ? "" : String(Number(value.freeShippingThreshold)), flatShippingFee: String(Number(value.flatShippingFee || 0)), codFee: String(Number(value.codFee || 0)), returnWindowDays: String(value.returnWindowDays ?? 7) });
    setPartners(partnerResponse.data);
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
        flatShippingFee: Number(settings.flatShippingFee || 0), codFee: Number(settings.codFee || 0), returnWindowDays: Number(settings.returnWindowDays || 0),
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

  async function exportDispatch(status) {
    setError("");
    try {
      const response = await apiFetch(`/admin/dispatch?status=${status}`);
      const rows = response.data;
      if (!rows.length) return setMessage(`No ${status.toLowerCase()} orders to export.`);
      const keys = ["orderNumber","customerName","customerPhone","customerEmail","addressLine1","addressLine2","landmark","city","state","postalCode","country","paymentMethod","codAmount","totalAmount","totalWeightGrams","skuSummary"];
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
      <label className="checkbox-row"><input type="checkbox" name="returnsEnabled" checked={Boolean(settings.returnsEnabled)} onChange={update} /> Allow customer return requests</label>
      <div className="admin-field-grid two"><label>Shipping policy<textarea name="shippingPolicy" value={settings.shippingPolicy || ""} onChange={update} /></label><label>Return policy<textarea name="returnPolicy" value={settings.returnPolicy || ""} onChange={update} /></label></div>
      <div className="admin-field-grid two"><label>Privacy policy<textarea name="privacyPolicy" value={settings.privacyPolicy || ""} onChange={update} /></label><label>Terms & conditions<textarea name="termsPolicy" value={settings.termsPolicy || ""} onChange={update} /></label></div>
      <div className="editor-section-head"><div><strong>Storefront, SEO & social</strong><small>Used by mobile navigation, search previews and customer pages.</small></div></div>
      <section className="phase12-brand-settings">
        <div className="phase12-brand-upload-card">
          <div className="phase12-brand-preview full">{settings.logoUrl ? <img src={mediaUrl(settings.logoUrl)} alt={settings.logoAlt || "Riseora logo"} /> : <span>RISEORA</span>}</div>
          <div><strong>Primary logo</strong><small>Transparent PNG or WEBP works best. Used in the storefront header, footer and invoices.</small></div>
          <label className={uploadingBrand === "logoUrl" ? "state-toggle disabled" : "state-toggle active"}>{uploadingBrand === "logoUrl" ? "Uploading…" : "Upload logo"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploadingBrand)} onChange={(e) => uploadBrand(e.target.files?.[0], "logoUrl")} /></label>
        </div>
        <div className="phase12-brand-upload-card">
          <div className="phase12-brand-preview mark">{settings.logoMarkUrl ? <img src={mediaUrl(settings.logoMarkUrl)} alt="Riseora mark" /> : <span>R</span>}</div>
          <div><strong>Compact brand mark</strong><small>Optional square/circular mark for compact admin/mobile spaces.</small></div>
          <label className={uploadingBrand === "logoMarkUrl" ? "state-toggle disabled" : "state-toggle active"}>{uploadingBrand === "logoMarkUrl" ? "Uploading…" : "Upload mark"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploadingBrand)} onChange={(e) => uploadBrand(e.target.files?.[0], "logoMarkUrl")} /></label>
        </div>
      </section>
      <div className="admin-field-grid two"><label>Primary logo URL<input name="logoUrl" value={settings.logoUrl || ""} onChange={update} placeholder="Uploaded automatically or https://..." /></label><label>Compact logo mark URL<input name="logoMarkUrl" value={settings.logoMarkUrl || ""} onChange={update} placeholder="Optional" /></label></div>
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
