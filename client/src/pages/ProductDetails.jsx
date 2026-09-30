import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import { useCart } from "../context/CartContext";
import { Icon } from "../components/Icons";

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
  if (!product) return <div className="container page-space"><div className="skeleton-card tall" /></div>;

  const image = product.images?.[0]?.url;
  const inStock = variant && Number(variant.stockQuantity) > 0;
  const addCurrent = () => inStock && addItem(product, variant, Math.min(quantity, variant.stockQuantity));

  return (
    <div className="product-detail-page">
      <div className="container product-detail">
        <div className="detail-media">
          {image ? <img src={image} alt={product.images?.[0]?.altText || product.name} /> : <div className="image-placeholder large"><span>R</span><small>Riseora</small></div>}
        </div>
        <div className="detail-content">
          <Link className="detail-category" to={`/shop?category=${product.category?.slug || ""}`}>{product.category?.name}</Link>
          <h1>{product.name}</h1>
          <p className="lead">{product.shortDescription || "Thoughtful herbal care for your everyday routine."}</p>
          {variant && <div className="detail-price"><strong>₹{Number(variant.sellingPrice).toFixed(0)}</strong>{Number(variant.mrp) > Number(variant.sellingPrice) && <del>₹{Number(variant.mrp).toFixed(0)}</del>}</div>}

          <div className="detail-control-group">
            <span className="field-label">Choose size</span>
            <div className="variant-pills">{product.variants.map((item) => <button key={item.id} className={variantId === item.id ? "variant-pill active" : "variant-pill"} disabled={Number(item.stockQuantity) <= 0} onClick={() => { setVariantId(item.id); setQuantity(1); }}>{item.name}<small>{Number(item.stockQuantity) > 0 ? "In stock" : "Sold out"}</small></button>)}</div>
          </div>

          <div className="desktop-buy-block">
            <label className="field-label" htmlFor="quantity">Quantity</label>
            <div className="quantity-stepper"><button onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><input id="quantity" type="number" min="1" max={variant?.stockQuantity || 1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /><button onClick={() => setQuantity((value) => Math.min(Number(variant?.stockQuantity || 1), value + 1))}>+</button></div>
            <button className="button wide" disabled={!inStock} onClick={addCurrent}>{inStock ? "Add to cart" : "Out of stock"}</button>
          </div>

          <div className="detail-benefits"><span><Icon name="shield" size={18} /> Secure checkout</span><span><Icon name="truck" size={18} /> Order tracking</span></div>
          <div className="rich-copy"><h3>Product details</h3><p>{product.description || "Full product information can be added from the Riseora Admin dashboard."}</p></div>
        </div>
      </div>

      <div className="mobile-buy-bar">
        <div><small>{variant?.name || "Select size"}</small><strong>{variant ? `₹${Number(variant.sellingPrice).toFixed(0)}` : "—"}</strong></div>
        <button className="button" disabled={!inStock} onClick={addCurrent}>{inStock ? "Add to cart" : "Out of stock"}</button>
      </div>
    </div>
  );
}
