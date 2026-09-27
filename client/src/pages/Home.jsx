import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import ProductCard from "../components/ProductCard";

export default function Home() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/products?featured=true")
      .then((response) => setProducts(response.data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">RISEORA HERBALS</p>
            <h1>Herbal care designed for everyday rituals.</h1>
            <p className="hero-copy">A clean storefront foundation ready for your real Riseora products, photography, benefits and brand story.</p>
            <div className="hero-actions">
              <Link className="button" to="/shop">Shop products</Link>
              <a className="button button-secondary" href="#why-riseora">Why Riseora</a>
            </div>
          </div>
          <div className="hero-card">
            <div className="hero-orbit">R</div>
            <p>Replace this brand panel with your final campaign/product photography.</p>
          </div>
        </div>
      </section>

      <section id="why-riseora" className="container page-space">
        <div className="section-heading">
          <div><p className="eyebrow">OUR APPROACH</p><h2>Simple, trustworthy shopping</h2></div>
        </div>
        <div className="feature-grid">
          <div className="feature-card"><strong>Clear catalogue</strong><p>Variants, MRP, selling price and stock are structured for future ERP sync.</p></div>
          <div className="feature-card"><strong>Secure foundation</strong><p>Credentials stay outside the public repository and passwords are hashed.</p></div>
          <div className="feature-card"><strong>Order ready</strong><p>COD checkout creates transactional orders and reduces stock safely.</p></div>
        </div>
      </section>

      <section className="container page-space">
        <div className="section-heading">
          <div><p className="eyebrow">FEATURED</p><h2>Featured products</h2></div>
          <Link to="/shop">View all →</Link>
        </div>
        {error && <p className="alert error">{error}</p>}
        {!error && products.length === 0 ? (
          <div className="empty-state">No featured products yet. Add your real catalogue from the Admin page.</div>
        ) : (
          <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
        )}
      </section>
    </>
  );
}
