import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { Icon } from "../components/Icons";
import ProductCard from "../components/ProductCard";
import Seo from "../components/Seo";
import { useStore } from "../context/StoreContext";

const fallbackBanner = {
  eyebrow: "RISEORA HERBALS",
  title: "Herbal care that looks as good as it feels.",
  description: "Thoughtfully made everyday care with a fresh, modern shopping experience.",
  ctaText: "SHOP NOW",
  ctaLink: "/shop",
  background: "#d8a693",
  textColor: "#11251c",
};

export default function Home() {
  const { store } = useStore();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [offers, setOffers] = useState([]);
  const [banners, setBanners] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.allSettled([apiFetch("/products"), apiFetch("/categories"), apiFetch("/promotions/offers"), apiFetch("/promotions/banners?placement=HOME_HERO")]).then(([productResult, categoryResult, offerResult, bannerResult]) => {
      if (productResult.status === "fulfilled") setProducts(productResult.value.data); else setError(productResult.reason?.message || "Unable to load products");
      if (categoryResult.status === "fulfilled") setCategories(categoryResult.value.data);
      if (offerResult.status === "fulfilled") setOffers(offerResult.value.data);
      if (bannerResult.status === "fulfilled") setBanners(bannerResult.value.data);
    });
  }, []);

  const hero = banners[0] || fallbackBanner;
  const featured = useMemo(() => products.filter((item) => item.isFeatured).slice(0, 8), [products]);
  const trending = useMemo(() => [...products].sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0)).slice(0, 8), [products]);
  const newest = products.slice(0, 8);

  const organizationJson = { "@context": "https://schema.org", "@type": "Organization", name: store.storeName || "Riseora Herbals", url: store.siteUrl || import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin, email: store.supportEmail || undefined };
  return <><Seo description={store.seoDescription || store.brandTagline} jsonLd={organizationJson} />
    <section className="campaign-hero" style={{ "--hero-bg": hero.background || "#d8a693", "--hero-color": hero.textColor || "#11251c" }}>
      <div className="container campaign-hero-grid">
        <div className="campaign-copy"><p className="hero-kicker">{hero.eyebrow || "RISEORA HERBALS"}</p><h1>{hero.title}</h1><p>{hero.description}</p><div className="campaign-actions"><Link className="black-button" to={hero.ctaLink || "/shop"}>{hero.ctaText || "SHOP NOW"}</Link><Link className="underlined-link" to="/offers">VIEW OFFERS</Link></div><div className="micro-trust"><span>✓ Secure checkout</span><span>✓ Delivery across India</span></div></div>
        <div className="campaign-visual">{hero.imageUrl ? <picture>{hero.mobileImageUrl && <source media="(max-width: 639px)" srcSet={mediaUrl(hero.mobileImageUrl)} />}<img src={mediaUrl(hero.imageUrl)} alt={hero.title} /></picture> : <div className="campaign-placeholder"><span>R</span><strong>RISEORA</strong><small>HERBALS</small><i>your campaign image</i></div>}</div>
      </div>
    </section>

    <section className="quick-value-strip"><div className="container"><span><Icon name="truck" size={18} /> {store.freeShippingThreshold ? `Free shipping above ₹${Number(store.freeShippingThreshold).toFixed(0)}` : "Delivery across India"}</span><span><Icon name="shield" size={18} /> Secure checkout</span><span><Icon name="leaf" size={18} /> Herbal-first care</span></div></section>

    {categories.length > 0 && <section className="container phase3-section category-section"><div className="section-title-row"><div><p className="phase3-eyebrow">SHOP BY CATEGORY</p><h2>Pick your routine</h2></div><Link to="/shop">VIEW ALL</Link></div><div className="round-category-row">{categories.slice(0, 8).map((category) => <Link key={category.id} to={`/shop?category=${category.slug}`}><div className="round-category-art">{category.imageUrl ? <img src={mediaUrl(category.imageUrl)} alt="" /> : <span>{category.name.charAt(0)}</span>}</div><strong>{category.name}</strong></Link>)}</div></section>}

    {offers.length > 0 && <section className="container phase3-section promo-card-row">{offers.slice(0, 3).map((offer, index) => <Link key={offer.id} to={offer.ctaLink || "/shop"} className={`promo-tile promo-tone-${(index % 3) + 1}`}><span>{offer.badge || "SPECIAL OFFER"}</span><h3>{offer.title}</h3><p>{offer.description}</p><strong>{offer.ctaText || "SHOP NOW"} →</strong></Link>)}</section>}

    <ProductShelf title="Bestsellers" eyebrow="CUSTOMER FAVOURITES" products={featured.length ? featured : trending} empty={error} />
    <ProductShelf title="Trending now" eyebrow="WHAT'S HOT" products={trending} />
    <ProductShelf title="New & noteworthy" eyebrow="FRESH PICKS" products={newest} />

    <section className="brand-manifesto"><div className="container brand-manifesto-grid"><div><p className="phase3-eyebrow light">WHY RISEORA</p><h2>Herbal roots. Modern rituals.</h2><p>Riseora blends a grounded herbal identity with a clean shopping experience built for the way customers browse on mobile today.</p><Link className="white-outline-button" to="/shop">DISCOVER THE RANGE</Link></div><div className="manifesto-points"><span><b>01</b><strong>Clear choices</strong><small>Sizes, pricing and benefits that are easy to understand.</small></span><span><b>02</b><strong>Built for mobile</strong><small>Fast, thumb-friendly shopping from discovery to checkout.</small></span><span><b>03</b><strong>Order confidence</strong><small>Secure account, coupons and order tracking.</small></span></div></div></section>
  </>;
}

function ProductShelf({ title, eyebrow, products, empty }) {
  return <section className="container phase3-section"><div className="section-title-row"><div><p className="phase3-eyebrow">{eyebrow}</p><h2>{title}</h2></div><Link to="/shop">VIEW ALL</Link></div>{empty && <p className="alert error">{empty}</p>}{!empty && products.length === 0 ? <div className="empty-state phase3-empty"><span>R</span><h3>Products will appear here</h3><p>Add products from Admin and the storefront fills automatically.</p></div> : <div className="phase3-product-rail">{products.map((product) => <ProductCard key={product.id} product={product} compact />)}</div>}</section>;
}
