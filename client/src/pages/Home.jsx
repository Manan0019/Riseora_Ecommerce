import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { Icon } from "../components/Icons";
import RichText from "../components/RichText";
import ProductCard from "../components/ProductCard";
import HeroCarousel from "../components/HeroCarousel";
import DealCard from "../components/DealCard";
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

function readRecentProducts() {
  try {
    const value = JSON.parse(localStorage.getItem("riseora_recent_products") || "[]");
    return Array.isArray(value) ? value.slice(0, 8) : [];
  } catch { return []; }
}

export default function Home() {
  const { store } = useStore();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [offers, setOffers] = useState([]);
  const [banners, setBanners] = useState([]);
  const [deals, setDeals] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setRecent(readRecentProducts());
    Promise.allSettled([
      apiFetch("/products"),
      apiFetch("/categories"),
      apiFetch("/promotions/offers"),
      apiFetch("/promotions/banners?placement=HOME_HERO"),
      apiFetch("/promotions/deals?featured=true"),
      apiFetch("/campaigns?featured=true&limit=3"),
    ]).then(([productResult, categoryResult, offerResult, bannerResult, dealResult, campaignResult]) => {
      if (productResult.status === "fulfilled") setProducts(productResult.value.data); else setError(productResult.reason?.message || "Unable to load products");
      if (categoryResult.status === "fulfilled") setCategories(categoryResult.value.data);
      if (offerResult.status === "fulfilled") setOffers(offerResult.value.data);
      if (bannerResult.status === "fulfilled") setBanners(bannerResult.value.data);
      if (dealResult.status === "fulfilled") setDeals(dealResult.value.data);
      if (campaignResult.status === "fulfilled") setCampaigns(campaignResult.value.data);
    });
  }, []);

  const heroSlides = banners.length ? banners : [fallbackBanner];
  const featured = useMemo(() => products.filter((item) => item.isFeatured).slice(0, 8), [products]);
  const trending = useMemo(() => [...products].sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0)).slice(0, 8), [products]);
  const newest = products.slice(0, 8);
  const bestsellers = featured.length ? featured : trending;

  const siteBase = (store.siteUrl || import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "");
  const organizationJson = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: store.storeName || "Riseora Herbals",
    url: siteBase,
    logo: store.logoUrl ? mediaUrl(store.logoUrl) : undefined,
    email: store.supportEmail || undefined,
    sameAs: [store.instagramUrl, store.facebookUrl, store.youtubeUrl].filter(Boolean),
  };
  const websiteJson = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: store.storeName || "Riseora Herbals",
    url: siteBase,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteBase}/shop?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return <div className="phase18-home">
    <Seo description={store.seoDescription || store.brandTagline} jsonLd={[organizationJson, websiteJson]} />

    {categories.length > 0 && <section className="container phase3-section category-section phase18-home-categories">
      <div className="section-title-row phase18-category-title"><div><p className="phase3-eyebrow">SHOP BY CATEGORY</p><h2>Pick your routine</h2></div><Link to="/shop">VIEW ALL</Link></div>
      <div className="round-category-row phase18-category-circles">
        {categories.slice(0, 10).map((category) => <Link key={category.id} to={`/shop?category=${category.slug}`}>
          <div className="round-category-art">{category.imageUrl ? <img src={mediaUrl(category.imageUrl)} alt={category.name} /> : <span>{category.name.charAt(0)}</span>}</div>
          <strong>{category.name}</strong>
        </Link>)}
      </div>
    </section>}

    <div className="phase18-home-hero"><HeroCarousel banners={heroSlides} /></div>

    <section className="quick-value-strip phase18-home-value"><div className="container">
      <span><Icon name="truck" size={18} /> {store.freeShippingThreshold ? `Free shipping above ₹${Number(store.freeShippingThreshold).toFixed(0)}` : "Delivery across India"}</span>
      <span><Icon name="shield" size={18} /> Secure checkout</span>
      <span><Icon name="leaf" size={18} /> Herbal-first care</span>
    </div></section>

    <div className="phase18-home-bestsellers"><ProductShelf title="Bestsellers" eyebrow="CUSTOMER FAVOURITES" products={bestsellers} empty={error} /></div>
    <div className="phase18-home-new"><ProductShelf title="Newly launched" eyebrow="FRESH PICKS" products={newest} /></div>

    {campaigns.length > 0 && <section className="container phase3-section phase43-home-campaigns">
      <div className="section-title-row"><div><p className="phase3-eyebrow">RISEORA EDITS</p><h2>Stories worth shopping</h2></div></div>
      <div className="phase43-home-campaign-grid">{campaigns.map((item) => <Link key={item.id} className={`phase43-home-campaign phase43-theme-${String(item.theme || "HERBAL").toLowerCase()}`} to={`/campaigns/${item.slug}`}><div className="phase43-home-campaign-image">{item.heroImageUrl ? <img src={mediaUrl(item.heroImageUrl)} alt={item.heroAlt || item.title} loading="lazy" /> : <span>R</span>}</div><div><small>{item.eyebrow || "RISEORA EDIT"}</small><h3>{item.title}</h3>{item.summary && <p>{item.summary}</p>}<strong>{item.ctaText || "DISCOVER THE EDIT"} →</strong></div></Link>)}</div>
    </section>}

    <div className="phase18-home-trending"><ProductShelf title="Trending now" eyebrow="WHAT'S HOT" products={trending} /></div>

    {offers.length > 0 && <section className="container phase3-section promo-card-row phase18-home-offers">
      {offers.slice(0, 3).map((offer, index) => <Link key={offer.id} to={offer.ctaLink || "/shop"} className={`promo-tile promo-tone-${(index % 3) + 1}`}><span>{offer.badge || "SPECIAL OFFER"}</span><h3>{offer.title}</h3>{offer.description && <RichText value={offer.description} />}<strong>{offer.ctaText || "SHOP NOW"} →</strong></Link>)}
    </section>}

    {deals.length > 0 && <section className="container phase3-section phase13-deals-section phase18-home-deals">
      <div className="section-title-row"><div><p className="phase3-eyebrow">BUILD YOUR ROUTINE</p><h2>Combos & automatic offers</h2></div><Link to="/offers">VIEW ALL</Link></div>
      <div className="phase13-deal-rail">{deals.slice(0, 4).map((deal) => <DealCard key={deal.id} deal={deal} compact />)}</div>
    </section>}

    {recent.length > 0 && <div className="phase18-home-recent"><ProductShelf title="Recently viewed" eyebrow="PICK UP WHERE YOU LEFT OFF" products={recent} /></div>}

    <section className="container phase14-routine-cta phase18-home-routine"><div><p className="phase3-eyebrow">MAKE IT YOURS</p><h2>Build your Riseora routine</h2><p>Choose up to four products, pick the sizes you prefer and add your full routine to the bag in one tap.</p><Link className="button" to="/routine-builder">BUILD MY ROUTINE <Icon name="arrow" size={17} /></Link></div><div className="phase14-routine-cta-steps"><span><b>01</b>Pick products</span><span><b>02</b>Choose sizes</span><span><b>03</b>Add together</span></div></section>

    <section className="brand-manifesto phase18-home-manifesto"><div className="container brand-manifesto-grid"><div><p className="phase3-eyebrow light">WHY RISEORA</p><h2>Herbal roots. Modern rituals.</h2><p>Riseora blends a grounded herbal identity with a clean shopping experience built for the way customers browse on mobile today.</p><Link className="white-outline-button" to="/shop">DISCOVER THE RANGE</Link></div><div className="manifesto-points"><span><b>01</b><strong>Clear choices</strong><small>Sizes, pricing and benefits that are easy to understand.</small></span><span><b>02</b><strong>Built for mobile</strong><small>Fast, thumb-friendly shopping from discovery to checkout.</small></span><span><b>03</b><strong>Order confidence</strong><small>Secure account, coupons and order tracking.</small></span></div></div></section>
  </div>;
}

function ProductShelf({ title, eyebrow, products, empty }) {
  return <section className="container phase3-section phase18-product-shelf"><div className="section-title-row"><div><p className="phase3-eyebrow">{eyebrow}</p><h2>{title}</h2></div><Link to="/shop">VIEW ALL</Link></div>{empty && <p className="alert error">{empty}</p>}{!empty && products.length === 0 ? <div className="empty-state phase3-empty"><span>R</span><h3>Products will appear here</h3><p>Add products from Admin and the storefront fills automatically.</p></div> : <div className="phase3-product-rail">{products.map((product) => <ProductCard key={product.id} product={product} compact />)}</div>}</section>;
}
