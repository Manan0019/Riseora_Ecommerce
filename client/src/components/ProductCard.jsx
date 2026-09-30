import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { Icon } from "./Icons";

export default function ProductCard({ product, compact = false }) {
  const { addItem } = useCart();
  const { toggle, has } = useWishlist();
  const variant = product.variants?.[0];
  const image = product.images?.[0]?.url;
  const inStock = variant && Number(variant.stockQuantity) > 0;
  const sellingPrice = Number(variant?.sellingPrice || 0);
  const mrp = Number(variant?.mrp || 0);
  const discount = mrp > sellingPrice && mrp > 0 ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;
  const wished = has(product.id);

  return (
    <article className={`product-card mc-product-card ${compact ? "compact" : ""}`}>
      <div className="product-image-shell">
        <Link to={`/product/${product.slug}`} className="product-image-wrap" aria-label={product.name}>
          <div className="product-badge-stack">
            {product.badge && <span className="brand-badge">{product.badge}</span>}
            {discount > 0 && <span className="sale-badge">{discount}% OFF</span>}
          </div>
          {image ? <img className="product-image" src={image} alt={product.images?.[0]?.altText || product.name} loading="lazy" /> : <div className="image-placeholder"><span>R</span><small>Riseora</small></div>}
        </Link>
        <button className={wished ? "wishlist-button active" : "wishlist-button"} onClick={() => toggle(product)} aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}>
          <Icon name="heart" size={18} />
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
  );
}
