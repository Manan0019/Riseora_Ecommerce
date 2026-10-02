import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/http";
import { getAnalyticsConfiguration, openAnalyticsPreferences, trackEvent } from "../../lib/analytics";

function Status({ ok, children }) {
  return <span className={ok ? "phase30-status ok" : "phase30-status warn"}>{ok ? "READY" : "ACTION"} · {children}</span>;
}

export default function AdminGrowth() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const analytics = useMemo(() => getAnalyticsConfiguration(), []);

  useEffect(() => {
    apiFetch("/admin/growth/overview").then((response) => setData(response.data)).catch((err) => setError(err.message));
  }, []);

  async function copy(label, value) {
    try { await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(""), 1200); } catch { setCopied(""); }
  }

  function testAnalytics() {
    trackEvent("admin_growth_test", { source: "admin_growth" });
    window.alert(analytics.consent === "accepted" ? "Test event was sent to configured analytics providers." : "Analytics consent is not currently allowed in this browser. Use Privacy choices first if you want to test events.");
  }

  if (error) return <div className="admin-panel"><p className="alert error">{error}</p></div>;
  if (!data) return <div className="admin-panel"><div className="skeleton-card tall" /></div>;

  const { site, catalog, endpoints } = data;
  const catalogHealth = Math.max(0, catalog.productCount - catalog.missingImageProducts - catalog.missingDescriptionProducts);

  return <div className="phase30-growth-page">
    <div className="admin-page-heading"><div><p className="eyebrow">GROWTH & DISCOVERY</p><h1>SEO, feeds & analytics</h1><p>Launch health for search engines, Google Merchant and consent-aware commerce tracking.</p></div></div>

    <section className="phase30-growth-score-grid">
      <article><small>ACTIVE PRODUCTS</small><strong>{catalog.productCount}</strong><span>{catalog.activeVariantCount} sellable variants</span></article>
      <article><small>CATALOG HEALTH</small><strong>{catalogHealth}/{catalog.productCount}</strong><span>{catalog.missingImageProducts} missing image · {catalog.missingDescriptionProducts} missing copy</span></article>
      <article><small>OUT OF STOCK</small><strong>{catalog.outOfStockCount}</strong><span>active variants need replenishment</span></article>
      <article><small>LIVE OFFERS</small><strong>{catalog.activeDeals}</strong><span>included in the sitemap</span></article>
    </section>

    <section className="admin-panel phase30-growth-panel">
      <div className="admin-panel-head"><div><p className="eyebrow">SEARCH ENGINE READINESS</p><h2>Storefront SEO health</h2></div></div>
      <div className="phase30-health-list">
        <div><Status ok={site.hasSiteUrl}>Public site URL</Status><p>{site.publicBase}</p></div>
        <div><Status ok={site.hasSeoTitle}>SEO title</Status><p>{site.hasSeoTitle ? "Configured in Store Settings." : "Add a clear brand/homepage title in Admin → Settings."}</p></div>
        <div><Status ok={site.hasSeoDescription}>SEO description</Status><p>{site.hasSeoDescription ? "Configured in Store Settings." : "Add a concise homepage description in Admin → Settings."}</p></div>
        <div><Status ok={site.hasLogo}>Brand logo</Status><p>{site.hasLogo ? "Available for social/structured data." : "Upload a primary brand logo before launch."}</p></div>
        <div><Status ok={site.hasPrivacyPolicy && site.hasTermsPolicy}>Policies</Status><p>{site.hasPrivacyPolicy && site.hasTermsPolicy ? "Privacy and terms content are published." : "Publish privacy and terms content before production marketing."}</p></div>
      </div>
    </section>

    <section className="admin-panel phase30-growth-panel">
      <div className="admin-panel-head"><div><p className="eyebrow">GOOGLE DISCOVERY</p><h2>Machine-readable feeds</h2><p>These URLs are generated from the live catalog. No manual product spreadsheet is required.</p></div></div>
      <div className="phase30-feed-list">
        {[["Sitemap", endpoints.sitemap], ["Robots", endpoints.robots], ["Google Merchant", endpoints.merchantFeed]].map(([label, url]) => <div key={label}><span><strong>{label}</strong><code>{url}</code></span><div><button type="button" className="button button-secondary" onClick={() => copy(label, url)}>{copied === label ? "Copied ✓" : "Copy URL"}</button><a className="button button-secondary" href={url} target="_blank" rel="noreferrer">Open</a></div></div>)}
      </div>
      <p className="admin-help-note">Google Merchant feed includes active variants that have a product image. Products missing images are intentionally excluded because Merchant Center requires an image link.</p>
    </section>

    <section className="admin-panel phase30-growth-panel">
      <div className="admin-panel-head"><div><p className="eyebrow">CONSENT-AWARE MEASUREMENT</p><h2>Analytics configuration</h2></div></div>
      <div className="phase30-analytics-grid">
        <article><Status ok={Boolean(analytics.gaMeasurementId)}>Google Analytics 4</Status><strong>{analytics.gaMeasurementId || "Not configured"}</strong><small>Set VITE_GA_MEASUREMENT_ID in the client production environment.</small></article>
        <article><Status ok={Boolean(analytics.metaPixelId)}>Meta Pixel</Status><strong>{analytics.metaPixelId || "Not configured"}</strong><small>Set VITE_META_PIXEL_ID in the client production environment.</small></article>
        <article><Status ok={analytics.consent === "accepted"}>This browser</Status><strong>{analytics.consent === "accepted" ? "Analytics allowed" : analytics.consent === "essential" ? "Essential only" : "No choice yet"}</strong><small>Customer tracking remains off until optional analytics consent is granted.</small></article>
      </div>
      <div className="phase30-growth-actions"><button type="button" className="button button-secondary" onClick={openAnalyticsPreferences}>Open privacy choices</button><button type="button" className="button" onClick={testAnalytics}>Send test event</button></div>
    </section>
  </div>;
}
