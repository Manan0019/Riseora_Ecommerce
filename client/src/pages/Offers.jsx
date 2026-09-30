import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import { Icon } from "../components/Icons";
import DealCard from "../components/DealCard";

export default function Offers() {
  const [offers, setOffers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([apiFetch("/promotions/offers"), apiFetch("/promotions/deals")])
      .then(([offerResponse, dealResponse]) => { setOffers(offerResponse.data); setDeals(dealResponse.data); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container page-space offers-page">
      <div className="section-heading"><div><p className="eyebrow">PROMOTIONS</p><h1>Current offers</h1><p className="muted">Active promotions published by Riseora.</p></div></div>
      {loading && <div className="skeleton-card" />}
      {error && <p className="alert error">{error}</p>}
      {!loading && !error && offers.length === 0 && deals.length === 0 && <div className="empty-state premium-empty"><span className="empty-icon"><Icon name="tag" /></span><h3>No active offers right now</h3><p>New promotions will appear here when they are published.</p><Link className="button" to="/shop">Shop products</Link></div>}
      {deals.length > 0 && <section className="phase13-offers-deals"><div className="section-title-row"><div><p className="phase3-eyebrow">AUTOMATIC SAVINGS</p><h2>Combos & free gifts</h2></div></div><div className="phase13-deal-grid">{deals.map((deal) => <DealCard key={deal.id} deal={deal} />)}</div></section>}
      {offers.length > 0 && <section><div className="section-title-row"><div><p className="phase3-eyebrow">MORE OFFERS</p><h2>Storefront promotions</h2></div></div><div className="offer-list">{offers.map((offer) => <article className="offer-card" key={offer.id}><span className="offer-card-icon"><Icon name="sparkles" /></span><div><p className="eyebrow">{offer.badge || "RISEORA OFFER"}</p><h2>{offer.title}</h2>{offer.description && <p>{offer.description}</p>}<Link className="text-link" to={offer.ctaLink || "/shop"}>{offer.ctaText || "Shop now"} →</Link></div></article>)}</div></section>}
    </div>
  );
}
