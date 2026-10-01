import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import ProductCard from "../components/ProductCard";
import Seo from "../components/Seo";
import { Icon } from "../components/Icons";

export default function SharedWishlist() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/wishlist/shared/${token}`).then((response) => setData(response.data)).catch((e) => setError(e.message));
  }, [token]);

  if (error) return <div className="container page-space"><Seo title="Shared wishlist" noindex /><div className="empty-state premium-empty"><span className="empty-icon"><Icon name="heart" /></span><h2>Wishlist unavailable</h2><p>{error}</p><Link className="button" to="/shop">Explore Riseora</Link></div></div>;
  if (!data) return <div className="container page-space"><Seo title="Shared wishlist" noindex /><div className="skeleton-card tall" /></div>;

  return <div className="container page-space phase23-shared-wishlist">
    <Seo title="Shared wishlist" noindex />
    <div className="phase23-shared-hero"><span><Icon name="heart" size={22} /></span><div><p className="eyebrow">SHARED RISEORA LIST</p><h1>{data.title || "Riseora wishlist"}</h1><p>Fresh product prices and stock are shown below. This private link expires {new Date(data.expiresAt).toLocaleDateString()}.</p></div></div>
    {data.products?.length ? <div className="product-grid shop-grid">{data.products.map((product) => <ProductCard key={product.id} product={product} compact />)}</div> : <div className="empty-state"><h3>No available products remain in this list</h3><Link className="button" to="/shop">Shop current products</Link></div>}
  </div>;
}
