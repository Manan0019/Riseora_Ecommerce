import { useEffect, useState } from "react";
import { apiFetch } from "../../api/http";

const emptyCoupon = { code: "", description: "", discountType: "PERCENTAGE", discountValue: "", minOrderAmount: "", maxDiscountAmount: "", usageLimit: "", startsAt: "", endsAt: "" };
const emptyOffer = { title: "", description: "", badge: "", ctaText: "Shop now", ctaLink: "/shop", startsAt: "", endsAt: "" };
const emptyBanner = { placement: "HOME_HERO", eyebrow: "RISEORA HERBALS", title: "", description: "", imageUrl: "", mobileImageUrl: "", ctaText: "SHOP NOW", ctaLink: "/shop", background: "#d8a693", textColor: "#11251c", priority: "0", startsAt: "", endsAt: "" };

function optionalNumber(value) { return value === "" ? undefined : Number(value); }
function optionalDate(value) { return value ? new Date(value).toISOString() : undefined; }

export default function AdminPromotions() {
  const [coupons, setCoupons] = useState([]); const [offers, setOffers] = useState([]); const [banners, setBanners] = useState([]);
  const [coupon, setCoupon] = useState(emptyCoupon); const [offer, setOffer] = useState(emptyOffer); const [banner, setBanner] = useState(emptyBanner);
  const [message, setMessage] = useState(""); const [error, setError] = useState("");

  async function refresh() {
    const [couponResponse, offerResponse, bannerResponse] = await Promise.all([apiFetch("/admin/coupons"), apiFetch("/admin/offers"), apiFetch("/admin/banners")]);
    setCoupons(couponResponse.data); setOffers(offerResponse.data); setBanners(bannerResponse.data);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function createCoupon(event) {
    event.preventDefault(); setError(""); setMessage("");
    try { await apiFetch("/admin/coupons", { method: "POST", body: JSON.stringify({ code: coupon.code.toUpperCase(), description: coupon.description, discountType: coupon.discountType, discountValue: Number(coupon.discountValue), minOrderAmount: optionalNumber(coupon.minOrderAmount), maxDiscountAmount: optionalNumber(coupon.maxDiscountAmount), usageLimit: optionalNumber(coupon.usageLimit), startsAt: optionalDate(coupon.startsAt), endsAt: optionalDate(coupon.endsAt) }) }); setCoupon(emptyCoupon); setMessage("Coupon created."); await refresh(); } catch (e) { setError(e.message); }
  }
  async function createOffer(event) {
    event.preventDefault(); setError(""); setMessage("");
    try { await apiFetch("/admin/offers", { method: "POST", body: JSON.stringify({ ...offer, startsAt: optionalDate(offer.startsAt), endsAt: optionalDate(offer.endsAt) }) }); setOffer(emptyOffer); setMessage("Offer published."); await refresh(); } catch (e) { setError(e.message); }
  }
  async function createBanner(event) {
    event.preventDefault(); setError(""); setMessage("");
    try { await apiFetch("/admin/banners", { method: "POST", body: JSON.stringify({ ...banner, priority: Number(banner.priority || 0), startsAt: optionalDate(banner.startsAt), endsAt: optionalDate(banner.endsAt) }) }); setBanner(emptyBanner); setMessage("Campaign banner published."); await refresh(); } catch (e) { setError(e.message); }
  }
  async function toggle(type, id, isActive) { try { await apiFetch(`/admin/${type}/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: !isActive }) }); await refresh(); } catch (e) { setError(e.message); } }

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">GROWTH</p><h1>Promotions & campaigns</h1><p>Control coupons, offer cards and homepage campaign banners from one place.</p></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

    <div className="admin-promo-grid phase3-admin-promo">
      <form className="admin-panel admin-form" onSubmit={createBanner}><div className="admin-panel-head"><div><h2>Homepage campaign</h2><p>Primary mobile/desktop hero banner.</p></div></div><div className="admin-field-grid two"><label>Placement<select value={banner.placement} onChange={(e) => setBanner({ ...banner, placement: e.target.value })}><option value="HOME_HERO">Home hero</option><option value="HOME_STRIP">Home strip</option></select></label><label>Eyebrow<input value={banner.eyebrow} onChange={(e) => setBanner({ ...banner, eyebrow: e.target.value })} /></label></div><label>Headline<input required value={banner.title} onChange={(e) => setBanner({ ...banner, title: e.target.value })} placeholder="Herbal care for stronger-looking hair" /></label><label>Description<textarea value={banner.description} onChange={(e) => setBanner({ ...banner, description: e.target.value })} /></label><div className="admin-field-grid two"><label>Desktop image URL<input type="url" value={banner.imageUrl} onChange={(e) => setBanner({ ...banner, imageUrl: e.target.value })} placeholder="https://..." /></label><label>Mobile image URL<input type="url" value={banner.mobileImageUrl} onChange={(e) => setBanner({ ...banner, mobileImageUrl: e.target.value })} placeholder="Optional portrait image" /></label></div><div className="admin-field-grid two"><label>Button text<input value={banner.ctaText} onChange={(e) => setBanner({ ...banner, ctaText: e.target.value })} /></label><label>Button link<input value={banner.ctaLink} onChange={(e) => setBanner({ ...banner, ctaLink: e.target.value })} /></label></div><div className="admin-field-grid three"><label>Background<input value={banner.background} onChange={(e) => setBanner({ ...banner, background: e.target.value })} placeholder="#d8a693" /></label><label>Text color<input value={banner.textColor} onChange={(e) => setBanner({ ...banner, textColor: e.target.value })} placeholder="#11251c" /></label><label>Priority<input type="number" min="0" value={banner.priority} onChange={(e) => setBanner({ ...banner, priority: e.target.value })} /></label></div><div className="admin-field-grid two"><label>Starts<input type="datetime-local" value={banner.startsAt} onChange={(e) => setBanner({ ...banner, startsAt: e.target.value })} /></label><label>Ends<input type="datetime-local" value={banner.endsAt} onChange={(e) => setBanner({ ...banner, endsAt: e.target.value })} /></label></div><button className="button">Publish campaign</button></form>

      <form className="admin-panel admin-form" onSubmit={createCoupon}><div className="admin-panel-head"><div><h2>Create coupon</h2><p>Customers enter this code at checkout.</p></div></div><div className="admin-field-grid two"><label>Code<input required value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value.toUpperCase() })} placeholder="RISEORA20" /></label><label>Discount type<select value={coupon.discountType} onChange={(e) => setCoupon({ ...coupon, discountType: e.target.value })}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount</option></select></label></div><label>Description<input value={coupon.description} onChange={(e) => setCoupon({ ...coupon, description: e.target.value })} /></label><div className="admin-field-grid three"><label>Discount value<input required min="0" step="0.01" type="number" value={coupon.discountValue} onChange={(e) => setCoupon({ ...coupon, discountValue: e.target.value })} /></label><label>Minimum order<input min="0" step="0.01" type="number" value={coupon.minOrderAmount} onChange={(e) => setCoupon({ ...coupon, minOrderAmount: e.target.value })} /></label><label>Max discount<input min="0" step="0.01" type="number" value={coupon.maxDiscountAmount} onChange={(e) => setCoupon({ ...coupon, maxDiscountAmount: e.target.value })} /></label></div><label>Usage limit<input min="1" type="number" value={coupon.usageLimit} onChange={(e) => setCoupon({ ...coupon, usageLimit: e.target.value })} /></label><div className="admin-field-grid two"><label>Starts<input type="datetime-local" value={coupon.startsAt} onChange={(e) => setCoupon({ ...coupon, startsAt: e.target.value })} /></label><label>Ends<input type="datetime-local" value={coupon.endsAt} onChange={(e) => setCoupon({ ...coupon, endsAt: e.target.value })} /></label></div><button className="button">Create coupon</button></form>

      <form className="admin-panel admin-form" onSubmit={createOffer}><div className="admin-panel-head"><div><h2>Offer card</h2><p>Promotional tile shown on the storefront.</p></div></div><label>Title<input required value={offer.title} onChange={(e) => setOffer({ ...offer, title: e.target.value })} /></label><label>Description<textarea value={offer.description} onChange={(e) => setOffer({ ...offer, description: e.target.value })} /></label><div className="admin-field-grid two"><label>Badge<input value={offer.badge} onChange={(e) => setOffer({ ...offer, badge: e.target.value })} placeholder="LIMITED TIME" /></label><label>CTA text<input value={offer.ctaText} onChange={(e) => setOffer({ ...offer, ctaText: e.target.value })} /></label></div><label>CTA link<input value={offer.ctaLink} onChange={(e) => setOffer({ ...offer, ctaLink: e.target.value })} /></label><div className="admin-field-grid two"><label>Starts<input type="datetime-local" value={offer.startsAt} onChange={(e) => setOffer({ ...offer, startsAt: e.target.value })} /></label><label>Ends<input type="datetime-local" value={offer.endsAt} onChange={(e) => setOffer({ ...offer, endsAt: e.target.value })} /></label></div><button className="button">Publish offer</button></form>
    </div>

    <div className="admin-panel-grid promo-lists">
      <PromoList title="Campaigns" items={banners} empty="No campaign banners yet." getMeta={(i) => i.placement.replace("_", " ")} onToggle={(i) => toggle("banners", i.id, i.isActive)} />
      <PromoList title="Coupons" items={coupons} empty="No coupons yet." getTitle={(i) => i.code} getMeta={(i) => i.discountType === "PERCENTAGE" ? `${Number(i.discountValue)}% off • used ${i.usageCount}${i.usageLimit ? `/${i.usageLimit}` : ""}` : `₹${Number(i.discountValue).toFixed(0)} off`} onToggle={(i) => toggle("coupons", i.id, i.isActive)} />
      <PromoList title="Offers" items={offers} empty="No offers yet." getMeta={(i) => i.badge || "Storefront offer"} onToggle={(i) => toggle("offers", i.id, i.isActive)} />
    </div>
  </>;
}

function PromoList({ title, items, empty, getTitle = (i) => i.title, getMeta, onToggle }) {
  return <section className="admin-panel"><div className="admin-panel-head"><div><h2>{title}</h2><p>{items.length} total</p></div></div>{items.length === 0 ? <div className="admin-empty">{empty}</div> : <div className="admin-promo-list">{items.map((item) => <div className="admin-promo-row" key={item.id}><div><strong>{getTitle(item)}</strong><span>{getMeta(item)}</span></div><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => onToggle(item)}>{item.isActive ? "Active" : "Inactive"}</button></div>)}</div>}</section>;
}
