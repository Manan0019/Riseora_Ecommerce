import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { Icon } from "./Icons";

export default function ProductCard({ product, compact = false }) {
  const { addItem } = useCart();
  const variant = product.variants?.[0];
  const image = product.images?.[0]?.url;
  const inStock = variant && Number(variant.stockQuantity) > 0;
  const sellingPrice = Number(variant?.sellingPrice || 0);
  const mrp = Number(variant?.mrp || 0);
  const discount = mrp > sellingPrice && mrp > 0 ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;

  return (
    <article className={`product-card ${compact ? "compact" : ""}`}>
      <Link to={`/product/${product.slug}`} className="product-image-wrap" aria-label={product.name}>
        {discount > 0 && <span className="sale-badge">{discount}% OFF</span>}
        {image ? (
          <img className="product-image" src={image} alt={product.images?.[0]?.altText || product.name} loading="lazy" />
        ) : (
          <div className="image-placeholder"><span>R</span><small>Riseora</small></div>
        )}
      </Link>
      <div className="product-card-body">
        <p className="product-kicker">{product.category?.name || "Riseora"}</p>
        <Link className="product-title" to={`/product/${product.slug}`}>{product.name}</Link>
        {!compact && <p className="product-copy">{product.shortDescription || "Thoughtful herbal care for your daily ritual."}</p>}
        {variant ? (
          <div className="product-buy-row">
            <div className="price-stack">
              <strong>₹{sellingPrice.toFixed(0)}</strong>
              {mrp > sellingPrice && <del>₹{mrp.toFixed(0)}</del>}
            </div>
            <button
              className="quick-add"
              disabled={!inStock}
              onClick={() => inStock && addItem(product, variant, 1)}
              aria-label={inStock ? `Add ${product.name} to cart` : `${product.name} is out of stock`}
            >
              {inStock ? <Icon name="plus" size={20} strokeWidth={2.2} /> : "×"}
            </button>
          </div>
        ) : (
          <p className="muted product-unavailable">No active variant</p>
        )}
      </div>
    </article>
  );
}
