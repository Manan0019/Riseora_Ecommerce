import { useEffect, useState } from "react";
import { apiFetch } from "../../api/http";

const emptyCoupon = { code: "", description: "", discountType: "PERCENTAGE", discountValue: "", minOrderAmount: "", maxDiscountAmount: "", usageLimit: "", startsAt: "", endsAt: "" };
const emptyOffer = { title: "", description: "", badge: "", ctaText: "Shop now", ctaLink: "/shop", startsAt: "", endsAt: "" };

function optionalNumber(value) { return value === "" ? undefined : Number(value); }
function optionalDate(value) { return value ? new Date(value).toISOString() : undefined; }

export default function AdminPromotions() {
  const [coupons, setCoupons] = useState([]);
  const [offers, setOffers] = useState([]);
  const [coupon, setCoupon] = useState(emptyCoupon);
  const [offer, setOffer] = useState(emptyOffer);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const [couponResponse, offerResponse] = await Promise.all([apiFetch("/admin/coupons"), apiFetch("/admin/offers")]);
    setCoupons(couponResponse.data); setOffers(offerResponse.data);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function createCoupon(event) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      await apiFetch("/admin/coupons", { method: "POST", body: JSON.stringify({ code: coupon.code.toUpperCase(), description: coupon.description, discountType: coupon.discountType, discountValue: Number(coupon.discountValue), minOrderAmount: optionalNumber(coupon.minOrderAmount), maxDiscountAmount: optionalNumber(coupon.maxDiscountAmount), usageLimit: optionalNumber(coupon.usageLimit), startsAt: optionalDate(coupon.startsAt), endsAt: optionalDate(coupon.endsAt) }) });
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
  async function toggle(type, id, isActive) { try { await apiFetch(`/admin/${type}/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: !isActive }) }); await refresh(); } catch (e) { setError(e.message); } }

  return (
    <>
      <div className="admin-page-heading"><div><p className="eyebrow">PROMOTIONS</p><h1>Coupons & offers</h1><p>Create checkout coupons and storefront promotional banners.</p></div></div>
      {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
      <div className="admin-promo-grid">
        <form className="admin-panel admin-form" onSubmit={createCoupon}><div className="admin-panel-head"><div><h2>Create coupon</h2><p>Customers enter this code at checkout.</p></div></div><div className="admin-field-grid two"><label>Code<input required value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value.toUpperCase() })} placeholder="RISEORA20" /></label><label>Discount type<select value={coupon.discountType} onChange={(e) => setCoupon({ ...coupon, discountType: e.target.value })}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount</option></select></label></div><label>Description<input value={coupon.description} onChange={(e) => setCoupon({ ...coupon, description: e.target.value })} /></label><div className="admin-field-grid three"><label>Discount value<input required min="0" step="0.01" type="number" value={coupon.discountValue} onChange={(e) => setCoupon({ ...coupon, discountValue: e.target.value })} /></label><label>Minimum order<input min="0" step="0.01" type="number" value={coupon.minOrderAmount} onChange={(e) => setCoupon({ ...coupon, minOrderAmount: e.target.value })} /></label><label>Max discount<input min="0" step="0.01" type="number" value={coupon.maxDiscountAmount} onChange={(e) => setCoupon({ ...coupon, maxDiscountAmount: e.target.value })} /></label></div><div className="admin-field-grid three"><label>Usage limit<input min="1" type="number" value={coupon.usageLimit} onChange={(e) => setCoupon({ ...coupon, usageLimit: e.target.value })} /></label><label>Starts<input type="datetime-local" value={coupon.startsAt} onChange={(e) => setCoupon({ ...coupon, startsAt: e.target.value })} /></label><label>Ends<input type="datetime-local" value={coupon.endsAt} onChange={(e) => setCoupon({ ...coupon, endsAt: e.target.value })} /></label></div><button className="button">Create coupon</button></form>

        <form className="admin-panel admin-form" onSubmit={createOffer}><div className="admin-panel-head"><div><h2>Publish offer</h2><p>Show a promotional card on the storefront.</p></div></div><label>Title<input required value={offer.title} onChange={(e) => setOffer({ ...offer, title: e.target.value })} placeholder="Festive care offer" /></label><label>Description<textarea value={offer.description} onChange={(e) => setOffer({ ...offer, description: e.target.value })} /></label><div className="admin-field-grid two"><label>Badge<input value={offer.badge} onChange={(e) => setOffer({ ...offer, badge: e.target.value })} placeholder="LIMITED OFFER" /></label><label>Button text<input value={offer.ctaText} onChange={(e) => setOffer({ ...offer, ctaText: e.target.value })} /></label></div><label>Button link<input value={offer.ctaLink} onChange={(e) => setOffer({ ...offer, ctaLink: e.target.value })} placeholder="/shop" /></label><div className="admin-field-grid two"><label>Starts<input type="datetime-local" value={offer.startsAt} onChange={(e) => setOffer({ ...offer, startsAt: e.target.value })} /></label><label>Ends<input type="datetime-local" value={offer.endsAt} onChange={(e) => setOffer({ ...offer, endsAt: e.target.value })} /></label></div><button className="button">Publish offer</button></form>
      </div>

      <div className="admin-panel-grid promo-lists">
        <section className="admin-panel"><div className="admin-panel-head"><div><h2>Coupons</h2><p>{coupons.length} total</p></div></div>{coupons.length === 0 ? <div className="admin-empty">No coupons yet.</div> : <div className="admin-promo-list">{coupons.map((item) => <div className="admin-promo-row" key={item.id}><div><strong>{item.code}</strong><span>{item.discountType === "PERCENTAGE" ? `${Number(item.discountValue)}% off` : `₹${Number(item.discountValue).toFixed(0)} off`} • used {item.usageCount}{item.usageLimit ? `/${item.usageLimit}` : ""}</span></div><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => toggle("coupons", item.id, item.isActive)}>{item.isActive ? "Active" : "Inactive"}</button></div>)}</div>}</section>
        <section className="admin-panel"><div className="admin-panel-head"><div><h2>Offers</h2><p>{offers.length} total</p></div></div>{offers.length === 0 ? <div className="admin-empty">No offers yet.</div> : <div className="admin-promo-list">{offers.map((item) => <div className="admin-promo-row" key={item.id}><div><strong>{item.title}</strong><span>{item.badge || "Storefront offer"}</span></div><button className={item.isActive ? "state-toggle active" : "state-toggle"} onClick={() => toggle("offers", item.id, item.isActive)}>{item.isActive ? "Active" : "Inactive"}</button></div>)}</div>}</section>
      </div>
    </>
  );
}
