import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import ProductCard from "../components/ProductCard";
import RichText from "../components/RichText";
import Seo from "../components/Seo";
import { Icon } from "../components/Icons";

export default function CampaignDetails() {
  const { slug } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError(""); setCampaign(null);
    apiFetch(`/campaigns/${encodeURIComponent(slug || "")}`).then((response) => setCampaign(response.data)).catch((e) => setError(e.message));
  }, [slug]);

  const schema = useMemo(() => campaign ? {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: campaign.seoTitle || campaign.title,
    description: campaign.seoDescription || campaign.summary || undefined,
    image: campaign.heroImageUrl ? mediaUrl(campaign.heroImageUrl) : undefined,
    mainEntity: { "@type": "ItemList", itemListElement: (campaign.products || []).map((product, index) => ({ "@type": "ListItem", position: index + 1, name: product.name, url: `/product/${product.slug}` })) },
  } : null, [campaign]);

  if (error) return <main className="container phase43-campaign-state"><p className="eyebrow">CAMPAIGN</p><h1>This campaign is unavailable.</h1><p>{error}</p><Link className="button" to="/shop">Explore Riseora</Link></main>;
  if (!campaign) return <div className="route-loading phase18-route-loading"><span /><i /><i /></div>;

  return <main className={`phase43-campaign-page phase43-theme-${String(campaign.theme || "HERBAL").toLowerCase()}`}>
    <Seo title={campaign.seoTitle || campaign.title} description={campaign.seoDescription || campaign.summary} image={campaign.heroImageUrl ? mediaUrl(campaign.heroImageUrl) : undefined} jsonLd={schema} />
    <section className="phase43-campaign-hero">
      <picture className="phase43-campaign-media">
        {campaign.mobileHeroImageUrl && <source media="(max-width: 720px)" srcSet={mediaUrl(campaign.mobileHeroImageUrl)} />}
        {campaign.heroImageUrl ? <img src={mediaUrl(campaign.heroImageUrl)} alt={campaign.heroAlt || campaign.title} fetchPriority="high" /> : <div className="phase43-campaign-placeholder"><span>R</span></div>}
      </picture>
      <div className="container phase43-campaign-copy">
        <p className="phase3-eyebrow">{campaign.eyebrow || "RISEORA EDIT"}</p>
        <h1>{campaign.title}</h1>
        {campaign.summary && <p>{campaign.summary}</p>}
        <div className="phase43-campaign-actions">
          {campaign.ctaText && campaign.ctaLink && <Link className="button" to={campaign.ctaLink}>{campaign.ctaText} <Icon name="arrow" size={17} /></Link>}
          {campaign.secondaryCtaText && campaign.secondaryCtaLink && <Link className="button button-secondary" to={campaign.secondaryCtaLink}>{campaign.secondaryCtaText}</Link>}
        </div>
      </div>
    </section>

    {campaign.body && <section className="container phase43-editorial-copy"><RichText value={campaign.body} /></section>}

    {(campaign.products || []).length > 0 && <section className="container phase3-section phase43-campaign-products">
      <div className="section-title-row"><div><p className="phase3-eyebrow">THE EDIT</p><h2>Shop this campaign</h2></div><Link to="/shop">VIEW ALL</Link></div>
      <div className="phase3-product-rail">{campaign.products.map((product) => <ProductCard key={product.id} product={product} compact />)}</div>
    </section>}

    <section className="container phase43-campaign-endcap"><div><p className="phase3-eyebrow">EXPLORE MORE</p><h2>Keep discovering your Riseora ritual.</h2></div><Link className="button button-secondary" to="/shop">SHOP ALL PRODUCTS</Link></section>
  </main>;
}
