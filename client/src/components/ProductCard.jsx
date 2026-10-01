import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { Icon } from "./Icons";
import ProductQuickView from "./ProductQuickView";
import OptimizedImage from "./OptimizedImage";

export default function ProductCard({ product, compact = false }) {
  const { addItem } = useCart();
  const { toggle, has } = useWishlist();
  const [activeImage, setActiveImage] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  const images = useMemo(() => {
    const source = Array.isArray(product.images) ? product.images.filter((item) => item?.url) : [];
    const primaryIndex = source.findIndex((item) => item.isPrimary);
    if (primaryIndex <= 0) return source;
    return [source[primaryIndex], ...source.filter((_, index) => index !== primaryIndex)];
  }, [product.images]);

  useEffect(() => {
    setActiveImage(0);
    setHovering(false);
    setQuickOpen(false);
  }, [product.id]);

  useEffect(() => {
    if (!hovering || images.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveImage((value) => (value + 1) % images.length);
    }, 950);
    return () => window.clearInterval(timer);
  }, [hovering, images.length]);

  function beginSlideshow() {
    if (images.length <= 1) return;
    if (window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches === false) return;
    setHovering(true);
    const next = images[(activeImage + 1) % images.length];
    if (next?.url) {
      const preload = new Image();
      preload.src = mediaUrl(next.url);
    }
  }

  function stopSlideshow() {
    setHovering(false);
    setActiveImage(0);
  }

  const variant = product.variants?.[0];
  const imageItem = images[activeImage] || images[0];
  const image = mediaUrl(imageItem?.url);
  const inStock = variant && Number(variant.stockQuantity) > 0;
  const sellingPrice = Number(variant?.sellingPrice || 0);
  const mrp = Number(variant?.mrp || 0);
  const discount = mrp > sellingPrice && mrp > 0 ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;
  const wished = has(product.id);

  return <>
    <article className={`product-card mc-product-card phase16-product-card ${compact ? "compact" : ""}`} onMouseEnter={beginSlideshow} onMouseLeave={stopSlideshow}>
      <div className="product-image-shell">
        <Link to={`/product/${product.slug}`} className="product-image-wrap" aria-label={product.name}>
          <div className="product-badge-stack">
            {product.badge && <span className="brand-badge">{product.badge}</span>}
            {discount > 0 && <span className="sale-badge">{discount}% OFF</span>}
          </div>
          {image ? (
            <OptimizedImage
              key={`${product.id}-${activeImage}`}
              className="product-image product-image-transition"
              src={image}
              alt={imageItem?.altText || product.name}
              loading="lazy"
              decoding="async"
              width="420"
              height="420"
            />
          ) : (
            <div className="image-placeholder"><span>R</span><small>Riseora</small></div>
          )}
          {images.length > 1 && (
            <div className="product-image-dots" aria-hidden="true">
              {images.slice(0, 6).map((item, index) => <span key={item.id || `${item.url}-${index}`} className={index === activeImage ? "active" : ""} />)}
            </div>
          )}
          {images.length > 1 && <span className="product-image-count">{activeImage + 1}/{images.length}</span>}
        </Link>
        <button className={wished ? "wishlist-button active" : "wishlist-button"} onClick={() => toggle(product)} aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}>
          <Icon name="heart" size={18} />
        </button>
        <button className="phase16-quick-trigger" type="button" onClick={() => setQuickOpen(true)} aria-label={`Quick view ${product.name}`} title="Quick view">
          <Icon name="eye" size={18} /> <span>QUICK VIEW</span>
        </button>
      </div>
      <div className="product-card-body">
        <div className="product-meta-line">
          <p className="product-kicker">{product.category?.name || "Riseora"}</p>
          {product.reviewCount > 0 && <span className="mini-rating">★ {product.ratingAverage} <small>({product.reviewCount})</small></span>}
        </div>
        <Link className="product-title" to={`/product/${product.slug}`}>{product.name}</Link>
        {!compact && <p className="product-copy">{product.shortDescription || "Thoughtful herbal care for your daily ritual."}</p>}
        {variant ? (
          <>
            <div className="product-price-row"><strong>₹{sellingPrice.toFixed(0)}</strong>{mrp > sellingPrice && <del>₹{mrp.toFixed(0)}</del>}{discount > 0 && <span>{discount}% off</span>}</div>
            <button className="card-add-button" disabled={!inStock} onClick={() => inStock && addItem(product, variant, 1)}>{inStock ? <>ADD TO CART <Icon name="plus" size={16} strokeWidth={2.2} /></> : "SOLD OUT"}</button>
          </>
        ) : <p className="muted product-unavailable">No active variant</p>}
      </div>
    </article>
    <ProductQuickView product={product} open={quickOpen} onClose={() => setQuickOpen(false)} />
  </>;
}