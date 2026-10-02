import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";
import { trackEvent } from "../lib/analytics";

function giftImage(deal) {
  const product = deal?.giftVariant?.product || deal?.resolvedItems?.[0]?.variant?.product || deal?.buyVariant?.product;
  const image = product?.images?.find((item) => item.isPrimary) || product?.images?.[0];
  return mediaUrl(image?.url);
}

function cartSignature(items) {
  return items.map((item) => `${item.variantId}:${item.quantity}`).sort().join("|");
}

export default function OfferProgress({ compact = false, actionable = false }) {
  const { items, addItems } = useCart();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const signature = useMemo(() => cartSignature(items), [items]);

  useEffect(() => {
    if (!items.length) { setPreview(null); return undefined; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      apiFetch("/promotions/deals/preview", {
        method: "POST",
        body: JSON.stringify({ items: items.map((item) => ({ variantId: item.variantId, quantity: Number(item.quantity || 1) })) }),
      })
        .then((response) => { if (!cancelled) setPreview(response.data || null); })
        .catch(() => { if (!cancelled) setPreview(null); });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [signature]);

  const row = useMemo(() => {
    const rows = preview?.deals || [];
    if (!rows.length) return null;
    return rows.find((item) => item.winner)
      || rows.find((item) => item.available && !item.eligible && item.progress > 0)
      || rows.find((item) => item.available && !item.eligible)
      || null;
  }, [preview]);

  if (!row?.deal) return null;
  const deal = row.deal;
  const image = giftImage(deal);
  const unlocked = Boolean(row.eligible);

  function addMissingItems() {
    if (busy || unlocked) return;
    const additions = [];
    if (deal.type === "BUNDLE_DISCOUNT") {
      for (const missing of row.missingItems || []) {
        const resolved = (deal.resolvedItems || []).find((item) => item.variantId === missing.variantId);
        if (resolved?.variant?.product && Number(missing.missingQuantity || 0) > 0) {
          additions.push({ product: resolved.variant.product, variant: resolved.variant, quantity: Number(missing.missingQuantity) });
        }
      }
    } else if (deal.type === "BUY_X_GET_Y" && deal.buyVariant?.product) {
      const missing = Number(row.missingItems?.[0]?.missingQuantity || 0);
      if (missing > 0) additions.push({ product: deal.buyVariant.product, variant: deal.buyVariant, quantity: missing });
    }
    if (!additions.length) return;
    setBusy(true);
    const ok = addItems(additions);
    trackEvent("merchandising_offer_action", { deal_name: deal.name, deal_type: deal.type, action: "add_missing_items" });
    window.setTimeout(() => setBusy(false), ok ? 500 : 200);
  }

  return (
    <div className={`phase14-offer-progress phase28-offer-advisor ${compact ? "compact" : ""} ${unlocked ? "unlocked" : ""}`}>
      <div className="phase14-offer-progress-copy">
        {image ? <img src={image} alt="" /> : <span className="phase14-offer-gift">✦</span>}
        <div>
          <small>{row.winner ? "BEST OFFER UNLOCKED" : unlocked ? "OFFER UNLOCKED" : "NEXT BEST OFFER"}</small>
          <strong>{row.message || deal.name}</strong>
          <span>{unlocked ? "The final eligible automatic offer is recalculated securely at checkout." : deal.name}</span>
        </div>
      </div>
      <div className="phase14-offer-meter" aria-hidden="true"><span style={{ width: `${Math.max(5, Math.round(Number(row.progress || 0) * 100))}%` }} /></div>
      {!compact && actionable && !unlocked && (
        <div className="phase28-offer-actions">
          {(deal.type === "BUNDLE_DISCOUNT" || deal.type === "BUY_X_GET_Y") && (row.missingItems || []).length > 0
            ? <button type="button" className="state-toggle active" onClick={addMissingItems} disabled={busy}>{busy ? "ADDING…" : "ADD WHAT'S MISSING"}</button>
            : <Link className="state-toggle active" to="/shop">SHOP TO UNLOCK</Link>}
          <Link className="state-toggle" to={`/offers/${deal.slug}`}>VIEW OFFER</Link>
        </div>
      )}
      {compact && <Link className="phase28-mini-offer-link" to="/cart">See offer progress →</Link>}
    </div>
  );
}
