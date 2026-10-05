import { useEffect, useMemo, useState } from "react";
import { apiFetch, mediaUrl } from "../../api/http";
import RichTextEditor from "../../components/RichTextEditor";
import RichText from "../../components/RichText";

const emptyCoupon = { id: "", code: "", description: "", discountType: "PERCENTAGE", discountValue: "", scope: "ORDER", application: "ORDER_TOTAL", productIds: [], categoryIds: [], minOrderAmount: "", maxDiscountAmount: "", usageLimit: "", perCustomerUsageLimit: "1", startsAt: "", endsAt: "" };
const emptyOffer = { title: "", description: "", badge: "", ctaText: "Shop now", ctaLink: "/shop", startsAt: "", endsAt: "" };
const emptyBanner = { id: "", placement: "HOME_HERO", eyebrow: "RISEORA HERBALS", title: "", description: "", imageUrl: "", mobileImageUrl: "", imageAlt: "", ctaText: "SHOP NOW", ctaLink: "/shop", background: "#d8a693", textColor: "#11251c", titleFontFamily: "Inter", titleFontWeight: "900", titleFontStyle: "normal", titleTextAlign: "left", titleSize: "XL", descriptionFontFamily: "Inter", descriptionTextAlign: "left", priority: "0", startsAt: "", endsAt: "" };

