import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import { useCart } from "../context/CartContext";

export default function ProductDetails() {
  const { slug } = useParams();
  const { addItem } = useCart();
  const [product, setProduct] = useState(null);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/products/${slug}`)
      .then((response) => {
        setProduct(response.data);
        setVariantId(response.data.variants?.[0]?.id || "");
      })
      .catch((err) => setError(err.message));
  }, [slug]);

  const variant = useMemo(() => product?.variants?.find((item) => item.id === variantId), [product, variantId]);

  if (error) return <div className="container page-space"><p className="alert error">{error}</p></div>;
  if (!product) return <div className="container page-space">Loading...</div>;

  const image = product.images?.[0]?.url;
  const inStock = variant && Number(variant.stockQuantity) > 0;

  return (
    <div className="container page-space product-detail">
      <div className="detail-media">
        {image ? <img src={image} alt={product.images?.[0]?.altText || product.name} /> : <div className="image-placeholder large">Riseora</div>}
      </div>
      <div>
        <p className="eyebrow">{product.category?.name}</p>
        <h1>{product.name}</h1>
        <p className="lead">{product.shortDescription}</p>
        {variant && (
          <div className="detail-price"><strong>₹{Number(variant.sellingPrice).toFixed(0)}</strong> {Number(variant.mrp) > Number(variant.sellingPrice) && <del>₹{Number(variant.mrp).toFixed(0)}</del>}</div>
        )}
        <label className="field-label">Variant</label>
        <select value={variantId} onChange={(event) => { setVariantId(event.target.value); setQuantity(1); }}>
          {product.variants.map((item) => <option key={item.id} value={item.id}>{item.name} — {Number(item.stockQuantity) > 0 ? `${item.stockQuantity} in stock` : "Out of stock"}</option>)}
        </select>
        <label className="field-label">Quantity</label>
        <input className="quantity-input" type="number" min="1" max={variant?.stockQuantity || 1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} />
        <button className="button wide" disabled={!inStock} onClick={() => addItem(product, variant, Math.min(quantity, variant.stockQuantity))}>{inStock ? "Add to cart" : "Out of stock"}</button>
        <div className="rich-copy"><h3>Product details</h3><p>{product.description || "Add the full Riseora product description from the Admin page."}</p></div>
      </div>
    </div>
  );
}
