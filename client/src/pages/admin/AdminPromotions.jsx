import { useEffect, useState } from "react";
import { apiFetch, mediaUrl } from "../../api/http";

const emptyCoupon = { code: "", description: "", discountType: "PERCENTAGE", discountValue: "", minOrderAmount: "", maxDiscountAmount: "", usageLimit: "", startsAt: "", endsAt: "" };
const emptyOffer = { title: "", description: "", badge: "", ctaText: "Shop now", ctaLink: "/shop", startsAt: "", endsAt: "" };
const emptyBanner = { id: "", placement: "HOME_HERO", eyebrow: "RISEORA HERBALS", title: "", description: "", imageUrl: "", mobileImageUrl: "", ctaText: "SHOP NOW", ctaLink: "/shop", background: "#d8a693", textColor: "#11251c", priority: "0", startsAt: "", endsAt: "" };

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
  const [coupon, setCoupon] = useState(emptyCoupon);
  const [offer, setOffer] = useState(emptyOffer);
  const [banner, setBanner] = useState(emptyBanner);
  const [uploadingCampaign, setUploadingCampaign] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const [couponResponse, offerResponse, bannerResponse] = await Promise.all([
      apiFetch("/admin/coupons"),
      apiFetch("/admin/offers"),
      apiFetch("/admin/banners"),
    ]);
    setCoupons(couponResponse.data);
    setOffers(offerResponse.data);
    setBanners(bannerResponse.data);
  }

  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function createCoupon(event) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      await apiFetch("/admin/coupons", { method: "POST", body: JSON.stringify({
        code: coupon.code.toUpperCase(), description: coupon.description, discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue), minOrderAmount: optionalNumber(coupon.minOrderAmount),
        maxDiscountAmount: optionalNumber(coupon.maxDiscountAmount), usageLimit: optionalNumber(coupon.usageLimit),
        startsAt: optionalDate(coupon.startsAt), endsAt: optionalDate(coupon.endsAt),
      }) });
      setCoupon(emptyCoupon); setMessage("Coupon created."); await refresh();
    } catch (e) { setError(e.message); }
  }

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
    } catch (e) { setError(e.message); }
    finally { setUploadingCampaign(""); }
  }

  async function saveBanner(event) {
    event.preventDefault(); setError(""); setMessage("");
    const payload = {
      placement: banner.placement,
      eyebrow: banner.eyebrow,
      title: banner.title,
      description: banner.description,
      imageUrl: banner.imageUrl,
      mobileImageUrl: banner.mobileImageUrl,
      ctaText: banner.ctaText,
      ctaLink: banner.ctaLink,
      background: banner.background,
      textColor: banner.textColor,
      priority: Number(banner.priority || 0),
      startsAt: banner.startsAt ? optionalDate(banner.startsAt) : null,
      endsAt: banner.endsAt ? optionalDate(banner.endsAt) : null,
    };
    try {
      await apiFetch(banner.id ? `/admin/banners/${banner.id}` : "/admin/banners", {
        method: banner.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setBanner(emptyBanner);
      setMessage(banner.id ? "Campaign slide updated." : "Campaign slide published.");
      await refresh();
    } catch (e) { setError(e.message); }
  }

  function editBanner(item) {
    setBanner({
      id: item.id,
      placement: item.placement,
      eyebrow: item.eyebrow || "",
      title: item.title || "",
      description: item.description || "",
      imageUrl: item.imageUrl || "",
      mobileImageUrl: item.mobileImageUrl || "",
      ctaText: item.ctaText || "",
      ctaLink: item.ctaLink || "",
      background: item.background || "#d8a693",
      textColor: item.textColor || "#11251c",
      priority: String(item.priority || 0),
      startsAt: dateInput(item.startsAt),
      endsAt: dateInput(item.endsAt),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggle(type, id, isActive) {
    try {
      await apiFetch(`/admin/${type}/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: !isActive }) });
      await refresh();
    } catch (e) { setError(e.message); }
  }

  async function moveBanner(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= banners.length) return;
    const reordered = [...banners];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, moved);
    try {
      await Promise.all(reordered.map((item, orderIndex) => apiFetch(`/admin/banners/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ priority: (reordered.length - orderIndex) * 10 }),
      })));
      await refresh();
    } catch (e) { setError(e.message); }
  }

  async function deleteBanner(item) {
    if (!window.confirm(`Delete campaign slide “${item.title}”?`)) return;
    try {
      await apiFetch(`/admin/banners/${item.id}`, { method: "DELETE" });
      if (banner.id === item.id) setBanner(emptyBanner);
      setMessage("Campaign slide deleted.");
      await refresh();
    } catch (e) { setError(e.message); }
  }

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">GROWTH</p><h1>Promotions & campaigns</h1><p>Control coupons, offer cards and the smooth homepage slideshow from one place.</p></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

    <div className="admin-promo-grid phase3-admin-promo">
      <form className="admin-panel admin-form phase12-campaign-form" onSubmit={saveBanner}>
        <div className="admin-panel-head"><div><h2>{banner.id ? "Edit slideshow slide" : "Add slideshow slide"}</h2><p>Every active Home Hero campaign becomes one slide. Desktop and mobile images can be different.</p></div>{banner.id && <button type="button" className="state-toggle" onClick={() => setBanner(emptyBanner)}>New slide</button>}</div>
        <div className="admin-field-grid two"><label>Placement<select value={banner.placement} onChange={(e) => setBanner({ ...banner, placement: e.target.value })}><option value="HOME_HERO">Home hero</option><option value="HOME_STRIP">Home strip</option></select></label><label>Eyebrow<input value={banner.eyebrow} onChange={(e) => setBanner({ ...banner, eyebrow: e.target.value })} /></label></div>
        <label>Headline<input required value={banner.title} onChange={(e) => setBanner({ ...banner, title: e.target.value })} placeholder="Herbal care for stronger-looking hair" /></label>
        <label>Description<textarea value={banner.description} onChange={(e) => setBanner({ ...banner, description: e.target.value })} /></label>
        <div className="phase12-campaign-upload-grid">
          <CampaignUpload label="Desktop image" value={banner.imageUrl} busy={uploadingCampaign === "imageUrl"} onUpload={(file) => uploadCampaign(file, "imageUrl")} onChange={(value) => setBanner({ ...banner, imageUrl: value })} />
          <CampaignUpload label="Mobile portrait image" value={banner.mobileImageUrl} busy={uploadingCampaign === "mobileImageUrl"} onUpload={(file) => uploadCampaign(file, "mobileImageUrl")} onChange={(value) => setBanner({ ...banner, mobileImageUrl: value })} />
        </div>
        <div className="admin-field-grid two"><label>Button text<input value={banner.ctaText} onChange={(e) => setBanner({ ...banner, ctaText: e.target.value })} /></label><label>Button link<input value={banner.ctaLink} onChange={(e) => setBanner({ ...banner, ctaLink: e.target.value })} /></label></div>
        <div className="admin-field-grid three"><label>Background<input value={banner.background} onChange={(e) => setBanner({ ...banner, background: e.target.value })} placeholder="#d8a693" /></label><label>Text color<input value={banner.textColor} onChange={(e) => setBanner({ ...banner, textColor: e.target.value })} placeholder="#11251c" /></label><label>Priority<input type="number" min="0" value={banner.priority} onChange={(e) => setBanner({ ...banner, priority: e.target.value })} /></label></div>
        <div className="admin-field-grid two"><label>Starts<input type="datetime-local" value={banner.startsAt} onChange={(e) => setBanner({ ...banner, startsAt: e.target.value })} /></label><label>Ends<input type="datetime-local" value={banner.endsAt} onChange={(e) => setBanner({ ...banner, endsAt: e.target.value })} /></label></div>
        <button className="button">{banner.id ? "Save slide" : "Publish slide"}</button>
      </form>

      <form className="admin-panel admin-form" onSubmit={createCoupon}><div className="admin-panel-head"><div><h2>Create coupon</h2><p>Customers enter this code at checkout.</p></div></div><div className="admin-field-grid two"><label>Code<input required value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value.toUpperCase() })} placeholder="RISEORA20" /></label><label>Discount type<select value={coupon.discountType} onChange={(e) => setCoupon({ ...coupon, discountType: e.target.value })}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount</option></select></label></div><label>Description<input value={coupon.description} onChange={(e) => setCoupon({ ...coupon, description: e.target.value })} /></label><div className="admin-field-grid three"><label>Discount value<input required min="0" step="0.01" type="number" value={coupon.discountValue} onChange={(e) => setCoupon({ ...coupon, discountValue: e.target.value })} /></label><label>Minimum order<input min="0" step="0.01" type="number" value={coupon.minOrderAmount} onChange={(e) => setCoupon({ ...coupon, minOrderAmount: e.target.value })} /></label><label>Max discount<input min="0" step="0.01" type="number" value={coupon.maxDiscountAmount} onChange={(e) => setCoupon({ ...coupon, maxDiscountAmount: e.target.value })} /></label></div><label>Usage limit<input min="1" type="number" value={coupon.usageLimit} onChange={(e) => setCoupon({ ...coupon, usageLimit: e.target.value })} /></label><div className="admin-field-grid two"><label>Starts<input type="datetime-local" value={coupon.startsAt} onChange={(e) => setCoupon({ ...coupon, startsAt: e.target.value })} /></label><label>Ends<input type="datetime-local" value={coupon.endsAt} onChange={(e) => setCoupon({ ...coupon, endsAt: e.target.value })} /></label></div><button className="button">Create coupon</button></form>

      <form className="admin-panel admin-form" onSubmit={createOffer}><div className="admin-panel-head"><div><h2>Offer card</h2><p>Promotional tile shown on the storefront.</p></div></div><label>Title<input required value={offer.title} onChange={(e) => setOffer({ ...offer, title: e.target.value })} /></label><label>Description<textarea value={offer.description} onChange={(e) => setOffer({ ...offer, description: e.target.value })} /></label><div className="admin-field-grid two"><label>Badge<input value={offer.badge} onChange={(e) => setOffer({ ...offer, badge: e.target.value })} placeholder="LIMITED TIME" /></label><label>CTA text<input value={offer.ctaText} onChange={(e) => setOffer({ ...offer, ctaText: e.target.value })} /></label></div><label>CTA link<input value={offer.ctaLink} onChange={(e) => setOffer({ ...offer, ctaLink: e.target.value })} /></label><div className="admin-field-grid two"><label>Starts<input type="datetime-local" value={offer.startsAt} onChange={(e) => setOffer({ ...offer, startsAt: e.target.value })} /></label><label>Ends<input type="datetime-local" value={offer.endsAt} onChange={(e) => setOffer({ ...offer, endsAt: e.target.value })} /></label></div><button className="button">Publish offer</button></form>
    </div>

    <div className="admin-panel-grid promo-lists">
      <BannerList items={banners} onToggle={(i) => toggle("banners", i.id, i.isActive)} onEdit={editBanner} onMove={moveBanner} onDelete={deleteBanner} />
      <PromoList title="Coupons" items={coupons} empty="No coupons yet." getTitle={(i) => i.code} getMeta={(i) => i.discountType === "PERCENTAGE" ? `${Number(i.discountValue)}% off • used ${i.usageCount}${i.usageLimit ? `/${i.usageLimit}` : ""}` : `₹${Number(i.discountValue).toFixed(0)} off`} onToggle={(i) => toggle("coupons", i.id, i.isActive)} />
      <PromoList title="Offers" items={offers} empty="No offers yet." getMeta={(i) => i.badge || "Storefront offer"} onToggle={(i) => toggle("offers", i.id, i.isActive)} />
    </div>
  </>;
}

