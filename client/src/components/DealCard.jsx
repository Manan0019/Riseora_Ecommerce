import { useState } from "react";
import { Link } from "react-router-dom";
import { mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";
import { Icon } from "./Icons";

function dealImage(deal) {
  if (deal.imageUrl) return mediaUrl(deal.imageUrl);
  const product = deal.resolvedItems?.[0]?.variant?.product || deal.buyVariant?.product || deal.giftVariant?.product;
  const image = product?.images?.find((item) => item.isPrimary) || product?.images?.[0];
  return mediaUrl(image?.url);
}

export default function DealCard({ deal, compact = false }) {
  const { addDeal } = useCart();
  const [added, setAdded] = useState(false);
  const image = dealImage(deal);
  const actionable = deal.type !== "GIFT_WITH_PURCHASE";
  const available = deal.type === "BUNDLE_DISCOUNT"
    ? (deal.resolvedItems || []).length >= 2 && (deal.resolvedItems || []).every((item) => Number(item.variant?.stockQuantity || 0) >= Number(item.quantity || 1))
    : deal.type === "BUY_X_GET_Y"
      ? Number(deal.buyVariant?.stockQuantity || 0) >= Number(deal.buyQuantity || 1) && Number(deal.giftVariant?.stockQuantity || 0) >= Number(deal.giftQuantity || 1)
      : true;

  function add() {
    if (!actionable || !available) return;
    const ok = addDeal(deal);
    if (ok) {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1800);
    }
  }

  return <article className={`deal-card ${compact ? "compact" : ""}`}>
    <div className="deal-media">{image ? <img src={image} alt={deal.name} loading="lazy" /> : <div className="deal-media-fallback">R</div>}<span>{deal.badge || (deal.type === "BUNDLE_DISCOUNT" ? "COMBO" : deal.type === "BUY_X_GET_Y" ? "BUY & GET" : "FREE GIFT")}</span></div>
    <div className="deal-body">
      <p className="phase3-eyebrow">RISEORA DEAL</p>
      <h3>{deal.name}</h3>
      {deal.description && <p>{deal.description}</p>}
      {deal.type === "BUNDLE_DISCOUNT" && <div className="deal-detail"><strong>{Number(deal.discountPercent || 0).toFixed(0)}% automatic combo saving</strong><small>{deal.resolvedItems?.map((item) => `${item.variant?.product?.name} ×${item.quantity}`).join(" + ")}</small></div>}
      {deal.type === "BUY_X_GET_Y" && <div className="deal-detail"><strong>Buy {deal.buyQuantity} • Get {deal.giftQuantity} free</strong><small>{deal.buyVariant?.product?.name} → {deal.giftVariant?.product?.name}</small></div>}
      {deal.type === "GIFT_WITH_PURCHASE" && <div className="deal-detail"><strong>Free gift above ₹{Number(deal.minOrderAmount || 0).toFixed(0)}</strong><small>{deal.giftVariant?.product?.name} {deal.giftVariant?.name ? `• ${deal.giftVariant.name}` : ""}</small></div>}
      {actionable ? <button className="button deal-cta" onClick={add} disabled={!available}>{!available ? "CURRENTLY UNAVAILABLE" : added ? "ADDED ✓" : deal.type === "BUNDLE_DISCOUNT" ? "ADD COMBO" : "ADD QUALIFYING ITEM"} {available && <Icon name="plus" size={16} />}</button> : <Link className="button deal-cta" to="/shop">SHOP & UNLOCK <Icon name="arrow" size={16} /></Link>}
    </div>
  </article>;
}
