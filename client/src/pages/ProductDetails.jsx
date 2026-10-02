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
import ProductQuestions from "../components/ProductQuestions";
import DealCard from "../components/DealCard";
import { trackCommerce, trackEvent } from "../analytics";

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
  const [reviewFiles, setReviewFiles] = useState([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewFilter, setReviewFilter] = useState(0);
  const [reviewMessage, setReviewMessage] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [questionMessage, setQuestionMessage] = useState("");
  const [questionBusy, setQuestionBusy] = useState(false);
  const [stockEmail, setStockEmail] = useState("");
  const [stockAlertMessage, setStockAlertMessage] = useState("");
  const [stockAlertBusy, setStockAlertBusy] = useState(false);
  const [priceEmail, setPriceEmail] = useState("");
  const [priceTarget, setPriceTarget] = useState("");
  const [priceAlertMessage, setPriceAlertMessage] = useState("");
  const [priceAlertBusy, setPriceAlertBusy] = useState(false);
  const [related, setRelated] = useState([]);
  const [frequentlyBought, setFrequentlyBought] = useState([]);
  const [productDeals, setProductDeals] = useState([]);
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
      apiFetch(`/promotions/deals?productId=${encodeURIComponent(response.data.id)}`)
        .then((dealResponse) => setProductDeals(Array.isArray(dealResponse.data) ? dealResponse.data : []))
        .catch(() => setProductDeals([]));
      if (response.data.category?.slug) {
        apiFetch(`/products?category=${encodeURIComponent(response.data.category.slug)}&limit=8`)
          .then((relatedResponse) => setRelated(relatedResponse.data.filter((item) => item.id !== response.data.id).slice(0, 6)))
          .catch(() => setRelated([]));
      }
    });
  }
  useEffect(() => { setError(""); loadProduct().catch((err) => setError(err.message)); }, [slug]);
  useEffect(() => { if (user?.email) { setStockEmail(user.email); setPriceEmail(user.email); } }, [user?.email]);
  useEffect(() => { setStockAlertMessage(""); setPriceAlertMessage(""); setPriceTarget(""); }, [variantId]);
  useEffect(() => {
    const ids = frequentlyBought.filter((item) => item.variants?.some((v) => Number(v.stockQuantity || 0) > 0)).slice(0, 2).map((item) => item.id);
    setFbtSelected(ids);
  }, [frequentlyBought]);

  const variant = useMemo(() => product?.variants?.find((item) => item.id === variantId), [product, variantId]);
  useEffect(() => {
    if (!product || !variant) return;
    trackCommerce("view_item", { items: [{ sku: variant.sku, variantId: variant.id, productName: product.name, variantName: variant.name, price: Number(variant.sellingPrice), quantity: 1 }], value: Number(variant.sellingPrice || 0), item_category: product.category?.name || undefined });
  }, [product?.id, variant?.id]);
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
  const publicQuestions = Array.isArray(product.questions) ? product.questions : [];
  const publicReviews = Array.isArray(product.reviews) ? product.reviews : [];
  const visibleReviews = reviewFilter ? publicReviews.filter((item) => Number(item.rating) === reviewFilter) : publicReviews;
  const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => {
    const count = publicReviews.filter((item) => Number(item.rating) === rating).length;
    return { rating, count, percent: publicReviews.length ? Math.round((count / publicReviews.length) * 100) : 0 };
  });
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
    event.preventDefault(); setReviewMessage(""); setReviewBusy(true);
    try {
      let images = [];
      if (reviewFiles.length) {
        const form = new FormData();
        reviewFiles.forEach((file) => form.append("images", file));
        const uploadResponse = await apiFetch("/uploads/reviews", { method: "POST", body: form });
        images = (uploadResponse.data || []).map((item) => item.url).filter(Boolean).slice(0, 4);
      }
      const response = await apiFetch(`/products/${product.id}/reviews`, { method: "POST", body: JSON.stringify({ rating: Number(review.rating), title: review.title, comment: review.comment, images }) });
      setReview({ rating: 5, title: "", comment: "" });
      setReviewFiles([]);
      setReviewMessage(response.message || "Thanks — your review was submitted for moderation.");
    } catch (err) { setReviewMessage(err.message); } finally { setReviewBusy(false); }
  }

  function chooseReviewFiles(event) {
    const files = Array.from(event.target.files || []).filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type)).slice(0, 4);
    setReviewFiles(files);
    if ((event.target.files?.length || 0) > 4) setReviewMessage("You can attach up to 4 review photos.");
  }

  async function submitQuestion(event) {
    event.preventDefault();
    setQuestionMessage(""); setQuestionBusy(true);
    try {
      const response = await apiFetch(`/products/${product.id}/questions`, { method: "POST", body: JSON.stringify({ question: questionText }) });
      setQuestionText("");
      setQuestionMessage(response.message || "Question submitted for Riseora to answer.");
    } catch (err) { setQuestionMessage(err.message); } finally { setQuestionBusy(false); }
  }

  async function submitStockAlert(event) {
    event.preventDefault();
    if (!variant) return;
    setStockAlertBusy(true); setStockAlertMessage("");
    try {
      const response = await apiFetch("/stock-alerts", { method: "POST", body: JSON.stringify({ variantId: variant.id, email: stockEmail, name: user?.firstName || "" }) });
      setStockAlertMessage(response.message || "Back-in-stock alert saved.");
      trackEvent("stock_alert_created", { product_id: product.id, variant_id: variant.id });
    } catch (err) { setStockAlertMessage(err.message); }
    finally { setStockAlertBusy(false); }
  }

  async function submitPriceAlert(event) {
    event.preventDefault();
    if (!variant) return;
    setPriceAlertBusy(true); setPriceAlertMessage("");
    try {
      const target = String(priceTarget || "").trim();
      const response = await apiFetch("/price-alerts", {
        method: "POST",
        body: JSON.stringify({
          variantId: variant.id,
          email: priceEmail,
          name: user?.firstName || "",
          targetPrice: target ? Number(target) : null,
        }),
      });
      setPriceAlertMessage(response.message || "Price alert saved.");
      trackEvent("price_alert_created", { product_id: product.id, variant_id: variant.id, has_target_price: Boolean(target) });
    } catch (err) { setPriceAlertMessage(err.message); }
    finally { setPriceAlertBusy(false); }
  }

  const productUrl = `${(store.siteUrl || import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "")}/product/${product.slug}`;
  const productJson = { "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.shortDescription || richTextToPlain(product.description) || undefined, image: product.images?.map((item) => mediaUrl(item.url)).filter(Boolean), sku: variant?.sku, category: product.category?.name || undefined, brand: { "@type": "Brand", name: store.storeName || "Riseora Herbals" }, url: productUrl, offers: variant ? { "@type": "Offer", url: productUrl, priceCurrency: "INR", price: Number(variant.sellingPrice), availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", itemCondition: "https://schema.org/NewCondition" } : undefined, aggregateRating: product.reviewCount > 0 ? { "@type": "AggregateRating", ratingValue: Number(product.ratingAverage), reviewCount: product.reviewCount } : undefined };
  const breadcrumbJson = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${(store.siteUrl || import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "")}` }, { "@type": "ListItem", position: 2, name: product.category?.name || "Shop", item: `${(store.siteUrl || import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "")}/shop${product.category?.slug ? `?category=${encodeURIComponent(product.category.slug)}` : ""}` }, { "@type": "ListItem", position: 3, name: product.name, item: productUrl }] };

  return <><Seo title={product.name} description={product.shortDescription || richTextToPlain(product.description)} image={image} type="product" jsonLd={[productJson, breadcrumbJson]} />
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
          {variant && <form className="phase29-price-alert" onSubmit={submitPriceAlert}><div className="phase29-price-alert-copy"><span className="phase3-eyebrow">PRICE WATCH</span><h3>Waiting for a better price?</h3><p>We can email you if <strong>{variant.name}</strong> drops below today’s ₹{Number(variant.sellingPrice).toFixed(0)} price. Set a target or leave it blank for any drop.</p></div><div className="phase29-price-alert-fields"><input type="email" required value={priceEmail} onChange={(e) => setPriceEmail(e.target.value)} placeholder="you@example.com" aria-label="Price alert email" /><div className="phase29-target-price"><span>₹</span><input type="number" min="1" max={Math.max(1, Math.floor(Number(variant.sellingPrice) - 1))} step="1" value={priceTarget} onChange={(e) => setPriceTarget(e.target.value)} placeholder="Target price" aria-label="Target price" /></div><button className="button button-secondary" disabled={priceAlertBusy}>{priceAlertBusy ? "SAVING…" : "WATCH PRICE"}</button></div>{priceAlertMessage && <small className="phase29-price-alert-message">{priceAlertMessage}</small>}</form>}
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

      {productDeals.length > 0 && <section className="container phase3-section phase28-product-deals"><div className="section-title-row"><div><p className="phase3-eyebrow">EXTRA VALUE</p><h2>Offers connected to this product</h2></div><Link to="/offers">VIEW ALL</Link></div><div className="phase13-deal-rail">{productDeals.slice(0, 3).map((deal) => <DealCard key={deal.id} deal={deal} compact />)}</div></section>}

      {inStock && fbtProducts.length > 0 && <section className="container phase3-section phase14-fbt"><div className="section-title-row"><div><p className="phase3-eyebrow">COMPLETE THE ROUTINE</p><h2>Frequently bought together</h2></div><Link to="/routine-builder">BUILD A ROUTINE</Link></div><div className="phase14-fbt-box"><div className="phase14-fbt-products"><FbtItem product={product} variant={variant} checked locked /><span className="phase14-fbt-plus">+</span>{fbtProducts.map((item, index) => { const v = item.variants?.find((row) => Number(row.stockQuantity || 0) > 0); const checked = fbtSelected.includes(item.id); return <div className="phase14-fbt-fragment" key={item.id}><FbtItem product={item} variant={v} checked={checked} onChange={() => setFbtSelected((current) => checked ? current.filter((id) => id !== item.id) : [...current, item.id])} />{index < fbtProducts.length - 1 && <span className="phase14-fbt-plus">+</span>}</div>; })}</div><div className="phase14-fbt-summary"><small>{1 + fbtChosen.length} item{fbtChosen.length ? "s" : ""} selected</small><strong>₹{fbtTotal.toFixed(0)}</strong><button className="button" onClick={addFrequentlyBought}>ADD TOGETHER <Icon name="plus" size={16} /></button></div></div></section>}

      {related.length > 0 && <ProductShelf title="You may also like" eyebrow="PAIR IT WITH" products={related} />}
      {recent.length > 0 && <ProductShelf title="Recently viewed" eyebrow="PICK UP WHERE YOU LEFT OFF" products={recent} />}

      <section className="container phase3-section phase22-qa-section" id="questions">
        <div className="section-title-row"><div><p className="phase3-eyebrow">ASK BEFORE YOU BUY</p><h2>Product questions &amp; answers</h2></div>{publicQuestions.length > 0 && <span className="phase22-qa-count">{publicQuestions.length} answered</span>}</div>
        <div className="phase22-qa-layout">
          <div>{publicQuestions.length ? <ProductQuestions items={publicQuestions} /> : <div className="phase22-qa-empty"><strong>No published questions yet.</strong><p>Ask about usage, texture, routine pairing, pack size or other product details.</p></div>}</div>
          <aside className="phase22-question-form-card">
            {user ? <form onSubmit={submitQuestion}><span className="phase3-eyebrow">NEED CLARITY?</span><h3>Ask Riseora</h3><p>Questions are reviewed and answered before they appear publicly.</p><textarea required minLength="8" maxLength="500" value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Example: Can I use this with my evening hair-care routine?" /><div className="phase22-character-count">{questionText.length}/500</div><button className="button wide" disabled={questionBusy}>{questionBusy ? "SUBMITTING…" : "ASK A QUESTION"}</button>{questionMessage && <p className="review-message">{questionMessage}</p>}</form> : <div><span className="phase3-eyebrow">NEED CLARITY?</span><h3>Ask a product question</h3><p>Log in to ask Riseora something about this product.</p><Link className="button wide" to="/login">LOGIN TO ASK</Link></div>}
          </aside>
        </div>
      </section>

      <section id="reviews" className="container review-section phase3-section phase22-review-section">
        <div className="section-title-row"><div><p className="phase3-eyebrow">REAL EXPERIENCES</p><h2>Customer reviews</h2></div>{product.reviewCount > 0 && <span className="review-summary">★ {product.ratingAverage} / 5</span>}</div>
        <div className="phase22-review-overview">
          <div className="phase22-rating-score"><strong>{product.reviewCount ? Number(product.ratingAverage).toFixed(1) : "—"}</strong><span>★★★★★</span><small>{product.reviewCount} approved review{product.reviewCount === 1 ? "" : "s"}</small></div>
          <div className="phase22-rating-bars">{ratingDistribution.map((row) => <button type="button" key={row.rating} className={reviewFilter === row.rating ? "active" : ""} onClick={() => setReviewFilter((current) => current === row.rating ? 0 : row.rating)}><span>{row.rating} ★</span><i><b style={{ width: `${row.percent}%` }} /></i><small>{row.count}</small></button>)}</div>
        </div>
        {reviewFilter > 0 && <div className="phase22-review-filter-note">Showing {reviewFilter}-star reviews <button onClick={() => setReviewFilter(0)}>Show all</button></div>}
        <div className="reviews-layout">
          <div className="review-list">{visibleReviews.length ? visibleReviews.map((item) => <article className="review-card phase22-review-card" key={item.id}><div><span className="review-stars">{"★".repeat(item.rating)}{"☆".repeat(5-item.rating)}</span>{item.verifiedPurchase && <b>Verified purchase</b>}</div><h3>{item.title || "Customer review"}</h3><p>{item.comment}</p>{Array.isArray(item.images) && item.images.length > 0 && <div className="phase22-review-images">{item.images.map((src, index) => <a key={`${src}-${index}`} href={mediaUrl(src)} target="_blank" rel="noreferrer"><img src={mediaUrl(src)} alt={`${product.name} customer review ${index + 1}`} loading="lazy" /></a>)}</div>}<small>{item.user?.firstName || "Customer"}</small></article>) : <div className="empty-review">{reviewFilter ? `No ${reviewFilter}-star reviews yet.` : "No approved reviews yet. Be the first to share your experience."}</div>}</div>
          <div className="review-form-card">{user ? <form onSubmit={submitReview}><h3>Write a review</h3><p className="muted">Reviews and photos are checked by Riseora before publishing.</p><label>Rating<select value={review.rating} onChange={(e) => setReview({ ...review, rating: e.target.value })}><option value="5">5 - Excellent</option><option value="4">4 - Very good</option><option value="3">3 - Good</option><option value="2">2 - Fair</option><option value="1">1 - Poor</option></select></label><label>Title<input value={review.title} onChange={(e) => setReview({ ...review, title: e.target.value })} placeholder="Loved it" /></label><label>Review<textarea required minLength="5" value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} placeholder="Tell others about your experience" /></label><label className="phase22-review-upload">Add photos <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={chooseReviewFiles} /><small>Optional · JPG, PNG or WEBP · up to 4 photos · 5 MB each</small></label>{reviewFiles.length > 0 && <div className="phase22-selected-files">{reviewFiles.map((file) => <span key={`${file.name}-${file.lastModified}`}>{file.name}</span>)}</div>}<button className="black-button" type="submit" disabled={reviewBusy}>{reviewBusy ? "SUBMITTING…" : "SUBMIT REVIEW"}</button>{reviewMessage && <p className="review-message">{reviewMessage}</p>}</form> : <div><h3>Want to review this product?</h3><p>Log in to share your experience.</p><Link className="black-button" to="/login">LOGIN</Link></div>}</div>
        </div>
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
