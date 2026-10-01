import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useWishlist } from "../context/WishlistContext";
import { useStore } from "../context/StoreContext";
import { Icon } from "../components/Icons";
import ProductCard from "../components/ProductCard";
import Seo from "../components/Seo";
import RichText, { richTextToPlain } from "../components/RichText";
import ProductFaq from "../components/ProductFaq";

const RECENT_KEY = "riseora_recent_products";

function readRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function readSavedPin() {
  try {
    const value = localStorage.getItem("riseora_delivery_pin") || "";
    return /^\d{6}$/.test(value) ? value : "";
  } catch { return ""; }
}

function formatEta(days) {
  const date = new Date();
  date.setDate(date.getDate() + Math.max(0, Number(days || 0)));
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function rememberProduct(product) {
  try {
    const snapshot = {
      id: product.id, slug: product.slug, name: product.name, shortDescription: product.shortDescription, badge: product.badge,
      category: product.category, images: product.images, variants: product.variants, ratingAverage: product.ratingAverage, reviewCount: product.reviewCount,
      maxPurchaseQuantity: product.maxPurchaseQuantity,
    };
    const next = [snapshot, ...readRecent().filter((item) => item.id !== product.id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* recently viewed is optional */ }
}

export default function ProductDetails() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addItem, startBuyNow } = useCart();
  const { user } = useAuth();
  const { toggle, has } = useWishlist();
  const { store } = useStore();
  const [product, setProduct] = useState(null);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [error, setError] = useState("");
  const [review, setReview] = useState({ rating: 5, title: "", comment: "" });
  const [reviewMessage, setReviewMessage] = useState("");
  const [stockEmail, setStockEmail] = useState("");
  const [stockAlertMessage, setStockAlertMessage] = useState("");
  const [stockAlertBusy, setStockAlertBusy] = useState(false);
  const [related, setRelated] = useState([]);
  const [frequentlyBought, setFrequentlyBought] = useState([]);
  const [recent, setRecent] = useState([]);
  const [fbtSelected, setFbtSelected] = useState([]);
  const [deliveryPin, setDeliveryPin] = useState(readSavedPin);
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const galleryTouchStart = useRef(null);

  function loadProduct() {
    return apiFetch(`/products/${slug}`).then((response) => {
      setProduct(response.data);
      setVariantId(response.data.variants?.[0]?.id || "");
      const primaryImageIndex = response.data.images?.findIndex((item) => item.isPrimary) ?? -1;
      setActiveImage(primaryImageIndex >= 0 ? primaryImageIndex : 0);
      setRecent(readRecent().filter((item) => item.id !== response.data.id).slice(0, 6));
      rememberProduct(response.data);
      apiFetch(`/products/${encodeURIComponent(response.data.slug)}/recommendations`)
        .then((recommendationResponse) => setFrequentlyBought(recommendationResponse.data || []))
        .catch(() => setFrequentlyBought([]));
      if (response.data.category?.slug) {
        apiFetch(`/products?category=${encodeURIComponent(response.data.category.slug)}&limit=8`)
          .then((relatedResponse) => setRelated(relatedResponse.data.filter((item) => item.id !== response.data.id).slice(0, 6)))
          .catch(() => setRelated([]));
      }
    });
  }
  useEffect(() => { setError(""); loadProduct().catch((err) => setError(err.message)); }, [slug]);
  useEffect(() => { if (user?.email) setStockEmail(user.email); }, [user?.email]);
  useEffect(() => { setStockAlertMessage(""); }, [variantId]);
  useEffect(() => {
    const ids = frequentlyBought.filter((item) => item.variants?.some((v) => Number(v.stockQuantity || 0) > 0)).slice(0, 2).map((item) => item.id);
    setFbtSelected(ids);
  }, [frequentlyBought]);

  const variant = useMemo(() => product?.variants?.find((item) => item.id === variantId), [product, variantId]);
  if (error) return <div className="container page-space"><p className="alert error">{error}</p></div>;
  if (!product) return <div className="container page-space"><div className="skeleton-card tall" /></div>;

  const imageItem = product.images?.[activeImage] || product.images?.[0];
  const image = mediaUrl(imageItem?.url);
  const imageCount = product.images?.length || 0;
  const changeImage = (direction) => {
    if (imageCount <= 1) return;
    setActiveImage((value) => (value + direction + imageCount) % imageCount);
  };
  const onGalleryTouchStart = (event) => { galleryTouchStart.current = event.changedTouches?.[0]?.clientX ?? null; };
  const onGalleryTouchEnd = (event) => {
    const start = galleryTouchStart.current; const end = event.changedTouches?.[0]?.clientX;
    galleryTouchStart.current = null;
    if (start == null || end == null || Math.abs(end - start) < 45) return;
    changeImage(end < start ? 1 : -1);
  };
  const inStock = variant && Number(variant.stockQuantity) > 0;
  const stockQuantity = Number(variant?.stockQuantity || 0);
  const purchaseLimit = Number.isInteger(Number(product.maxPurchaseQuantity)) && Number(product.maxPurchaseQuantity) > 0 ? Number(product.maxPurchaseQuantity) : null;
  const maxSelectableQuantity = Math.max(1, Math.min(stockQuantity || 1, purchaseLimit ?? (stockQuantity || 1)));
  const lowStockThreshold = Math.max(1, Number(store.lowStockUrgencyThreshold || 5));
  const lowStock = inStock && stockQuantity <= lowStockThreshold;
  const dispatchDays = Math.max(0, Number(store.dispatchWithinDays ?? 2));
  const deliveryMinDays = Math.max(1, Number(store.deliveryMinDays ?? 3));
  const deliveryMaxDays = Math.max(deliveryMinDays, Number(store.deliveryMaxDays ?? 7));
  const estimatedFrom = formatEta(dispatchDays + deliveryMinDays);
  const estimatedTo = formatEta(dispatchDays + deliveryMaxDays);
  const addCurrent = () => inStock && addItem(product, variant, Math.min(quantity, maxSelectableQuantity));
  const buyCurrent = () => {
    if (!inStock || !variant) return;
    if (startBuyNow(product, variant, Math.min(quantity, maxSelectableQuantity))) navigate("/checkout?mode=buy-now");
  };
  const wished = has(product.id);
  const faq = Array.isArray(product.faq) ? product.faq : [];
  const fbtProducts = frequentlyBought.filter((item) => item.variants?.some((v) => Number(v.stockQuantity || 0) > 0)).slice(0, 2);
  const fbtChosen = fbtProducts.filter((item) => fbtSelected.includes(item.id));
  const fbtTotal = Number(variant?.sellingPrice || 0) + fbtChosen.reduce((sum, item) => { const v = item.variants?.find((row) => Number(row.stockQuantity || 0) > 0); return sum + Number(v?.sellingPrice || 0); }, 0);
  function addFrequentlyBought() {
    if (inStock && variant) addItem(product, variant, 1);
    for (const item of fbtChosen) { const v = item.variants?.find((row) => Number(row.stockQuantity || 0) > 0); if (v) addItem(item, v, 1); }
  }

  async function saveDeliveryPin(event) {
    event.preventDefault();
    const value = deliveryPin.replace(/\D/g, "").slice(0, 6);
    setDeliveryPin(value); setDeliveryQuote(null);
    if (!/^\d{6}$/.test(value)) { setDeliveryMessage("Enter a valid 6-digit PIN code."); return; }
    setDeliveryBusy(true); setDeliveryMessage("");
    try {
      const response = await apiFetch(`/store/serviceability?postalCode=${encodeURIComponent(value)}&subtotal=${encodeURIComponent(Number(variant?.sellingPrice || 0) * Math.max(1, quantity))}&paymentMethod=ONLINE`);
      const quote = response.data;
      setDeliveryQuote(quote);
      try { localStorage.setItem("riseora_delivery_pin", value); } catch { /* optional preference */ }
      if (!quote.serviceable) setDeliveryMessage(quote.reason || "Delivery is not available for this PIN code yet.");
      else {
        const from = formatEta(Number(quote.dispatchWithinDays || 0) + Number(quote.deliveryMinDays || 1));
        const to = formatEta(Number(quote.dispatchWithinDays || 0) + Number(quote.deliveryMaxDays || quote.deliveryMinDays || 1));
        const shipping = Number(quote.shippingFee || 0) > 0 ? `Shipping ₹${Number(quote.shippingFee).toFixed(0)}` : "Free shipping";
        const cod = quote.codAllowed ? "COD available" : "Prepaid only";
        setDeliveryMessage(`${quote.zoneName ? `${quote.zoneName} • ` : ""}${from}–${to} • ${shipping} • ${cod}`);
      }
    } catch (err) { setDeliveryMessage(err.message || "Delivery availability could not be checked right now."); }
    finally { setDeliveryBusy(false); }
  }

  async function shareProduct() {
    const url = window.location.href;
    setShareMessage("");
    try {
      if (navigator.share) await navigator.share({ title: product.name, text: product.shortDescription || product.name, url });
      else { await navigator.clipboard.writeText(url); setShareMessage("Product link copied."); }
    } catch (err) {
      if (err?.name !== "AbortError") setShareMessage("Copy this page link to share the product.");
    }
  }

  async function submitReview(event) {
    event.preventDefault(); setReviewMessage("");
    try {
      const response = await apiFetch(`/products/${product.id}/reviews`, { method: "POST", body: JSON.stringify({ rating: Number(review.rating), title: review.title, comment: review.comment }) });
      setReview({ rating: 5, title: "", comment: "" });
      setReviewMessage(response.message || "Thanks — your review was submitted for moderation.");
    } catch (err) { setReviewMessage(err.message); }
  }

  async function submitStockAlert(event) {
    event.preventDefault();
    if (!variant) return;
    setStockAlertBusy(true); setStockAlertMessage("");
    try {
      const response = await apiFetch("/stock-alerts", { method: "POST", body: JSON.stringify({ variantId: variant.id, email: stockEmail, name: user?.firstName || "" }) });
      setStockAlertMessage(response.message || "Back-in-stock alert saved.");
    } catch (err) { setStockAlertMessage(err.message); }
    finally { setStockAlertBusy(false); }
  }

  const productJson = { "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.shortDescription || richTextToPlain(product.description) || undefined, image: product.images?.map((item) => mediaUrl(item.url)).filter(Boolean), sku: variant?.sku, offers: variant ? { "@type": "Offer", priceCurrency: "INR", price: Number(variant.sellingPrice), availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" } : undefined, aggregateRating: product.reviewCount > 0 ? { "@type": "AggregateRating", ratingValue: Number(product.ratingAverage), reviewCount: product.reviewCount } : undefined };

  return <><Seo title={product.name} description={product.shortDescription || richTextToPlain(product.description)} image={image} type="product" jsonLd={productJson} />
    <div className="product-detail-page phase3-detail phase9-detail-page">
      <div className="container product-detail">
        <div className="detail-media phase3-media phase9-product-gallery">
          <div className="detail-image-frame phase12-detail-image-frame" onTouchStart={onGalleryTouchStart} onTouchEnd={onGalleryTouchEnd}>{product.badge && <span className="detail-badge">{product.badge}</span>}<button className={wished ? "detail-wish active" : "detail-wish"} onClick={() => toggle(product)}><Icon name="heart" size={20} /></button>{image ? <img key={`${product.id}-${activeImage}`} className="phase12-detail-main-image" src={image} alt={imageItem?.altText || product.name} /> : <div className="image-placeholder large"><span>R</span><small>Riseora</small></div>}{imageCount > 1 && <><button className="phase12-gallery-arrow prev" type="button" onClick={() => changeImage(-1)} aria-label="Previous product image"><span><Icon name="arrow" size={20} /></span></button><button className="phase12-gallery-arrow next" type="button" onClick={() => changeImage(1)} aria-label="Next product image"><Icon name="arrow" size={20} /></button><span className="phase12-gallery-counter">{activeImage + 1} / {imageCount}</span></>}</div>
          {product.images?.length > 1 && <div className="phase9-gallery-thumbs">{product.images.map((item, index) => <button key={item.id || index} className={activeImage === index ? "active" : ""} onClick={() => setActiveImage(index)}><img src={mediaUrl(item.url)} alt={item.altText || `${product.name} ${index + 1}`} /></button>)}</div>}
        </div>
        <div className="detail-content phase3-detail-content">
          <Link className="detail-category" to={`/shop?category=${product.category?.slug || ""}`}>{product.category?.name}</Link>
          <h1>{product.name}</h1>
          {product.reviewCount > 0 && <a className="detail-rating" href="#reviews">★ {product.ratingAverage} <span>{product.reviewCount} review{product.reviewCount === 1 ? "" : "s"}</span></a>}
          <p className="lead">{product.shortDescription || "Thoughtful herbal care for your everyday routine."}</p>
          {variant && <div className="detail-price"><strong>₹{Number(variant.sellingPrice).toFixed(0)}</strong>{Number(variant.mrp) > Number(variant.sellingPrice) && <del>₹{Number(variant.mrp).toFixed(0)}</del>}{Number(variant.mrp) > Number(variant.sellingPrice) && <span className="detail-saving">Save ₹{(Number(variant.mrp)-Number(variant.sellingPrice)).toFixed(0)}</span>}</div>}
          <div className="detail-control-group"><span className="field-label">CHOOSE SIZE</span><div className="variant-pills">{product.variants.map((item) => <button key={item.id} className={variantId === item.id ? "variant-pill active" : "variant-pill"} onClick={() => { setVariantId(item.id); setQuantity(1); }}>{item.name}<small>{Number(item.stockQuantity) > 0 ? "In stock" : "Sold out"}</small></button>)}</div></div>
          {lowStock && <div className="phase17-low-stock"><span>SELLING FAST</span><strong>Only {stockQuantity} left in {variant.name}</strong></div>}
          {purchaseLimit && <div className="phase18-purchase-limit-note"><Icon name="shield" size={16} /><span><strong>Purchase limit</strong> Maximum {purchaseLimit} unit{purchaseLimit === 1 ? "" : "s"} of this product per order.</span></div>}
          {product.codAllowed === false && <div className="phase20-prepaid-note"><Icon name="shield" size={16} /><span><strong>Prepaid only</strong> Cash on Delivery is not available when this product is in the order.</span></div>}
          <div className="desktop-buy-block phase17-desktop-buy"><label className="field-label" htmlFor="quantity">QUANTITY</label><div className="quantity-stepper"><button onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><input id="quantity" type="number" min="1" max={maxSelectableQuantity} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(maxSelectableQuantity, Number(event.target.value) || 1)))} /><button onClick={() => setQuantity((value) => Math.min(maxSelectableQuantity, value + 1))}>+</button></div><div className="phase17-buy-actions"><button className="button button-secondary" disabled={!inStock} onClick={addCurrent}>{inStock ? "ADD TO CART" : "OUT OF STOCK"}</button><button className="button" disabled={!inStock} onClick={buyCurrent}>{inStock ? "BUY NOW" : "SOLD OUT"}</button></div></div>
          {!inStock && variant && <form className="phase10-stock-alert" onSubmit={submitStockAlert}><div><span className="phase3-eyebrow">BACK IN STOCK</span><h3>Want this size?</h3><p>Leave your email and Riseora can notify you when <strong>{variant.name}</strong> is available again.</p></div><div className="phase10-stock-alert-form"><input id="stock-alert-email" type="email" required value={stockEmail} onChange={(e) => setStockEmail(e.target.value)} placeholder="you@example.com" /><button className="black-button" disabled={stockAlertBusy}>{stockAlertBusy ? "SAVING…" : "NOTIFY ME"}</button></div>{stockAlertMessage && <small className="phase10-stock-alert-message">{stockAlertMessage}</small>}</form>}
          <section className="phase17-delivery-card">
            <div className="phase17-delivery-head"><span><Icon name="truck" size={20} /></span><div><strong>Delivery estimate</strong><small>Usually dispatches within {dispatchDays} day{dispatchDays === 1 ? "" : "s"} · typical arrival {estimatedFrom}–{estimatedTo}</small></div><button type="button" onClick={shareProduct} aria-label="Share product"><Icon name="share" size={18} /></button></div>
            <form className="phase17-pin-check" onSubmit={saveDeliveryPin}><input value={deliveryPin} onChange={(e) => { setDeliveryPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setDeliveryQuote(null); setDeliveryMessage(""); }} inputMode="numeric" placeholder="Enter 6-digit PIN" aria-label="Delivery PIN code" /><button type="submit" disabled={deliveryBusy}>{deliveryBusy ? "CHECKING…" : "CHECK PIN"}</button></form>
            {deliveryMessage && <small className={`phase17-delivery-message${deliveryQuote && !deliveryQuote.serviceable ? " unavailable" : ""}`}>{deliveryMessage}</small>}
            {deliveryQuote?.matched && <small className="phase21-zone-hint">Matched delivery zone: <strong>{deliveryQuote.zoneName}</strong>{deliveryQuote.city || deliveryQuote.state ? ` • ${[deliveryQuote.city, deliveryQuote.state].filter(Boolean).join(", ")}` : ""}</small>}
            {shareMessage && <small className="phase17-share-message">{shareMessage}</small>}
          </section>
          <div className="detail-benefit-grid"><span><Icon name="shield" size={19} /><b>Secure checkout</b><small>Protected purchase</small></span><span><Icon name="clock" size={19} /><b>{deliveryMinDays}–{deliveryMaxDays} day delivery</b><small>Typical estimate</small></span><span><Icon name="leaf" size={19} /><b>Herbal care</b><small>Everyday routine</small></span></div>
        </div>
      </div>

      <section className="container phase9-product-story phase3-section">
        <div className="phase9-story-intro"><p className="phase3-eyebrow">KNOW YOUR PRODUCT</p><h2>Everything you need to know</h2>{product.description ? <RichText value={product.description} /> : <p>Full product information can be added from the Riseora Admin dashboard.</p>}</div>
        <div className="phase9-info-grid">
          {product.benefits && <article><span>01</span><h3>Key benefits</h3><RichText value={product.benefits} /></article>}
          {product.ingredients && <article><span>02</span><h3>Ingredients</h3><RichText value={product.ingredients} /></article>}
          {product.howToUse && <article><span>03</span><h3>How to use</h3><RichText value={product.howToUse} /></article>}
          {product.suitableFor && <article><span>04</span><h3>Suitable for</h3><div className="phase19-suitable-display">{String(product.suitableFor).split(/[\n,;|]+/).map((item) => item.trim()).filter(Boolean).map((item) => <b key={item}>{item}</b>)}</div></article>}
        </div>
      </section>

      {faq.length > 0 && <section className="container phase3-section phase9-faq-section"><div className="section-title-row"><div><p className="phase3-eyebrow">QUESTIONS, ANSWERED</p><h2>Product FAQ</h2></div></div><ProductFaq items={faq} /></section>}

      {inStock && fbtProducts.length > 0 && <section className="container phase3-section phase14-fbt"><div className="section-title-row"><div><p className="phase3-eyebrow">COMPLETE THE ROUTINE</p><h2>Frequently bought together</h2></div><Link to="/routine-builder">BUILD A ROUTINE</Link></div><div className="phase14-fbt-box"><div className="phase14-fbt-products"><FbtItem product={product} variant={variant} checked locked /><span className="phase14-fbt-plus">+</span>{fbtProducts.map((item, index) => { const v = item.variants?.find((row) => Number(row.stockQuantity || 0) > 0); const checked = fbtSelected.includes(item.id); return <div className="phase14-fbt-fragment" key={item.id}><FbtItem product={item} variant={v} checked={checked} onChange={() => setFbtSelected((current) => checked ? current.filter((id) => id !== item.id) : [...current, item.id])} />{index < fbtProducts.length - 1 && <span className="phase14-fbt-plus">+</span>}</div>; })}</div><div className="phase14-fbt-summary"><small>{1 + fbtChosen.length} item{fbtChosen.length ? "s" : ""} selected</small><strong>₹{fbtTotal.toFixed(0)}</strong><button className="button" onClick={addFrequentlyBought}>ADD TOGETHER <Icon name="plus" size={16} /></button></div></div></section>}

      {related.length > 0 && <ProductShelf title="You may also like" eyebrow="PAIR IT WITH" products={related} />}
      {recent.length > 0 && <ProductShelf title="Recently viewed" eyebrow="PICK UP WHERE YOU LEFT OFF" products={recent} />}

      <section id="reviews" className="container review-section phase3-section">
        <div className="section-title-row"><div><p className="phase3-eyebrow">REAL EXPERIENCES</p><h2>Customer reviews</h2></div>{product.reviewCount > 0 && <span className="review-summary">★ {product.ratingAverage} / 5</span>}</div>
        <div className="reviews-layout"><div className="review-list">{product.reviews?.length ? product.reviews.map((item) => <article className="review-card" key={item.id}><div><span className="review-stars">{"★".repeat(item.rating)}{"☆".repeat(5-item.rating)}</span>{item.verifiedPurchase && <b>Verified purchase</b>}</div><h3>{item.title || "Customer review"}</h3><p>{item.comment}</p><small>{item.user?.firstName || "Customer"}</small></article>) : <div className="empty-review">No approved reviews yet. Be the first to share your experience.</div>}</div>
        <div className="review-form-card">{user ? <form onSubmit={submitReview}><h3>Write a review</h3><p className="muted">Reviews are checked by Riseora before publishing.</p><label>Rating<select value={review.rating} onChange={(e) => setReview({ ...review, rating: e.target.value })}><option value="5">5 - Excellent</option><option value="4">4 - Very good</option><option value="3">3 - Good</option><option value="2">2 - Fair</option><option value="1">1 - Poor</option></select></label><label>Title<input value={review.title} onChange={(e) => setReview({ ...review, title: e.target.value })} placeholder="Loved it" /></label><label>Review<textarea required minLength="5" value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} placeholder="Tell others about your experience" /></label><button className="black-button" type="submit">SUBMIT REVIEW</button>{reviewMessage && <p className="review-message">{reviewMessage}</p>}</form> : <div><h3>Want to review this product?</h3><p>Log in to share your experience.</p><Link className="black-button" to="/login">LOGIN</Link></div>}</div></div>
      </section>

      <div className="mobile-buy-bar phase3-buy-bar phase17-mobile-buy"><div className="phase17-mobile-price"><small>{variant?.name || "Select size"}</small><strong>{variant ? `₹${Number(variant.sellingPrice).toFixed(0)}` : "—"}</strong></div>{inStock ? <div className="phase17-mobile-actions"><button className="button button-secondary" onClick={addCurrent}>ADD</button><button className="button" onClick={buyCurrent}>BUY NOW</button></div> : <button className="button" onClick={() => document.getElementById("stock-alert-email")?.focus()}>NOTIFY ME</button>}</div>
    </div>
  </>;
}

function FbtItem({ product, variant, checked, locked = false, onChange }) {
  const imageItem = product.images?.find((item) => item.isPrimary) || product.images?.[0];
  return <article className={checked ? "phase14-fbt-item selected" : "phase14-fbt-item"}><div className="phase14-fbt-thumb">{imageItem?.url ? <img src={mediaUrl(imageItem.url)} alt={product.name} /> : <span>R</span>}<label><input type="checkbox" checked={checked} disabled={locked} onChange={onChange} /><span>{locked ? "MAIN" : checked ? "✓" : "+"}</span></label></div><Link to={`/product/${product.slug}`}><strong>{product.name}</strong></Link><small>{variant?.name}</small><b>₹{Number(variant?.sellingPrice || 0).toFixed(0)}</b></article>;
}

function ProductShelf({ title, eyebrow, products }) {
  return <section className="container phase3-section"><div className="section-title-row"><div><p className="phase3-eyebrow">{eyebrow}</p><h2>{title}</h2></div></div><div className="phase3-product-rail">{products.map((product) => <ProductCard key={product.id} product={product} compact />)}</div></section>;
}
