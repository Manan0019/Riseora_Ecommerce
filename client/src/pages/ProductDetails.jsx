import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useWishlist } from "../context/WishlistContext";
import { Icon } from "../components/Icons";
import Seo from "../components/Seo";

export default function ProductDetails() {
  const { slug } = useParams();
  const { addItem } = useCart();
  const { user } = useAuth();
  const { toggle, has } = useWishlist();
  const [product, setProduct] = useState(null);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [review, setReview] = useState({ rating: 5, title: "", comment: "" });
  const [reviewMessage, setReviewMessage] = useState("");

  function loadProduct() {
    return apiFetch(`/products/${slug}`).then((response) => {
      setProduct(response.data);
      setVariantId((current) => current || response.data.variants?.[0]?.id || "");
    });
  }
  useEffect(() => { loadProduct().catch((err) => setError(err.message)); }, [slug]);

  const variant = useMemo(() => product?.variants?.find((item) => item.id === variantId), [product, variantId]);
  if (error) return <div className="container page-space"><p className="alert error">{error}</p></div>;
  if (!product) return <div className="container page-space"><div className="skeleton-card tall" /></div>;

  const image = mediaUrl(product.images?.[0]?.url);
  const inStock = variant && Number(variant.stockQuantity) > 0;
  const addCurrent = () => inStock && addItem(product, variant, Math.min(quantity, variant.stockQuantity));
  const wished = has(product.id);

  async function submitReview(event) {
    event.preventDefault(); setReviewMessage("");
    try {
      await apiFetch(`/products/${product.id}/reviews`, { method: "POST", body: JSON.stringify({ rating: Number(review.rating), title: review.title, comment: review.comment }) });
      setReview({ rating: 5, title: "", comment: "" }); setReviewMessage("Thanks! Your review is now visible."); await loadProduct();
    } catch (err) { setReviewMessage(err.message); }
  }

  const productJson = { "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.shortDescription || product.description || undefined, image: product.images?.map((item) => mediaUrl(item.url)).filter(Boolean), sku: variant?.sku, offers: variant ? { "@type": "Offer", priceCurrency: "INR", price: Number(variant.sellingPrice), availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" } : undefined, aggregateRating: product.reviewCount > 0 ? { "@type": "AggregateRating", ratingValue: Number(product.ratingAverage), reviewCount: product.reviewCount } : undefined };
  return <><Seo title={product.name} description={product.shortDescription || product.description} image={image} type="product" jsonLd={productJson} /><div className="product-detail-page phase3-detail">
    <div className="container product-detail">
      <div className="detail-media phase3-media">
        <div className="detail-image-frame">{product.badge && <span className="detail-badge">{product.badge}</span>}<button className={wished ? "detail-wish active" : "detail-wish"} onClick={() => toggle(product)}><Icon name="heart" size={20} /></button>{image ? <img src={image} alt={product.images?.[0]?.altText || product.name} /> : <div className="image-placeholder large"><span>R</span><small>Riseora</small></div>}</div>
      </div>
      <div className="detail-content phase3-detail-content">
        <Link className="detail-category" to={`/shop?category=${product.category?.slug || ""}`}>{product.category?.name}</Link>
        <h1>{product.name}</h1>
        {product.reviewCount > 0 && <a className="detail-rating" href="#reviews">★ {product.ratingAverage} <span>{product.reviewCount} review{product.reviewCount === 1 ? "" : "s"}</span></a>}
        <p className="lead">{product.shortDescription || "Thoughtful herbal care for your everyday routine."}</p>
        {variant && <div className="detail-price"><strong>₹{Number(variant.sellingPrice).toFixed(0)}</strong>{Number(variant.mrp) > Number(variant.sellingPrice) && <del>₹{Number(variant.mrp).toFixed(0)}</del>}{Number(variant.mrp) > Number(variant.sellingPrice) && <span className="detail-saving">Save ₹{(Number(variant.mrp)-Number(variant.sellingPrice)).toFixed(0)}</span>}</div>}
        <div className="detail-control-group"><span className="field-label">CHOOSE SIZE</span><div className="variant-pills">{product.variants.map((item) => <button key={item.id} className={variantId === item.id ? "variant-pill active" : "variant-pill"} disabled={Number(item.stockQuantity) <= 0} onClick={() => { setVariantId(item.id); setQuantity(1); }}>{item.name}<small>{Number(item.stockQuantity) > 0 ? "In stock" : "Sold out"}</small></button>)}</div></div>
        <div className="desktop-buy-block"><label className="field-label" htmlFor="quantity">QUANTITY</label><div className="quantity-stepper"><button onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><input id="quantity" type="number" min="1" max={variant?.stockQuantity || 1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /><button onClick={() => setQuantity((value) => Math.min(Number(variant?.stockQuantity || 1), value + 1))}>+</button></div><button className="button wide phase3-add" disabled={!inStock} onClick={addCurrent}>{inStock ? "ADD TO CART" : "OUT OF STOCK"}</button></div>
        <div className="detail-benefit-grid"><span><Icon name="shield" size={19} /><b>Secure checkout</b><small>Protected purchase</small></span><span><Icon name="truck" size={19} /><b>India delivery</b><small>Track your order</small></span><span><Icon name="leaf" size={19} /><b>Herbal care</b><small>Everyday routine</small></span></div>
        <div className="rich-copy phase3-rich"><h3>Product details</h3><p>{product.description || "Full product information can be added from the Riseora Admin dashboard."}</p></div>
      </div>
    </div>

    <section id="reviews" className="container review-section phase3-section">
      <div className="section-title-row"><div><p className="phase3-eyebrow">REAL EXPERIENCES</p><h2>Customer reviews</h2></div>{product.reviewCount > 0 && <span className="review-summary">★ {product.ratingAverage} / 5</span>}</div>
      <div className="reviews-layout"><div className="review-list">{product.reviews?.length ? product.reviews.map((item) => <article className="review-card" key={item.id}><div><span className="review-stars">{"★".repeat(item.rating)}{"☆".repeat(5-item.rating)}</span>{item.verifiedPurchase && <b>Verified purchase</b>}</div><h3>{item.title || "Customer review"}</h3><p>{item.comment}</p><small>{item.user?.firstName || "Customer"}</small></article>) : <div className="empty-review">No reviews yet. Be the first to share your experience.</div>}</div>
      <div className="review-form-card">{user ? <form onSubmit={submitReview}><h3>Write a review</h3><label>Rating<select value={review.rating} onChange={(e) => setReview({ ...review, rating: e.target.value })}><option value="5">5 - Excellent</option><option value="4">4 - Very good</option><option value="3">3 - Good</option><option value="2">2 - Fair</option><option value="1">1 - Poor</option></select></label><label>Title<input value={review.title} onChange={(e) => setReview({ ...review, title: e.target.value })} placeholder="Loved it" /></label><label>Review<textarea required minLength="5" value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} placeholder="Tell others about your experience" /></label><button className="black-button" type="submit">SUBMIT REVIEW</button>{reviewMessage && <p className="review-message">{reviewMessage}</p>}</form> : <div><h3>Want to review this product?</h3><p>Log in to share your experience.</p><Link className="black-button" to="/login">LOGIN</Link></div>}</div></div>
    </section>

    <div className="mobile-buy-bar phase3-buy-bar"><div><small>{variant?.name || "Select size"}</small><strong>{variant ? `₹${Number(variant.sellingPrice).toFixed(0)}` : "—"}</strong></div><button className="button" disabled={!inStock} onClick={addCurrent}>{inStock ? "ADD TO CART" : "OUT OF STOCK"}</button></div>
  </div></>;
}