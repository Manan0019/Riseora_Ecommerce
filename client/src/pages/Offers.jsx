import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import { Icon } from "../components/Icons";

export default function Offers() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/promotions/offers")
      .then((response) => setOffers(response.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container page-space offers-page">
      <div className="section-heading"><div><p className="eyebrow">PROMOTIONS</p><h1>Current offers</h1><p className="muted">Active promotions published by Riseora.</p></div></div>
      {loading && <div className="skeleton-card" />}
      {error && <p className="alert error">{error}</p>}
      {!loading && !error && offers.length === 0 && <div className="empty-state premium-empty"><span className="empty-icon"><Icon name="tag" /></span><h3>No active offers right now</h3><p>New promotions will appear here when they are published.</p><Link className="button" to="/shop">Shop products</Link></div>}
      <div className="offer-list">{offers.map((offer) => <article className="offer-card" key={offer.id}><span className="offer-card-icon"><Icon name="sparkles" /></span><div><p className="eyebrow">{offer.badge || "RISEORA OFFER"}</p><h2>{offer.title}</h2>{offer.description && <p>{offer.description}</p>}<Link className="text-link" to={offer.ctaLink || "/shop"}>{offer.ctaText || "Shop now"} →</Link></div></article>)}</div>
    </div>
  );
}
