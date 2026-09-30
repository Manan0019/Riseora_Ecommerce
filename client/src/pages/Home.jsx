import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import { Icon } from "../components/Icons";
import ProductCard from "../components/ProductCard";

export default function Home() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [offers, setOffers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.allSettled([
      apiFetch("/products?featured=true"),
      apiFetch("/categories"),
      apiFetch("/promotions/offers"),
    ]).then(([productResult, categoryResult, offerResult]) => {
      if (productResult.status === "fulfilled") setProducts(productResult.value.data);
      else setError(productResult.reason?.message || "Unable to load products");
      if (categoryResult.status === "fulfilled") setCategories(categoryResult.value.data);
      if (offerResult.status === "fulfilled") setOffers(offerResult.value.data);
    });
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-content">
            <span className="hero-pill"><Icon name="leaf" size={16} /> RISEORA HERBALS</span>
            <h1>Care that feels <em>closer to nature.</em></h1>
            <p className="hero-copy">Thoughtfully presented herbal products for simple, everyday routines.</p>
            <div className="hero-actions">
              <Link className="button hero-primary" to="/shop">Shop now <Icon name="arrow" size={18} /></Link>
              <Link className="text-link" to="/offers">Explore offers <span>→</span></Link>
            </div>
            <div className="hero-trust">
              <span><Icon name="shield" size={17} /> Secure checkout</span>
              <span><Icon name="truck" size={17} /> Delivery across India</span>
            </div>
          </div>

          <div className="hero-visual" aria-label="Riseora brand visual">
            <div className="hero-glow hero-glow-one" />
            <div className="hero-glow hero-glow-two" />
            <div className="hero-leaf hero-leaf-one">⌁</div>
            <div className="hero-leaf hero-leaf-two">⌁</div>
            <div className="hero-bottle">
              <div className="bottle-cap" />
              <div className="bottle-label">
                <span className="bottle-r">R</span>
                <strong>RISEORA</strong>
                <small>HERBALS</small>
              </div>
            </div>
            <div className="hero-visual-copy">
              <span>Everyday ritual</span>
              <strong>Herbal care, beautifully simple.</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="container trust-strip" aria-label="Store benefits">
        <div><Icon name="leaf" /><span><strong>Herbal-first</strong><small>Thoughtful product range</small></span></div>
        <div><Icon name="shield" /><span><strong>Secure</strong><small>Protected account & checkout</small></span></div>
        <div><Icon name="truck" /><span><strong>Order ready</strong><small>Track purchases easily</small></span></div>
      </section>

      {categories.length > 0 && (
        <section className="container section-block category-section">
          <div className="section-heading mobile-heading">
            <div><p className="eyebrow">SHOP BY CATEGORY</p><h2>Find your ritual</h2></div>
            <Link className="section-link" to="/shop">View all</Link>
          </div>
          <div className="category-scroller">
            {categories.slice(0, 8).map((category, index) => (
              <Link key={category.id} className={`category-card category-tone-${(index % 4) + 1}`} to={`/shop?category=${category.slug}`}>
                <div className="category-art">{category.imageUrl ? <img src={category.imageUrl} alt="" /> : <span>{category.name.charAt(0)}</span>}</div>
                <strong>{category.name}</strong>
                <small>Explore</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      {offers.length > 0 && (
        <section className="container section-block">
          <div className="offer-banner">
            <div>
              <p className="eyebrow light">LIMITED OFFER</p>
              <h2>{offers[0].title}</h2>
              {offers[0].description && <p>{offers[0].description}</p>}
            </div>
            <Link className="button button-light" to={offers[0].ctaLink || "/shop"}>{offers[0].ctaText || "Shop now"}</Link>
          </div>
        </section>
      )}

      <section className="container section-block featured-section">
        <div className="section-heading mobile-heading">
          <div><p className="eyebrow">FEATURED</p><h2>Made for your routine</h2></div>
          <Link className="section-link" to="/shop">See all</Link>
        </div>
        {error && <p className="alert error">{error}</p>}
        {!error && products.length === 0 ? (
          <div className="empty-state premium-empty"><span className="empty-icon"><Icon name="sparkles" /></span><h3>Your catalogue is ready for products</h3><p>Add products from the Admin dashboard and featured items will appear here automatically.</p></div>
        ) : (
          <div className="featured-scroller product-grid">{products.map((product) => <ProductCard key={product.id} product={product} compact />)}</div>
        )}
      </section>

      <section className="story-section section-block">
        <div className="container story-grid">
          <div className="story-art">
            <div className="story-circle">R</div>
            <span className="story-note">A calmer way to shop herbal care</span>
          </div>
          <div className="story-copy">
            <p className="eyebrow">WHY RISEORA</p>
            <h2>Simple choices. Clear information. Easy ordering.</h2>
            <p>Browse products, choose the right size, review pricing and place your order from a fast mobile-first experience.</p>
            <Link className="button button-secondary" to="/shop">Explore the collection</Link>
          </div>
        </div>
      </section>

      <section className="container section-block app-note">
        <div><Icon name="heart" size={26} /><span><strong>Built mobile first</strong><small>Fast navigation, thumb-friendly controls and a clean checkout flow.</small></span></div>
      </section>
    </>
  );
}
