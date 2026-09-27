import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";

export default function ProductCard({ product }) {
  const { addItem } = useCart();
  const variant = product.variants?.[0];
  const image = product.images?.[0]?.url;
  const inStock = variant && Number(variant.stockQuantity) > 0;

  return (
    <article className="product-card">
      <Link to={`/product/${product.slug}`} className="product-image-wrap">
        {image ? <img className="product-image" src={image} alt={product.images?.[0]?.altText || product.name} /> : <div className="image-placeholder">Riseora</div>}
      </Link>
      <div className="product-card-body">
        <p className="eyebrow">{product.category?.name}</p>
        <Link className="product-title" to={`/product/${product.slug}`}>{product.name}</Link>
        <p className="product-copy">{product.shortDescription || "Discover this Riseora product."}</p>
        {variant ? (
          <div className="price-row">
            <strong>₹{Number(variant.sellingPrice).toFixed(0)}</strong>
            {Number(variant.mrp) > Number(variant.sellingPrice) && <del>₹{Number(variant.mrp).toFixed(0)}</del>}
          </div>
        ) : (
          <p className="muted">No active variant</p>
        )}
        <button className="button" disabled={!inStock} onClick={() => inStock && addItem(product, variant, 1)}>
          {inStock ? "Add to cart" : "Out of stock"}
        </button>
      </div>
    </article>
  );
}
