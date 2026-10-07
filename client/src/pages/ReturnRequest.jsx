import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";

const reasons = ["Product damaged", "Wrong product received", "Quality issue", "Leaking / broken seal", "Changed my mind", "Other"];
const evidenceReasons = /damaged|wrong|quality|leak|broken|unsafe|reaction/i;

export default function ReturnRequest() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState({});
  const [replacement, setReplacement] = useState({});
  const [resolution, setResolution] = useState("REFUND");
  const [reason, setReason] = useState(reasons[0]);
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch(`/orders/my/${orderNumber}`), apiFetch(`/returns/eligibility/${orderNumber}`), apiFetch("/store/config")])
      .then(([orderResponse, eligibilityResponse, configResponse]) => {
        setOrder(orderResponse.data); setEligibility(eligibilityResponse.data); setSettings(configResponse.data);
        const defaults = {};
        (eligibilityResponse.data.items || []).forEach((item) => { if (item.replacementOptions?.[0]) defaults[item.id] = item.replacementOptions.find((v) => v.sku === item.sku)?.id || item.replacementOptions[0].id; });
        setReplacement(defaults);
      }).catch((e) => setError(e.message));
  }, [orderNumber]);

  const eligibleById = useMemo(() => new Map((eligibility?.items || []).map((item) => [item.id, item])), [eligibility]);
  const chosen = useMemo(() => order ? order.items.flatMap((item) => {
    const quantity = Number(selected[item.id] || 0);
    return quantity > 0 ? [{ orderItemId: item.id, quantity, replacementVariantId: resolution === "REPLACEMENT" ? replacement[item.id] || null : null }] : [];
  }) : [], [order, selected, replacement, resolution]);

  function chooseFiles(event) {
    const picked = Array.from(event.target.files || []).slice(0, 4);
    if (picked.some((file) => file.size > 5 * 1024 * 1024)) return setError("Each evidence image must be 5 MB or smaller.");
    setError(""); setFiles(picked);
  }
  async function uploadEvidence() {
    if (!files.length) return [];
    const body = new FormData(); files.forEach((file) => body.append("images", file));
    const response = await apiFetch("/uploads/returns", { method: "POST", body });
    return (response.data || []).map((item) => ({ url: item.url, publicId: item.publicId || null, originalName: item.originalName || null }));
  }
  async function submit(event) {
    event.preventDefault(); setError("");
    if (!chosen.length) return setError("Choose at least one item and quantity to return.");
    if (resolution === "REPLACEMENT" && chosen.some((item) => !item.replacementVariantId)) return setError("Choose a replacement option for every selected item.");
    if (evidenceReasons.test(reason) && !files.length) return setError("Add at least one clear photo for this return reason.");
    setSubmitting(true);
    try {
      const evidence = await uploadEvidence();
      const response = await apiFetch("/returns", { method: "POST", body: JSON.stringify({ orderNumber, reason, details, preferredResolution: resolution, items: chosen, evidence }) });
      navigate(`/returns/${response.data.id}`);
    } catch (e) { setError(e.message); } finally { setSubmitting(false); }
  }

  if (error && !order) return <div className="container page-space"><p className="alert error">{error}</p></div>;
  if (!order || !eligibility) return <div className="container page-space"><div className="skeleton-card tall" /></div>;
  if (!eligibility.eligible) return <div className="container page-space"><p className="alert error">This order is not currently eligible for a return. The order must be delivered and inside the active return window.</p><Link to={`/orders/${orderNumber}`}>← Back to order</Link></div>;

  return <div className="container page-space return-request-page phase83-return-request">
    <Link className="back-link" to={`/orders/${orderNumber}`}>← Back to order</Link>
    <div className="checkout-heading"><p className="eyebrow">PHASE 83 · RETURN RESOLUTION</p><h1>Return, refund or replacement</h1><p>Choose what you need, select exact quantities, and share evidence once. Riseora will track review, pickup, inspection and final resolution in one case.</p></div>
    {error && <p className="alert error">{error}</p>}
    <div className="phase83-return-window"><span>RETURN WINDOW</span><strong>Eligible until {new Date(eligibility.deadline).toLocaleDateString()}</strong><small>{settings?.returnWindowDays ?? eligibility.returnWindowDays}-day policy</small></div>

    <form className="return-request-layout" onSubmit={submit}>
      <section className="form-card"><h2>1. Choose your resolution</h2><div className="phase83-resolution-choice"><button type="button" className={resolution === "REFUND" ? "active" : ""} onClick={() => setResolution("REFUND")}><strong>Refund</strong><span>Return eligible items and receive the approved amount after inspection.</span></button><button type="button" className={resolution === "REPLACEMENT" ? "active" : ""} onClick={() => setResolution("REPLACEMENT")}><strong>Replacement</strong><span>Choose the same or another active variant of the same product.</span></button></div></section>

      <section className="form-card"><h2>2. Choose items</h2><div className="return-select-items">{order.items.map((item) => {
        const eligible = eligibleById.get(item.id); const max = eligible?.remainingReturnable ?? 0; const qty = Number(selected[item.id] || 0);
        return <div key={item.id} className="return-select-row phase83-return-line"><div><strong>{item.productName}</strong><span>{item.variantName || item.sku}</span><small>Purchased {item.quantity} · {max} still returnable</small></div><label>Return qty<select value={qty} onChange={(e) => setSelected((current) => ({ ...current, [item.id]: Number(e.target.value) }))}><option value={0}>0</option>{Array.from({ length: max }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>{resolution === "REPLACEMENT" && qty > 0 && <label className="phase83-replacement-select">Replacement<select value={replacement[item.id] || ""} onChange={(e) => setReplacement((current) => ({ ...current, [item.id]: e.target.value }))}><option value="">Choose option</option>{(eligible?.replacementOptions || []).map((variant) => <option key={variant.id} value={variant.id} disabled={variant.available < qty}>{variant.name} {variant.size ? `· ${variant.size}${variant.unit || ""}` : ""} · {variant.available} available</option>)}</select></label>}</div>;
      })}</div></section>

      <section className="form-card"><h2>3. Reason & evidence</h2><label>Reason<select value={reason} onChange={(e) => setReason(e.target.value)}>{reasons.map((item) => <option key={item}>{item}</option>)}</select></label><label>Details<textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Tell us what happened, what you received, and anything our inspection team should know." /></label><label>Evidence photos <small className="field-hint">Required for damaged/wrong/quality issues · up to 4 JPG/PNG/WEBP · max 5 MB each</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={chooseFiles} /></label>{files.length > 0 && <div className="return-file-list">{files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div>}<div className="phase83-submit-note"><strong>What happens next?</strong><span>Review → pickup → physical receipt → item inspection → approved refund or replacement.</span></div><button className="button wide" disabled={submitting}>{submitting ? "Creating return case…" : `Request ${resolution === "REFUND" ? "refund" : "replacement"}`}</button></section>
    </form>
  </div>;
}