function CampaignUpload({ label, value, busy, onUpload, onChange }) {
  return <div className="phase12-campaign-upload"><div className="phase12-campaign-preview">{value ? <img src={mediaUrl(value)} alt="" /> : <span>No image</span>}</div><strong>{label}</strong><div className="phase12-upload-actions"><label className={busy ? "state-toggle disabled" : "state-toggle active"}>{busy ? "Uploading…" : "Upload"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => onUpload(e.target.files?.[0])} /></label></div><input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Uploaded image or https://..." /></div>;
}

function BannerList({ items, onToggle, onEdit, onMove, onDelete }) {
  return <section className="admin-panel phase12-banner-manager"><div className="admin-panel-head"><div><h2>Slideshow order</h2><p>{items.length} slide{items.length === 1 ? "" : "s"}. Active Home Hero slides rotate automatically.</p></div></div>{items.length === 0 ? <div className="admin-empty">No campaign banners yet.</div> : <div className="phase12-banner-list">{items.map((item, index) => <article key={item.id} className="phase12-banner-row"><div className="phase12-banner-thumb">{item.imageUrl ? <img src={mediaUrl(item.imageUrl)} alt="" /> : <span>{index + 1}</span>}</div><div className="phase12-banner-info"><strong>{item.title}</strong><span>{item.placement.replace("_", " ")} • priority {item.priority}</span></div><div className="phase12-banner-actions"><button className="state-toggle" disabled={index === 0} onClick={() => onMove(index, -1)}>↑</button><button className="state-toggle" disabled={index === items.length - 1} onClick={() => onMove(index, 1)}>↓</button><button className="state-toggle" onClick={() => onEdit(item)}>Edit</button><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => onToggle(item)}>{item.isActive ? "Active" : "Inactive"}</button><button className="mini-danger" onClick={() => onDelete(item)}>×</button></div></article>)}</div>}</section>;
}

function PromoList({ title, items, empty, getTitle = (i) => i.title, getMeta, onToggle }) {
  return <section className="admin-panel"><div className="admin-panel-head"><div><h2>{title}</h2><p>{items.length} total</p></div></div>{items.length === 0 ? <div className="admin-empty">{empty}</div> : <div className="admin-promo-list">{items.map((item) => <div className="admin-promo-row" key={item.id}><div><strong>{getTitle(item)}</strong><span>{getMeta(item)}</span></div><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => onToggle(item)}>{item.isActive ? "Active" : "Inactive"}</button></div>)}</div>}</section>;
}
