import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { Icon } from "./Icons";

export default function ProductQuickView({ product, open, onClose }) {
  const navigate = useNavigate();
  const { addItem, startBuyNow } = useCart();
  const { toggle, has } = useWishlist();
  const [detail, setDetail] = useState(product || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    if (!open || !product?.slug) return undefined;
    let cancelled = false;
    setDetail(product);
    setError("");
    setLoading(true);
    setQuantity(1);
    setActiveImage(0);
    apiFetch(`/products/${encodeURIComponent(product.slug)}`)
      .then((response) => {
        if (cancelled) return;
        setDetail(response.data);
        setVariantId(response.data.variants?.[0]?.id || "");
        const primary = response.data.images?.findIndex((item) => item.isPrimary) ?? -1;
        setActiveImage(primary >= 0 ? primary : 0);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, product?.slug]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const current = detail || product;
  const images = useMemo(() => Array.isArray(current?.images) ? current.images.filter((item) => item?.url) : [], [current?.images]);
  const variant = current?.variants?.find((item) => item.id === variantId) || current?.variants?.[0];
  const imageItem = images[activeImage] || images[0];
  const inStock = variant && Number(variant.stockQuantity || 0) > 0;
  const sellingPrice = Number(variant?.sellingPrice || 0);
  const mrp = Number(variant?.mrp || 0);
  const purchaseLimit = Number.isInteger(Number(current?.maxPurchaseQuantity)) && Number(current?.maxPurchaseQuantity) > 0 ? Number(current.maxPurchaseQuantity) : null;
  const maxSelectableQuantity = Math.max(1, Math.min(Number(variant?.stockQuantity || 1), purchaseLimit ?? Number(variant?.stockQuantity || 1)));
  const wished = current ? has(current.id) : false;

  useEffect(() => {
    if (!variantId && current?.variants?.[0]?.id) setVariantId(current.variants[0].id);
  }, [current?.variants, variantId]);

  if (!open || !current) return null;

  function changeImage(direction) {
    if (images.length <= 1) return;
    setActiveImage((value) => (value + direction + images.length) % images.length);
  }

  function addCurrent() {
    if (!variant || !inStock) return;
    addItem(current, variant, Math.min(quantity, maxSelectableQuantity));
    onClose?.();
  }

  function buyCurrent() {
    if (!variant || !inStock) return;
    const started = startBuyNow(current, variant, Math.min(quantity, maxSelectableQuantity));
    if (!started) return;
    onClose?.();
    navigate("/checkout?mode=buy-now");
  }

  return createPortal(<div className="phase16-quick-layer phase19-quick-layer" role="dialog" aria-modal="true" aria-label={`Quick view ${current.name}`}>
    <button className="phase16-quick-backdrop" type="button" onClick={onClose} aria-label="Close quick view" />
    <section className="phase16-quick-view">
      <div className="phase16-quick-head"><div><small>QUICK VIEW</small><strong>{current.name}</strong></div><button type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button></div>
      {error ? <div className="phase16-quick-error"><p className="alert error">{error}</p><Link className="button button-secondary" to={`/product/${current.slug}`} onClick={onClose}>OPEN PRODUCT</Link></div> : <div className="phase16-quick-grid">
        <div className="phase16-quick-media">
          <div className="phase16-quick-image">
            {imageItem?.url ? <img src={mediaUrl(imageItem.url)} alt={imageItem.altText || current.name} /> : <div className="image-placeholder large"><span>R</span><small>Riseora</small></div>}
            {images.length > 1 && <><button className="phase16-quick-arrow prev" onClick={() => changeImage(-1)} aria-label="Previous image"><Icon name="arrow" size={18} /></button><button className="phase16-quick-arrow next" onClick={() => changeImage(1)} aria-label="Next image"><Icon name="arrow" size={18} /></button><span className="phase16-quick-count">{activeImage + 1}/{images.length}</span></>}
          </div>
          {images.length > 1 && <div className="phase16-quick-thumbs">{images.slice(0, 7).map((item, index) => <button key={item.id || `${item.url}-${index}`} className={index === activeImage ? "active" : ""} onClick={() => setActiveImage(index)}><img src={mediaUrl(item.url)} alt="" /></button>)}</div>}
        </div>
        <div className="phase16-quick-copy">
          {loading && <small className="phase16-quick-loading">Refreshing product details…</small>}
          <div className="phase16-quick-title-line"><Link to={`/shop?category=${current.category?.slug || ""}`} onClick={onClose}>{current.category?.name || "Riseora"}</Link><button className={wished ? "phase16-quick-wish active" : "phase16-quick-wish"} onClick={() => toggle(current)} aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}><Icon name="heart" size={19} /></button></div>
          <h2>{current.name}</h2>
          <p>{current.shortDescription || "Thoughtful herbal care for your everyday routine."}</p>
          {variant && <div className="phase16-quick-price"><strong>₹{sellingPrice.toFixed(0)}</strong>{mrp > sellingPrice && <del>₹{mrp.toFixed(0)}</del>}{mrp > sellingPrice && <span>{Math.round(((mrp-sellingPrice)/mrp)*100)}% OFF</span>}</div>}
          {current.variants?.length > 0 && <div className="phase16-quick-options"><span>CHOOSE SIZE</span><div>{current.variants.map((item) => <button key={item.id} className={variant?.id === item.id ? "active" : ""} onClick={() => { setVariantId(item.id); setQuantity(1); }}>{item.name}<small>{Number(item.stockQuantity || 0) > 0 ? "In stock" : "Sold out"}</small></button>)}</div></div>}
          {purchaseLimit && <div className="phase18-quick-limit"><Icon name="shield" size={14} /> Max {purchaseLimit} per order</div>}
          <div className="phase16-quick-buy phase17-quick-buy"><div className="quantity-stepper"><button onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><input aria-label="Quantity" type="number" min="1" max={maxSelectableQuantity} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(maxSelectableQuantity, Number(event.target.value) || 1)))} /><button onClick={() => setQuantity((value) => Math.min(maxSelectableQuantity, value + 1))}>+</button></div><div><button className="button button-secondary" disabled={!inStock} onClick={addCurrent}>{inStock ? "ADD TO CART" : "SOLD OUT"}</button><button className="button" disabled={!inStock} onClick={buyCurrent}>{inStock ? "BUY NOW" : "SOLD OUT"}</button></div></div>
          <Link className="phase16-full-link" to={`/product/${current.slug}`} onClick={onClose}>VIEW FULL DETAILS <Icon name="arrow" size={15} /></Link>
        </div>
      </div>}
    </section>
  </div>, document.body);
}
