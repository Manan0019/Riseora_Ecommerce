import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, mediaUrl } from "../../api/http";
import RichTextEditor from "../../components/RichTextEditor";
import { Icon } from "../../components/Icons";

const emptyCampaign = {
  id: "", slug: "", eyebrow: "RISEORA EDIT", title: "", summary: "", body: "",
  heroImageUrl: "", mobileHeroImageUrl: "", heroAlt: "", ctaText: "SHOP THE EDIT", ctaLink: "/shop",
  secondaryCtaText: "", secondaryCtaLink: "", theme: "HERBAL", seoTitle: "", seoDescription: "",
  startsAt: "", endsAt: "", isPublished: false, isFeatured: false, priority: "0", productIds: [],
};

function dateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function iso(value) { return value ? new Date(value).toISOString() : null; }
function lifecycle(campaign) {
  if (!campaign.isPublished) return "DRAFT";
  const now = Date.now();
  if (campaign.startsAt && new Date(campaign.startsAt).getTime() > now) return "SCHEDULED";
  if (campaign.endsAt && new Date(campaign.endsAt).getTime() <= now) return "EXPIRED";
  return "LIVE";
}

export default function AdminContentStudio() {
  const [tab, setTab] = useState("campaigns");
  const [campaigns, setCampaigns] = useState([]);
  const [products, setProducts] = useState([]);
  const [media, setMedia] = useState([]);
  const [health, setHealth] = useState(null);
  const [campaign, setCampaign] = useState(emptyCampaign);
  const [productSearch, setProductSearch] = useState("");
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaKind, setMediaKind] = useState("");
  const [uploading, setUploading] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const [campaignRes, productRes, mediaRes, healthRes] = await Promise.all([
      apiFetch("/admin/campaigns"),
      apiFetch("/admin/products"),
      apiFetch(`/admin/media${mediaKind || mediaSearch ? `?${new URLSearchParams({ ...(mediaKind ? { kind: mediaKind } : {}), ...(mediaSearch ? { search: mediaSearch } : {}) }).toString()}` : ""}`),
      apiFetch("/admin/content/health"),
    ]);
    setCampaigns(campaignRes.data || []); setProducts(productRes.data || []); setMedia(mediaRes.data || []); setHealth(healthRes.data || null);
  }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (tab === "media") apiFetch(`/admin/media${mediaKind || mediaSearch ? `?${new URLSearchParams({ ...(mediaKind ? { kind: mediaKind } : {}), ...(mediaSearch ? { search: mediaSearch } : {}) }).toString()}` : ""}`).then((r) => setMedia(r.data || [])).catch((e) => setError(e.message)); }, [tab, mediaKind, mediaSearch]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((item) => !q || item.name.toLowerCase().includes(q) || item.variants?.some((v) => String(v.sku || "").toLowerCase().includes(q))).slice(0, 80);
  }, [products, productSearch]);

  function edit(item) {
    setCampaign({
      id: item.id, slug: item.slug || "", eyebrow: item.eyebrow || "", title: item.title || "", summary: item.summary || "", body: item.body || "",
      heroImageUrl: item.heroImageUrl || "", mobileHeroImageUrl: item.mobileHeroImageUrl || "", heroAlt: item.heroAlt || "", ctaText: item.ctaText || "", ctaLink: item.ctaLink || "",
      secondaryCtaText: item.secondaryCtaText || "", secondaryCtaLink: item.secondaryCtaLink || "", theme: item.theme || "HERBAL", seoTitle: item.seoTitle || "", seoDescription: item.seoDescription || "",
      startsAt: dateInput(item.startsAt), endsAt: dateInput(item.endsAt), isPublished: Boolean(item.isPublished), isFeatured: Boolean(item.isFeatured), priority: String(item.priority || 0),
      productIds: (item.products || []).map((row) => row.productId),
    });
    setTab("campaigns"); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetEditor() { setCampaign(emptyCampaign); setProductSearch(""); }
  function toggleProduct(id) { setCampaign((current) => ({ ...current, productIds: current.productIds.includes(id) ? current.productIds.filter((value) => value !== id) : [...current.productIds, id] })); }

  async function saveCampaign(event) {
    event.preventDefault(); setError(""); setMessage("");
    const payload = { ...campaign, priority: Number(campaign.priority || 0), startsAt: iso(campaign.startsAt), endsAt: iso(campaign.endsAt) };
    delete payload.id;
    try {
      await apiFetch(campaign.id ? `/admin/campaigns/${campaign.id}` : "/admin/campaigns", { method: campaign.id ? "PUT" : "POST", body: JSON.stringify(payload) });
      setMessage(campaign.id ? "Campaign updated." : "Campaign created as configured."); resetEditor(); await refresh();
    } catch (e) { setError(e.message); }
  }

  async function duplicate(item) {
    if (!window.confirm(`Duplicate “${item.title}” as a draft?`)) return;
    try { await apiFetch(`/admin/campaigns/${item.id}/duplicate`, { method: "POST" }); setMessage("Draft copy created."); await refresh(); } catch (e) { setError(e.message); }
  }
  async function remove(item) {
    if (!window.confirm(`Delete campaign “${item.title}”?`)) return;
    try { await apiFetch(`/admin/campaigns/${item.id}`, { method: "DELETE" }); if (campaign.id === item.id) resetEditor(); await refresh(); } catch (e) { setError(e.message); }
  }

  async function uploadImage(file, field = "library") {
    if (!file) return;
    setUploading(field); setError("");
    const body = new FormData(); body.append("image", file);
    try {
      const response = await apiFetch("/admin/uploads/campaigns", { method: "POST", body });
      if (field === "heroImageUrl" || field === "mobileHeroImageUrl") setCampaign((current) => ({ ...current, [field]: response.data.url, heroAlt: current.heroAlt || file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") }));
      setMessage("Image uploaded to Media Library."); await refresh();
    } catch (e) { setError(e.message); } finally { setUploading(""); }
  }

  async function indexExistingMedia() {
    setError(""); setMessage("");
    try { const response = await apiFetch("/admin/media/index-existing", { method: "POST" }); setMessage(`Indexed ${response.data.indexed} existing storefront media references.`); await refresh(); } catch (e) { setError(e.message); }
  }

  async function updateAsset(asset, changes) {
    try { await apiFetch(`/admin/media/${asset.id}`, { method: "PATCH", body: JSON.stringify(changes) }); await refresh(); } catch (e) { setError(e.message); }
  }

  async function copy(value) {
    try { await navigator.clipboard.writeText(value); setMessage("Media URL copied."); } catch { setMessage("Copy the URL from the field."); }
  }

  return <>
    <div className="admin-page-heading phase43-content-heading"><div><p className="eyebrow">CONTENT STUDIO</p><h1>Campaigns, media & publishing quality</h1><p>Build scheduled campaign pages, curate products, manage reusable imagery and catch content gaps before customers see them.</p></div><span className="phase27-live-badge"><i /> PRODUCTION CONTENT</span></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

    <section className="phase43-content-health">
      <div><small>CAMPAIGNS</small><strong>{health?.campaigns?.total ?? "—"}</strong><span>{health?.campaigns?.live ?? 0} live · {health?.campaigns?.scheduled ?? 0} scheduled</span></div>
      <div><small>CAMPAIGN QA</small><strong>{health?.campaigns?.issues?.length ?? "—"}</strong><span>items needing attention</span></div>
      <div><small>BANNER QA</small><strong>{health?.banners?.issues?.length ?? "—"}</strong><span>image/mobile/alt gaps</span></div>
      <div><small>MEDIA LIBRARY</small><strong>{health?.media?.total ?? "—"}</strong><span>{health?.media?.missingAlt ?? 0} without alt text</span></div>
    </section>

    <div className="phase43-content-tabs"><button className={tab === "campaigns" ? "active" : ""} onClick={() => setTab("campaigns")}>Campaigns</button><button className={tab === "media" ? "active" : ""} onClick={() => setTab("media")}>Media Library</button><button className={tab === "quality" ? "active" : ""} onClick={() => setTab("quality")}>Content QA</button></div>

    {tab === "campaigns" && <div className="phase43-content-layout">
      <form className="admin-panel admin-form phase43-campaign-editor" onSubmit={saveCampaign}>
        <div className="admin-panel-head"><div><h2>{campaign.id ? "Edit campaign" : "Create campaign"}</h2><p>Publish now or schedule the exact launch window. Drafts are never exposed publicly.</p></div>{campaign.id && <button type="button" className="button button-secondary" onClick={resetEditor}>New</button>}</div>
        <div className="admin-field-grid two"><label>Eyebrow<input value={campaign.eyebrow} onChange={(e) => setCampaign({ ...campaign, eyebrow: e.target.value })} /></label><label>Slug<input value={campaign.slug} onChange={(e) => setCampaign({ ...campaign, slug: e.target.value })} placeholder="auto-from-title" /></label></div>
        <label>Campaign title<input required value={campaign.title} onChange={(e) => setCampaign({ ...campaign, title: e.target.value })} /></label>
        <label>Short summary<textarea rows="3" maxLength="600" value={campaign.summary} onChange={(e) => setCampaign({ ...campaign, summary: e.target.value })} /></label>
        <div className="phase43-media-pair">
          <MediaField label="Desktop hero" value={campaign.heroImageUrl} uploading={uploading === "heroImageUrl"} onUpload={(file) => uploadImage(file, "heroImageUrl")} onChange={(value) => setCampaign({ ...campaign, heroImageUrl: value })} />
          <MediaField label="Mobile hero" value={campaign.mobileHeroImageUrl} uploading={uploading === "mobileHeroImageUrl"} onUpload={(file) => uploadImage(file, "mobileHeroImageUrl")} onChange={(value) => setCampaign({ ...campaign, mobileHeroImageUrl: value })} />
        </div>
        {(campaign.heroImageUrl || campaign.mobileHeroImageUrl) && <div className="phase43-campaign-preview"><picture>{campaign.mobileHeroImageUrl && <source media="(max-width:720px)" srcSet={mediaUrl(campaign.mobileHeroImageUrl)} />}{campaign.heroImageUrl && <img src={mediaUrl(campaign.heroImageUrl)} alt={campaign.heroAlt || "Campaign preview"} />}</picture><div><small>LIVE PREVIEW</small><strong>{campaign.title || "Campaign title"}</strong><span>{campaign.summary || "Campaign summary will appear here."}</span></div></div>}
        <label>Hero image alt text<input value={campaign.heroAlt} onChange={(e) => setCampaign({ ...campaign, heroAlt: e.target.value })} placeholder="Describe the image for accessibility and SEO" /></label>
        <div className="admin-field-grid two"><label>Primary CTA text<input value={campaign.ctaText} onChange={(e) => setCampaign({ ...campaign, ctaText: e.target.value })} /></label><label>Primary CTA path<input value={campaign.ctaLink} onChange={(e) => setCampaign({ ...campaign, ctaLink: e.target.value })} placeholder="/shop" /></label></div>
        <div className="admin-field-grid two"><label>Secondary CTA text<input value={campaign.secondaryCtaText} onChange={(e) => setCampaign({ ...campaign, secondaryCtaText: e.target.value })} /></label><label>Secondary CTA path<input value={campaign.secondaryCtaLink} onChange={(e) => setCampaign({ ...campaign, secondaryCtaLink: e.target.value })} /></label></div>
        <label>Campaign story<RichTextEditor value={campaign.body} onChange={(value) => setCampaign({ ...campaign, body: value })} placeholder="Tell the story behind this edit, season or ritual." /></label>
        <div className="admin-field-grid three"><label>Theme<select value={campaign.theme} onChange={(e) => setCampaign({ ...campaign, theme: e.target.value })}><option>HERBAL</option><option>IVORY</option><option>ROSE</option><option>MIDNIGHT</option><option>GOLD</option></select></label><label>Start date/time<input type="datetime-local" value={campaign.startsAt} onChange={(e) => setCampaign({ ...campaign, startsAt: e.target.value })} /></label><label>End date/time<input type="datetime-local" value={campaign.endsAt} onChange={(e) => setCampaign({ ...campaign, endsAt: e.target.value })} /></label></div>
        <div className="admin-field-grid two"><label>SEO title<input maxLength="70" value={campaign.seoTitle} onChange={(e) => setCampaign({ ...campaign, seoTitle: e.target.value })} /></label><label>SEO description<textarea maxLength="180" value={campaign.seoDescription} onChange={(e) => setCampaign({ ...campaign, seoDescription: e.target.value })} /></label></div>
        <div className="phase43-publish-controls"><label className="checkbox-row"><input type="checkbox" checked={campaign.isPublished} onChange={(e) => setCampaign({ ...campaign, isPublished: e.target.checked })} /> Published</label><label className="checkbox-row"><input type="checkbox" checked={campaign.isFeatured} onChange={(e) => setCampaign({ ...campaign, isFeatured: e.target.checked })} /> Feature on homepage</label><label>Priority<input type="number" min="0" max="10000" value={campaign.priority} onChange={(e) => setCampaign({ ...campaign, priority: e.target.value })} /></label></div>

        <section className="phase43-product-picker"><div className="editor-section-head"><div><strong>Campaign products</strong><small>{campaign.productIds.length} selected · drag ordering is intentionally avoided; click order becomes display order.</small></div></div><input placeholder="Search products or SKU" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} /><div className="phase43-product-picker-grid">{filteredProducts.map((item) => <button type="button" key={item.id} className={campaign.productIds.includes(item.id) ? "selected" : ""} onClick={() => toggleProduct(item.id)}><span>{campaign.productIds.includes(item.id) ? "✓" : "+"}</span><div><strong>{item.name}</strong><small>{item.variants?.[0]?.sku || item.category?.name || "Riseora"}</small></div></button>)}</div></section>
        <button className="button">{campaign.id ? "UPDATE CAMPAIGN" : "CREATE CAMPAIGN"}</button>
      </form>

      <section className="admin-panel phase43-campaign-list"><div className="admin-panel-head"><div><h2>Publishing calendar</h2><p>Draft, scheduled, live and expired campaigns in one place.</p></div></div>{campaigns.length === 0 ? <div className="admin-empty"><strong>No campaigns yet</strong><p>Create your first seasonal edit or launch story.</p></div> : campaigns.map((item) => { const status = lifecycle(item); return <article key={item.id} className="phase43-campaign-row"><div className="phase43-campaign-thumb">{item.heroImageUrl ? <img src={mediaUrl(item.heroImageUrl)} alt={item.heroAlt || item.title} /> : <span>R</span>}</div><div className="phase43-campaign-row-main"><div><span className={`phase43-status ${status.toLowerCase()}`}>{status}</span>{item.isFeatured && <span className="phase43-featured">FEATURED</span>}</div><strong>{item.title}</strong><small>/campaigns/{item.slug}</small><p>{item.summary || "No summary yet."}</p><div className="phase43-row-actions">{status === "LIVE" && <Link to={`/campaigns/${item.slug}`} target="_blank">View live</Link>}<button onClick={() => edit(item)}>Edit</button><button onClick={() => duplicate(item)}>Duplicate</button><button className="danger-link" onClick={() => remove(item)}>Delete</button></div></div></article>; })}</section>
    </div>}

    {tab === "media" && <section className="admin-panel phase43-media-library"><div className="admin-panel-head"><div><h2>Media Library</h2><p>Every new Admin product, brand, category and campaign upload is indexed here for reuse and accessibility QA.</p></div><div className="phase43-media-head-actions"><button type="button" className="button button-secondary" onClick={indexExistingMedia}>Index existing media</button><label className="button button-secondary">{uploading === "library" ? "Uploading…" : "Upload campaign media"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadImage(e.target.files?.[0], "library")} /></label></div></div><div className="phase43-media-filters"><input placeholder="Search filename, alt text or URL" value={mediaSearch} onChange={(e) => setMediaSearch(e.target.value)} /><select value={mediaKind} onChange={(e) => setMediaKind(e.target.value)}><option value="">All types</option><option value="PRODUCT">Products</option><option value="CATEGORY">Categories</option><option value="CAMPAIGN">Campaigns</option><option value="BRAND">Brand</option></select></div><div className="phase43-media-grid">{media.map((asset) => <article key={asset.id}><div className="phase43-media-image"><img src={mediaUrl(asset.url)} alt={asset.altText || asset.originalName || "Riseora media"} loading="lazy" /></div><div><span>{asset.kind}</span><strong>{asset.originalName || "Riseora image"}</strong><small>{asset.sizeBytes ? `${Math.round(asset.sizeBytes / 1024)} KB` : asset.storage}</small><input defaultValue={asset.altText || ""} placeholder="Alt text" onBlur={(e) => e.target.value !== (asset.altText || "") && updateAsset(asset, { altText: e.target.value })} /><div className="phase43-row-actions"><button onClick={() => copy(asset.url)}>Copy URL</button><button onClick={() => updateAsset(asset, { isArchived: true })}>Archive</button></div></div></article>)}</div>{media.length === 0 && <div className="admin-empty"><strong>No matching media</strong><p>New Admin uploads will appear here automatically.</p></div>}</section>}

    {tab === "quality" && <div className="phase43-quality-grid"><QualityPanel title="Campaign issues" items={health?.campaigns?.issues || []} type="campaign" /><QualityPanel title="Banner issues" items={health?.banners?.issues || []} type="banner" /><section className="admin-panel"><div className="admin-panel-head"><div><h2>Media accessibility</h2><p>Alt text helps accessibility, image search and future content reuse.</p></div></div><div className="phase43-quality-number">{health?.media?.missingAlt ?? 0}</div><p className="muted">active Media Library assets are missing alt text.</p><button className="button button-secondary" onClick={() => setTab("media")}>OPEN MEDIA LIBRARY</button></section></div>}
  </>;
}

function MediaField({ label, value, uploading, onUpload, onChange }) {
  return <label>{label}<div className="phase43-upload-field"><input value={value} onChange={(e) => onChange(e.target.value)} placeholder="/uploads/... or https://..." /><span className="state-toggle active">{uploading ? "Uploading…" : "Upload"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => onUpload(e.target.files?.[0])} /></span></div></label>;
}
function QualityPanel({ title, items, type }) {
  return <section className="admin-panel"><div className="admin-panel-head"><div><h2>{title}</h2><p>{items.length ? "Resolve these before the next campaign push." : "No current content quality issues."}</p></div><span className={items.length ? "phase43-qa-count warn" : "phase43-qa-count"}>{items.length}</span></div>{items.length === 0 ? <div className="admin-empty"><strong>Looking good</strong><p>{type === "campaign" ? "Campaign SEO and hero media are complete." : "Active banner media is ready."}</p></div> : <div className="phase43-qa-list">{items.map((item) => <article key={item.id}><strong>{item.title}</strong><small>{item.slug ? `/campaigns/${item.slug}` : "Homepage banner"}</small><ul>{item.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></article>)}</div>}</section>;
}
