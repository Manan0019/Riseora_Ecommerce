import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";
import Seo from "../components/Seo";
import { Icon } from "../components/Icons";
import { trackEvent } from "../lib/analytics";

function imageFor(deal) {
  if (deal?.imageUrl) return mediaUrl(deal.imageUrl);
  const product = deal?.resolvedItems?.[0]?.variant?.product || deal?.buyVariant?.product || deal?.giftVariant?.product;
  const image = product?.images?.find((item) => item.isPrimary) || product?.images?.[0];
  return mediaUrl(image?.url);
}

function money(value) { return `₹${Number(value || 0).toFixed(0)}`; }

export default function DealDetails() {
  const { slug } = useParams();
  const { addDeal } = useCart();
  const [deal, setDeal] = useState(null);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setError(""); setDeal(null);
    apiFetch(`/promotions/deals/${encodeURIComponent(slug)}`)
      .then((response) => setDeal(response.data))
      .catch((err) => setError(err.message));
  }, [slug]);

  const itemValue = useMemo(() => {
    if (!deal) return 0;
    if (deal.type === "BUNDLE_DISCOUNT") return (deal.resolvedItems || []).reduce((sum, item) => sum + Number(item.variant?.sellingPrice || 0) * Number(item.quantity || 1), 0);
    if (deal.type === "BUY_X_GET_Y") return Number(deal.buyVariant?.sellingPrice || 0) * Number(deal.buyQuantity || 1);
    return Number(deal.minOrderAmount || 0);
  }, [deal]);

  if (error) return <div className="container page-space"><p className="alert error">{error}</p><Link className="button" to="/offers">View current offers</Link></div>;
  if (!deal) return <div className="container page-space"><div className="skeleton-card tall" /></div>;

  const image = imageFor(deal);
  const available = deal.type === "BUNDLE_DISCOUNT"
    ? (deal.resolvedItems || []).length >= 2 && deal.resolvedItems.every((item) => Number(item.variant?.stockQuantity || 0) >= Number(item.quantity || 1))
    : deal.type === "BUY_X_GET_Y"
      ? Number(deal.buyVariant?.stockQuantity || 0) >= Number(deal.buyQuantity || 1) && Number(deal.giftVariant?.stockQuantity || 0) >= Number(deal.giftQuantity || 1)
      : Number(deal.giftVariant?.stockQuantity || 0) >= Number(deal.giftQuantity || 1);

  function addOffer() {
    if (!available || deal.type === "GIFT_WITH_PURCHASE") return;
    if (addDeal(deal)) {
      setAdded(true);
      trackEvent("merchandising_deal_add", { deal_name: deal.name, deal_type: deal.type, location: "deal_detail" });
      window.setTimeout(() => setAdded(false), 1800);
    }
  }

  return <>
    <Seo title={deal.name} description={deal.description || "Riseora automatic offer and combo details."} />
    <section className="phase28-deal-hero">
      <div className="container phase28-deal-hero-grid">
        <div className="phase28-deal-art">{image ? <img src={image} alt={deal.name} /> : <span>R</span>}<b>{deal.badge || "RISEORA OFFER"}</b></div>
        <div className="phase28-deal-copy">
          <p className="phase3-eyebrow">AUTOMATIC VALUE</p>
          <h1>{deal.name}</h1>
          {deal.description && <p>{deal.description}</p>}
          {deal.type === "BUNDLE_DISCOUNT" && <div className="phase28-deal-value"><strong>{Number(deal.discountPercent || 0).toFixed(0)}% OFF</strong><span>when the complete combo is in your cart</span></div>}
          {deal.type === "BUY_X_GET_Y" && <div className="phase28-deal-value"><strong>BUY {deal.buyQuantity} · GET {deal.giftQuantity}</strong><span>{deal.giftVariant?.product?.name || "Free gift"} is added securely at checkout</span></div>}
          {deal.type === "GIFT_WITH_PURCHASE" && <div className="phase28-deal-value"><strong>FREE GIFT ABOVE {money(deal.minOrderAmount)}</strong><span>{deal.giftVariant?.product?.name || "Complimentary Riseora gift"}</span></div>}
          <div className="phase28-deal-hero-actions">
            {deal.type === "GIFT_WITH_PURCHASE"
              ? available ? <Link className="button" to="/shop">SHOP TO UNLOCK <Icon name="arrow" size={17} /></Link> : <button className="button" disabled>CURRENTLY UNAVAILABLE</button>
              : <button className="button" disabled={!available} onClick={addOffer}>{!available ? "CURRENTLY UNAVAILABLE" : added ? "ADDED ✓" : deal.type === "BUNDLE_DISCOUNT" ? "ADD COMPLETE COMBO" : "ADD QUALIFYING ITEMS"}</button>}
            <Link className="button button-secondary" to="/offers">ALL OFFERS</Link>
          </div>
          <small>Riseora recalculates stock, prices and the best eligible automatic offer again at checkout.</small>
        </div>
      </div>
    </section>

    <section className="container phase3-section phase28-deal-breakdown">
      <div className="section-title-row"><div><p className="phase3-eyebrow">WHAT'S INCLUDED</p><h2>{deal.type === "GIFT_WITH_PURCHASE" ? "Your complimentary gift" : "Offer breakdown"}</h2></div></div>
      {deal.type === "BUNDLE_DISCOUNT" && <div className="phase28-deal-items">{(deal.resolvedItems || []).map((item) => <DealProduct key={item.variantId} variant={item.variant} quantity={item.quantity} />)}</div>}
      {deal.type === "BUY_X_GET_Y" && <div className="phase28-deal-items"><DealProduct variant={deal.buyVariant} quantity={deal.buyQuantity} label="BUY" /><DealProduct variant={deal.giftVariant} quantity={deal.giftQuantity} label="FREE" complimentary /></div>}
      {deal.type === "GIFT_WITH_PURCHASE" && <div className="phase28-deal-items"><DealProduct variant={deal.giftVariant} quantity={deal.giftQuantity} label="FREE GIFT" complimentary /></div>}
      <div className="phase28-deal-terms">
        <span><b>Automatic:</b> no coupon code required.</span>
        <span><b>Checkout verified:</b> eligibility, stock and final savings are recalculated server-side.</span>
        <span><b>Current trigger:</b> {deal.type === "BUNDLE_DISCOUNT" ? `${money(itemValue)} regular combo value before ${Number(deal.discountPercent || 0).toFixed(0)}% saving.` : deal.type === "BUY_X_GET_Y" ? `${deal.buyQuantity} qualifying item${Number(deal.buyQuantity) === 1 ? "" : "s"}.` : `${money(deal.minOrderAmount)} merchandise threshold.`}</span>
      </div>
    </section>
  </>;
}

function DealProduct({ variant, quantity, label = "INCLUDED", complimentary = false }) {
  const product = variant?.product;
  const imageItem = product?.images?.find((item) => item.isPrimary) || product?.images?.[0];
  if (!variant || !product) return null;
  return <article className="phase28-deal-product">
    <Link to={`/product/${product.slug}`} className="phase28-deal-product-image">{imageItem?.url ? <img src={mediaUrl(imageItem.url)} alt={product.name} /> : <span>R</span>}<b>{label}</b></Link>
    <div><Link to={`/product/${product.slug}`}><strong>{product.name}</strong></Link><small>{variant.name} · Qty {quantity}</small><span>{complimentary ? "Complimentary when eligible" : money(Number(variant.sellingPrice || 0) * Number(quantity || 1))}</span></div>
  </article>;
}