function optionalNumber(value) { return value === "" ? undefined : Number(value); }
function optionalDate(value) { return value ? new Date(value).toISOString() : undefined; }
function dateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function AdminPromotions() {
  const [coupons, setCoupons] = useState([]);
  const [offers, setOffers] = useState([]);
  const [banners, setBanners] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [savingsHealth, setSavingsHealth] = useState(null);
  const [coupon, setCoupon] = useState(emptyCoupon);
  const [offer, setOffer] = useState(emptyOffer);
  const [banner, setBanner] = useState(emptyBanner);
  const [targetSearch, setTargetSearch] = useState("");
  const [uploadingCampaign, setUploadingCampaign] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const [couponResponse, offerResponse, bannerResponse, productResponse, categoryResponse, savingsResponse] = await Promise.all([
      apiFetch("/admin/coupons"), apiFetch("/admin/offers"), apiFetch("/admin/banners"), apiFetch("/admin/products"), apiFetch("/admin/categories"), apiFetch("/admin/promotions/savings-health").catch(() => ({ data: null })),
    ]);
    setCoupons(couponResponse.data); setOffers(offerResponse.data); setBanners(bannerResponse.data); setProducts(productResponse.data); setCategories(categoryResponse.data); setSavingsHealth(savingsResponse.data);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function saveCoupon(event) {
    event.preventDefault(); setError(""); setMessage("");
    const payload = {
      code: coupon.code.toUpperCase(), description: coupon.description, discountType: coupon.discountType, discountValue: Number(coupon.discountValue),
      scope: coupon.scope, application: coupon.scope === "ORDER" ? "ORDER_TOTAL" : coupon.application,
      productIds: coupon.scope === "PRODUCT" ? coupon.productIds : [], categoryIds: coupon.scope === "CATEGORY" ? coupon.categoryIds : [],
      minOrderAmount: optionalNumber(coupon.minOrderAmount), maxDiscountAmount: optionalNumber(coupon.maxDiscountAmount), usageLimit: optionalNumber(coupon.usageLimit),
      perCustomerUsageLimit: coupon.perCustomerUsageLimit === "" ? null : Number(coupon.perCustomerUsageLimit),
      startsAt: optionalDate(coupon.startsAt), endsAt: optionalDate(coupon.endsAt),
    };
    try {
      await apiFetch(coupon.id ? `/admin/coupons/${coupon.id}` : "/admin/coupons", { method: coupon.id ? "PUT" : "POST", body: JSON.stringify(payload) });
      setMessage(coupon.id ? "Coupon updated." : "Coupon created."); setCoupon(emptyCoupon); setTargetSearch(""); await refresh();
    } catch (e) { setError(e.message); }
  }

  function editCoupon(item) {
    setCoupon({
      id: item.id, code: item.code || "", description: item.description || "", discountType: item.discountType || "PERCENTAGE", discountValue: String(Number(item.discountValue || 0)),
      scope: item.scope || "ORDER", application: item.application || "ORDER_TOTAL", productIds: item.products?.map((link) => link.productId) || [], categoryIds: item.categories?.map((link) => link.categoryId) || [],
      minOrderAmount: item.minOrderAmount == null ? "" : String(Number(item.minOrderAmount)), maxDiscountAmount: item.maxDiscountAmount == null ? "" : String(Number(item.maxDiscountAmount)),
      usageLimit: item.usageLimit == null ? "" : String(item.usageLimit), perCustomerUsageLimit: item.perCustomerUsageLimit == null ? "" : String(item.perCustomerUsageLimit),
      startsAt: dateInput(item.startsAt), endsAt: dateInput(item.endsAt),
    });
    setTargetSearch(""); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleCouponTarget(id) {
    const field = coupon.scope === "PRODUCT" ? "productIds" : "categoryIds";
    setCoupon((current) => ({ ...current, [field]: current[field].includes(id) ? current[field].filter((value) => value !== id) : [...current[field], id] }));
  }

  const couponTargets = useMemo(() => {
    const q = targetSearch.trim().toLowerCase();
    const source = coupon.scope === "PRODUCT" ? products : categories;
    return source.filter((item) => !q || item.name.toLowerCase().includes(q)).slice(0, 80);
  }, [coupon.scope, products, categories, targetSearch]);

  async function createOffer(event) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      await apiFetch("/admin/offers", { method: "POST", body: JSON.stringify({ ...offer, startsAt: optionalDate(offer.startsAt), endsAt: optionalDate(offer.endsAt) }) });
      setOffer(emptyOffer); setMessage("Offer published."); await refresh();
    } catch (e) { setError(e.message); }
  }

  async function uploadCampaign(file, field) {
    if (!file) return;
    setError(""); setMessage(""); setUploadingCampaign(field);
    try {
      const body = new FormData(); body.append("image", file);
      const response = await apiFetch("/admin/uploads/campaigns", { method: "POST", body });
      setBanner((current) => ({ ...current, [field]: response.data.url }));
      setMessage(`${field === "mobileImageUrl" ? "Mobile" : "Desktop"} campaign image uploaded.`);
    } catch (e) { setError(e.message); } finally { setUploadingCampaign(""); }
  }

  async function saveBanner(event) {
    event.preventDefault(); setError(""); setMessage("");
    const payload = {
      placement: banner.placement, eyebrow: banner.eyebrow, title: banner.title, description: banner.description, imageUrl: banner.imageUrl, mobileImageUrl: banner.mobileImageUrl, imageAlt: banner.imageAlt,
      ctaText: banner.ctaText, ctaLink: banner.ctaLink, background: banner.background, textColor: banner.textColor,
      titleFontFamily: banner.titleFontFamily, titleFontWeight: Number(banner.titleFontWeight || 900), titleFontStyle: banner.titleFontStyle, titleTextAlign: banner.titleTextAlign, titleSize: banner.titleSize,
      descriptionFontFamily: banner.descriptionFontFamily, descriptionTextAlign: banner.descriptionTextAlign,
      priority: Number(banner.priority || 0), startsAt: banner.startsAt ? optionalDate(banner.startsAt) : null, endsAt: banner.endsAt ? optionalDate(banner.endsAt) : null,
    };
    try {
      await apiFetch(banner.id ? `/admin/banners/${banner.id}` : "/admin/banners", { method: banner.id ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setBanner(emptyBanner); setMessage(banner.id ? "Campaign slide updated." : "Campaign slide published."); await refresh();
    } catch (e) { setError(e.message); }
  }

  function editBanner(item) {
    setBanner({
      id: item.id, placement: item.placement, eyebrow: item.eyebrow || "", title: item.title || "", description: item.description || "", imageUrl: item.imageUrl || "", mobileImageUrl: item.mobileImageUrl || "", imageAlt: item.imageAlt || "",
      ctaText: item.ctaText || "", ctaLink: item.ctaLink || "", background: item.background || "#d8a693", textColor: item.textColor || "#11251c",
      titleFontFamily: item.titleFontFamily || "Inter", titleFontWeight: String(item.titleFontWeight || 900), titleFontStyle: item.titleFontStyle || "normal", titleTextAlign: item.titleTextAlign || "left", titleSize: item.titleSize || "XL",
      descriptionFontFamily: item.descriptionFontFamily || "Inter", descriptionTextAlign: item.descriptionTextAlign || "left", priority: String(item.priority || 0), startsAt: dateInput(item.startsAt), endsAt: dateInput(item.endsAt),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggle(type, id, isActive) {
    try { await apiFetch(`/admin/${type}/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: !isActive }) }); await refresh(); }
    catch (e) { setError(e.message); }
  }
  async function moveBanner(index, direction) {
    const nextIndex = index + direction; if (nextIndex < 0 || nextIndex >= banners.length) return;
    const reordered = [...banners]; const [moved] = reordered.splice(index, 1); reordered.splice(nextIndex, 0, moved);
    try { await Promise.all(reordered.map((item, orderIndex) => apiFetch(`/admin/banners/${item.id}`, { method: "PATCH", body: JSON.stringify({ priority: (reordered.length - orderIndex) * 10 }) }))); await refresh(); }
    catch (e) { setError(e.message); }
  }
  async function deleteBanner(item) {
    if (!window.confirm(`Delete campaign slide “${item.title}”?`)) return;
    try { await apiFetch(`/admin/banners/${item.id}`, { method: "DELETE" }); if (banner.id === item.id) setBanner(emptyBanner); setMessage("Campaign slide deleted."); await refresh(); }
    catch (e) { setError(e.message); }
  }

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">GROWTH</p><h1>Promotions & campaigns</h1><p>Control campaign typography, targeted coupons, offer cards and the homepage slideshow.</p></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

    <section className="admin-panel phase62-savings-health">
      <div className="admin-panel-head"><div><p className="eyebrow">PHASE 62 · SAVINGS GUIDANCE</p><h2>Offer wallet health</h2><p>Automatic deals and customer-owned reward vouchers are surfaced safely at checkout. General admin coupon codes stay manual unless the customer already knows them.</p></div></div>
      <div className="phase62-savings-health-grid">
        <article><small>WALLET VIEWS · 60 MIN</small><strong>{Number(savingsHealth?.views || 0)}</strong><span>{Number(savingsHealth?.signedInViews || 0)} signed-in</span></article>
        <article><small>VOUCHERS SUGGESTED</small><strong>{Number(savingsHealth?.privateVoucherSuggestions || 0)}</strong><span>eligible private rewards</span></article>
        <article><small>ADVISOR APPLIES</small><strong>{Number(savingsHealth?.applyEvents || 0)}</strong><span>one-click voucher applies</span></article>
        <article><small>AVG APPLIED SAVING</small><strong>₹{Number(savingsHealth?.averageAppliedSaving || 0).toFixed(0)}</strong><span>advisor-applied vouchers</span></article>
      </div>
      <small className="phase62-savings-admin-policy">{savingsHealth?.privacy || "Aggregated operational counters only; no cart contents or customer identity are retained here."}</small>
    </section>

    <div className="admin-promo-grid phase3-admin-promo phase19-promo-grid">
      <form className="admin-panel admin-form phase12-campaign-form phase19-campaign-form" onSubmit={saveBanner}>
        <div className="admin-panel-head"><div><h2>{banner.id ? "Edit slideshow slide" : "Add slideshow slide"}</h2><p>Control the image, copy and typography without changing code.</p></div>{banner.id && <button type="button" className="state-toggle" onClick={() => setBanner(emptyBanner)}>New slide</button>}</div>
        <div className="admin-field-grid two"><label>Placement<select value={banner.placement} onChange={(e) => setBanner({ ...banner, placement: e.target.value })}><option value="HOME_HERO">Home hero</option><option value="HOME_STRIP">Home strip</option></select></label><label>Eyebrow<input value={banner.eyebrow} onChange={(e) => setBanner({ ...banner, eyebrow: e.target.value })} /></label></div>
        <label>Headline<input required value={banner.title} onChange={(e) => setBanner({ ...banner, title: e.target.value })} placeholder="Herbal care for stronger-looking hair" /></label>
        <div className="phase19-typography-grid"><label>Headline font<select value={banner.titleFontFamily} onChange={(e) => setBanner({ ...banner, titleFontFamily: e.target.value })}>{["Inter","Georgia","Arial","Verdana","Times New Roman","Trebuchet MS"].map((font) => <option key={font}>{font}</option>)}</select></label><label>Weight<select value={banner.titleFontWeight} onChange={(e) => setBanner({ ...banner, titleFontWeight: e.target.value })}>{[400,500,600,700,800,900].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>Style<select value={banner.titleFontStyle} onChange={(e) => setBanner({ ...banner, titleFontStyle: e.target.value })}><option value="normal">Normal</option><option value="italic">Italic</option></select></label><label>Align<select value={banner.titleTextAlign} onChange={(e) => setBanner({ ...banner, titleTextAlign: e.target.value })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Size<select value={banner.titleSize} onChange={(e) => setBanner({ ...banner, titleSize: e.target.value })}><option value="M">Medium</option><option value="L">Large</option><option value="XL">XL</option><option value="XXL">XXL</option></select></label></div>
        <div className="phase19-editor-field"><label>Campaign description</label><RichTextEditor value={banner.description} onChange={(value) => setBanner((current) => ({ ...current, description: value }))} placeholder="Use bullets, emphasis, alignment and font controls for attractive campaign copy." /></div>
        <CampaignStylePreview banner={banner} />
        <div className="admin-field-grid two"><label>Description font<select value={banner.descriptionFontFamily} onChange={(e) => setBanner({ ...banner, descriptionFontFamily: e.target.value })}>{["Inter","Georgia","Arial","Verdana","Times New Roman","Trebuchet MS"].map((font) => <option key={font}>{font}</option>)}</select></label><label>Description alignment<select value={banner.descriptionTextAlign} onChange={(e) => setBanner({ ...banner, descriptionTextAlign: e.target.value })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select></label></div>
        <div className="phase12-campaign-upload-grid"><CampaignUpload label="Desktop image" value={banner.imageUrl} busy={uploadingCampaign === "imageUrl"} onUpload={(file) => uploadCampaign(file, "imageUrl")} onChange={(value) => setBanner({ ...banner, imageUrl: value })} /><CampaignUpload label="Mobile portrait image" value={banner.mobileImageUrl} busy={uploadingCampaign === "mobileImageUrl"} onUpload={(file) => uploadCampaign(file, "mobileImageUrl")} onChange={(value) => setBanner({ ...banner, mobileImageUrl: value })} /></div>
        <label>Image alt text<input value={banner.imageAlt} onChange={(e) => setBanner({ ...banner, imageAlt: e.target.value })} placeholder="Describe the campaign visual for accessibility" /></label>
        <div className="admin-field-grid two"><label>Button text<input value={banner.ctaText} onChange={(e) => setBanner({ ...banner, ctaText: e.target.value })} /></label><label>Button link<input value={banner.ctaLink} onChange={(e) => setBanner({ ...banner, ctaLink: e.target.value })} /></label></div>
        <div className="admin-field-grid three"><label>Background<input value={banner.background} onChange={(e) => setBanner({ ...banner, background: e.target.value })} placeholder="#d8a693" /></label><label>Text color<input value={banner.textColor} onChange={(e) => setBanner({ ...banner, textColor: e.target.value })} placeholder="#11251c" /></label><label>Priority<input type="number" min="0" value={banner.priority} onChange={(e) => setBanner({ ...banner, priority: e.target.value })} /></label></div>
        <div className="admin-field-grid two"><label>Starts<input type="datetime-local" value={banner.startsAt} onChange={(e) => setBanner({ ...banner, startsAt: e.target.value })} /></label><label>Ends<input type="datetime-local" value={banner.endsAt} onChange={(e) => setBanner({ ...banner, endsAt: e.target.value })} /></label></div>
        <button className="button">{banner.id ? "Save slide" : "Publish slide"}</button>
      </form>

      <form className="admin-panel admin-form phase19-coupon-form" onSubmit={saveCoupon}>
        <div className="admin-panel-head"><div><h2>{coupon.id ? "Edit coupon" : "Create coupon"}</h2><p>Choose who/what it applies to and how often each customer can use it.</p></div>{coupon.id && <button type="button" className="state-toggle" onClick={() => setCoupon(emptyCoupon)}>New coupon</button>}</div>
        <div className="admin-field-grid two"><label>Code<input required value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value.toUpperCase() })} placeholder="RISEORA20" /></label><label>Discount type<select value={coupon.discountType} onChange={(e) => setCoupon({ ...coupon, discountType: e.target.value })}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount</option></select></label></div>
        <label>Description<input value={coupon.description} onChange={(e) => setCoupon({ ...coupon, description: e.target.value })} /></label>
        <div className="admin-field-grid two"><label>Coupon scope<select value={coupon.scope} onChange={(e) => setCoupon({ ...coupon, scope: e.target.value, productIds: [], categoryIds: [], application: e.target.value === "ORDER" ? "ORDER_TOTAL" : coupon.application })}><option value="ORDER">Whole order</option><option value="PRODUCT">Specific products</option><option value="CATEGORY">Specific categories</option></select></label><label>Discount applies to<select disabled={coupon.scope === "ORDER"} value={coupon.scope === "ORDER" ? "ORDER_TOTAL" : coupon.application} onChange={(e) => setCoupon({ ...coupon, application: e.target.value })}><option value="ORDER_TOTAL">Total bill (when target is in cart)</option><option value="ELIGIBLE_ITEMS">Only selected product/category items</option></select></label></div>
        {coupon.scope !== "ORDER" && <div className="phase19-coupon-targets"><div className="phase19-target-head"><strong>{coupon.scope === "PRODUCT" ? "Eligible products" : "Eligible categories"}</strong><small>{coupon.scope === "PRODUCT" ? coupon.productIds.length : coupon.categoryIds.length} selected</small></div><input value={targetSearch} onChange={(e) => setTargetSearch(e.target.value)} placeholder={`Search ${coupon.scope === "PRODUCT" ? "products" : "categories"}`} /><div className="phase19-target-list">{couponTargets.map((item) => { const selected = (coupon.scope === "PRODUCT" ? coupon.productIds : coupon.categoryIds).includes(item.id); return <label key={item.id} className={selected ? "selected" : ""}><input type="checkbox" checked={selected} onChange={() => toggleCouponTarget(item.id)} /><span><strong>{item.name}</strong>{coupon.scope === "PRODUCT" && <small>{item.category?.name || "Product"}</small>}</span></label>; })}</div></div>}
        <div className="admin-field-grid three"><label>Discount value<input required min="0" step="0.01" type="number" value={coupon.discountValue} onChange={(e) => setCoupon({ ...coupon, discountValue: e.target.value })} /></label><label>Minimum order<input min="0" step="0.01" type="number" value={coupon.minOrderAmount} onChange={(e) => setCoupon({ ...coupon, minOrderAmount: e.target.value })} /></label><label>Max discount<input min="0" step="0.01" type="number" value={coupon.maxDiscountAmount} onChange={(e) => setCoupon({ ...coupon, maxDiscountAmount: e.target.value })} /></label></div>
        <div className="admin-field-grid two"><label>Total redemption limit<input min="1" type="number" value={coupon.usageLimit} onChange={(e) => setCoupon({ ...coupon, usageLimit: e.target.value })} placeholder="Blank = unlimited" /></label><label>Uses per customer<input min="1" type="number" value={coupon.perCustomerUsageLimit} onChange={(e) => setCoupon({ ...coupon, perCustomerUsageLimit: e.target.value })} placeholder="Blank = unlimited" /><small>Default is 1. Logged-in customers are tracked by account; guest checkout is tracked by email and falls back to phone.</small></label></div>
        <div className="admin-field-grid two"><label>Starts<input type="datetime-local" value={coupon.startsAt} onChange={(e) => setCoupon({ ...coupon, startsAt: e.target.value })} /></label><label>Ends<input type="datetime-local" value={coupon.endsAt} onChange={(e) => setCoupon({ ...coupon, endsAt: e.target.value })} /></label></div>
        <button className="button">{coupon.id ? "Save coupon changes" : "Create coupon"}</button>
      </form>

      <form className="admin-panel admin-form" onSubmit={createOffer}><div className="admin-panel-head"><div><h2>Offer card</h2><p>Promotional tile shown on the storefront.</p></div></div><label>Title<input required value={offer.title} onChange={(e) => setOffer({ ...offer, title: e.target.value })} /></label><div className="phase19-editor-field"><label>Description</label><RichTextEditor compact value={offer.description} onChange={(value) => setOffer((current) => ({ ...current, description: value }))} /></div><div className="admin-field-grid two"><label>Badge<input value={offer.badge} onChange={(e) => setOffer({ ...offer, badge: e.target.value })} placeholder="LIMITED TIME" /></label><label>CTA text<input value={offer.ctaText} onChange={(e) => setOffer({ ...offer, ctaText: e.target.value })} /></label></div><label>CTA link<input value={offer.ctaLink} onChange={(e) => setOffer({ ...offer, ctaLink: e.target.value })} /></label><div className="admin-field-grid two"><label>Starts<input type="datetime-local" value={offer.startsAt} onChange={(e) => setOffer({ ...offer, startsAt: e.target.value })} /></label><label>Ends<input type="datetime-local" value={offer.endsAt} onChange={(e) => setOffer({ ...offer, endsAt: e.target.value })} /></label></div><button className="button">Publish offer</button></form>
    </div>

    <div className="admin-panel-grid promo-lists">
      <BannerList items={banners} onToggle={(i) => toggle("banners", i.id, i.isActive)} onEdit={editBanner} onMove={moveBanner} onDelete={deleteBanner} />
      <CouponList items={coupons} onToggle={(i) => toggle("coupons", i.id, i.isActive)} onEdit={editCoupon} />
      <PromoList title="Offers" items={offers} empty="No offers yet." getMeta={(i) => i.badge || "Storefront offer"} onToggle={(i) => toggle("offers", i.id, i.isActive)} />
    </div>
  </>;
}


function CampaignStylePreview({ banner }) {
  const titleSizes = { M: 28, L: 34, XL: 42, XXL: 50 };
  return <div className="phase19-campaign-style-preview" style={{ background: banner.background || "#d8a693", color: banner.textColor || "#11251c" }}>
    <div className="phase19-campaign-style-copy">
      <small>{banner.eyebrow || "RISEORA HERBALS"}</small>
      <h3 style={{ fontFamily: banner.titleFontFamily || "Inter", fontWeight: Number(banner.titleFontWeight || 900), fontStyle: banner.titleFontStyle || "normal", textAlign: banner.titleTextAlign || "left", fontSize: titleSizes[banner.titleSize] || 42 }}>{banner.title || "Campaign headline preview"}</h3>
      {banner.description ? <div style={{ fontFamily: banner.descriptionFontFamily || "Inter", textAlign: banner.descriptionTextAlign || "left" }}><RichText value={banner.description} /></div> : <p>Formatted campaign description preview.</p>}
      <span>{banner.ctaText || "SHOP NOW"}</span>
    </div>
    <div className="phase19-campaign-style-media">{banner.imageUrl ? <img src={mediaUrl(banner.imageUrl)} alt="Campaign preview" /> : <b>IMAGE</b>}</div>
  </div>;
}

function CampaignUpload({ label, value, busy, onUpload, onChange }) {
  return <div className="phase12-campaign-upload"><div className="phase12-campaign-preview">{value ? <img src={mediaUrl(value)} alt="" /> : <span>No image</span>}</div><strong>{label}</strong><div className="phase12-upload-actions"><label className={busy ? "state-toggle disabled" : "state-toggle active"}>{busy ? "Uploading…" : "Upload"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => onUpload(e.target.files?.[0])} /></label></div><input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Uploaded image or https://..." /></div>;
}

function BannerList({ items, onToggle, onEdit, onMove, onDelete }) {
  return <section className="admin-panel phase12-banner-manager"><div className="admin-panel-head"><div><h2>Slideshow order</h2><p>{items.length} slide{items.length === 1 ? "" : "s"}. Active Home Hero slides rotate automatically.</p></div></div>{items.length === 0 ? <div className="admin-empty">No campaign banners yet.</div> : <div className="phase12-banner-list">{items.map((item, index) => <article key={item.id} className="phase12-banner-row"><div className="phase12-banner-thumb">{item.imageUrl ? <img src={mediaUrl(item.imageUrl)} alt="" /> : <span>{index + 1}</span>}</div><div className="phase12-banner-info"><strong>{item.title}</strong><span>{item.placement.replace("_", " ")} • {item.titleFontFamily || "Inter"} • priority {item.priority}</span></div><div className="phase12-banner-actions"><button className="state-toggle" disabled={index === 0} onClick={() => onMove(index, -1)}>↑</button><button className="state-toggle" disabled={index === items.length - 1} onClick={() => onMove(index, 1)}>↓</button><button className="state-toggle" onClick={() => onEdit(item)}>Edit</button><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => onToggle(item)}>{item.isActive ? "Active" : "Inactive"}</button><button className="mini-danger" onClick={() => onDelete(item)}>×</button></div></article>)}</div>}</section>;
}

function CouponList({ items, onToggle, onEdit }) {
  return <section className="admin-panel"><div className="admin-panel-head"><div><h2>Coupons</h2><p>{items.length} total</p></div></div>{items.length === 0 ? <div className="admin-empty">No coupons yet.</div> : <div className="admin-promo-list">{items.map((item) => { const targetCount = item.scope === "PRODUCT" ? item.products?.length : item.scope === "CATEGORY" ? item.categories?.length : 0; return <div className="admin-promo-row phase19-coupon-row" key={item.id}><div><strong>{item.code}</strong><span>{item.discountType === "PERCENTAGE" ? `${Number(item.discountValue)}%` : `₹${Number(item.discountValue).toFixed(0)}`} off • {item.scope === "ORDER" ? "whole order" : `${targetCount} ${item.scope.toLowerCase()} target${targetCount === 1 ? "" : "s"}`} • {item.scope === "ORDER" || item.application === "ORDER_TOTAL" ? "order subtotal" : "eligible items only"} • {item.perCustomerUsageLimit == null ? "unlimited/customer" : `${item.perCustomerUsageLimit}/customer`} • used {item.usageCount}{item.usageLimit ? `/${item.usageLimit}` : ""}</span></div><div className="admin-inline-actions"><button className="state-toggle" onClick={() => onEdit(item)}>Edit</button><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => onToggle(item)}>{item.isActive ? "Active" : "Inactive"}</button></div></div>; })}</div>}</section>;
}

function PromoList({ title, items, empty, getTitle = (i) => i.title, getMeta, onToggle }) {
  return <section className="admin-panel"><div className="admin-panel-head"><div><h2>{title}</h2><p>{items.length} total</p></div></div>{items.length === 0 ? <div className="admin-empty">{empty}</div> : <div className="admin-promo-list">{items.map((item) => <div className="admin-promo-row" key={item.id}><div><strong>{getTitle(item)}</strong><span>{getMeta(item)}</span></div><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => onToggle(item)}>{item.isActive ? "Active" : "Inactive"}</button></div>)}</div>}</section>;
}
