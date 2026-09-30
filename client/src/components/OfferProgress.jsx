import { useEffect, useMemo, useState } from "react";
import { apiFetch, mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";

function giftImage(deal) {
  const product = deal?.giftVariant?.product;
  const image = product?.images?.find((item) => item.isPrimary) || product?.images?.[0];
  return mediaUrl(image?.url);
}

export default function OfferProgress({ compact = false }) {
  const { items, subtotal } = useCart();
  const [deals, setDeals] = useState([]);

  useEffect(() => {
    apiFetch("/promotions/deals")
      .then((response) => setDeals(Array.isArray(response.data) ? response.data : []))
      .catch(() => setDeals([]));
  }, []);

  const progress = useMemo(() => {
    if (!items.length || !deals.length) return null;
    const quantities = new Map(items.map((item) => [item.variantId, Number(item.quantity || 0)]));

    const giftDeals = deals
      .filter((deal) => deal.type === "GIFT_WITH_PURCHASE" && deal.giftVariant && Number(deal.giftVariant.stockQuantity || 0) >= Math.max(1, Number(deal.giftQuantity || 1)))
      .map((deal) => {
        const threshold = Number(deal.minOrderAmount || 0);
        const remaining = Math.max(0, threshold - subtotal);
        const ratio = threshold > 0 ? Math.min(1, subtotal / threshold) : 1;
        return { type: "gift", deal, remaining, ratio, score: remaining > 0 ? remaining : -threshold };
      })
      .sort((a, b) => a.score - b.score);

    const bogoDeals = deals
      .filter((deal) => deal.type === "BUY_X_GET_Y" && deal.buyVariant && deal.giftVariant && Number(deal.giftVariant.stockQuantity || 0) >= Math.max(1, Number(deal.giftQuantity || 1)))
      .map((deal) => {
        const required = Math.max(1, Number(deal.buyQuantity || 1));
        const current = quantities.get(deal.buyVariant.id) || 0;
        const missing = current >= required ? 0 : required - current;
        return { type: "bogo", deal, missing, ratio: Math.min(1, current / required), score: missing };
      })
      .sort((a, b) => a.score - b.score);

    const qualifiedGift = giftDeals.find((item) => item.remaining === 0);
    const qualifiedBogo = bogoDeals.find((item) => item.missing === 0);
    if (qualifiedGift) return qualifiedGift;
    if (qualifiedBogo) return qualifiedBogo;

    const nearestGift = giftDeals.find((item) => item.remaining > 0);
    const nearestBogo = bogoDeals.find((item) => item.missing > 0);
    if (!nearestGift) return nearestBogo || null;
    if (!nearestBogo) return nearestGift;

    // Prefer the gift meter when both are close; money-based progress is easier for customers to act on.
    return nearestGift.ratio >= nearestBogo.ratio - 0.08 ? nearestGift : nearestBogo;
  }, [deals, items, subtotal]);

  if (!progress) return null;
  const { deal } = progress;
  const image = giftImage(deal);
  const unlocked = progress.type === "gift" ? progress.remaining === 0 : progress.missing === 0;

  return (
    <div className={`phase14-offer-progress ${compact ? "compact" : ""} ${unlocked ? "unlocked" : ""}`}>
      <div className="phase14-offer-progress-copy">
        {image ? <img src={image} alt="" /> : <span className="phase14-offer-gift">✦</span>}
        <div>
          <small>{unlocked ? "OFFER UNLOCKED" : "UNLOCK MORE VALUE"}</small>
          {progress.type === "gift" ? (
            unlocked
              ? <strong>{deal.name} is eligible at checkout</strong>
              : <strong>Add ₹{Math.ceil(progress.remaining)} more to unlock {deal.giftVariant?.product?.name || "your free gift"}</strong>
          ) : (
            unlocked
              ? <strong>{deal.name} is eligible at checkout</strong>
              : <strong>Add {progress.missing} more {deal.buyVariant?.product?.name || "qualifying item"} to unlock {deal.name}</strong>
          )}
          <span>Riseora securely applies the best eligible automatic offer at checkout.</span>
        </div>
      </div>
      <div className="phase14-offer-meter" aria-hidden="true"><span style={{ width: `${Math.max(5, Math.round(progress.ratio * 100))}%` }} /></div>
    </div>
  );
}
