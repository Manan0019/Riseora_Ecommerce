import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";

const reasons = ["Product damaged", "Wrong product received", "Quality issue", "Changed my mind", "Other"];

export default function ReturnRequest() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState({});
  const [reason, setReason] = useState(reasons[0]);
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch(`/orders/my/${orderNumber}`), apiFetch("/store/config")]).then(([orderResponse, configResponse]) => { setOrder(orderResponse.data); setSettings(configResponse.data); }).catch((e) => setError(e.message));
  }, [orderNumber]);

  const chosen = useMemo(() => order ? order.items.flatMap((item) => Number(selected[item.id] || 0) > 0 ? [{ orderItemId: item.id, quantity: Number(selected[item.id]) }] : []) : [], [order, selected]);

  function chooseFiles(event) {
    const picked = Array.from(event.target.files || []).slice(0, 4);
    if (picked.some((file) => file.size > 5 * 1024 * 1024)) return setError("Each evidence image must be 5 MB or smaller.");
    setError(""); setFiles(picked);
  }

  async function uploadEvidence() {
    if (!files.length) return [];
    const body = new FormData();
    files.forEach((file) => body.append("images", file));
    const response = await apiFetch("/uploads/returns", { method: "POST", body });
    return (response.data || []).map((item) => ({ url: item.url, publicId: item.publicId || null, originalName: item.originalName || null }));
  }

  async function submit(event) {
    event.preventDefault(); setError("");
    if (!chosen.length) return setError("Choose at least one item and quantity to return.");
    setSubmitting(true);
    try {
      const evidence = await uploadEvidence();
      const response = await apiFetch("/returns", { method: "POST", body: JSON.stringify({ orderNumber, reason, details, items: chosen, evidence }) });
      navigate(`/returns/${response.data.id}`);
    } catch (e) { setError(e.message); } finally { setSubmitting(false); }
  }

  if (error && !order) return <div className="container page-space"><p className="alert error">{error}</p></div>;
  if (!order) return <div className="container page-space"><div className="skeleton-card tall" /></div>;
  if (order.status !== "DELIVERED") return <div className="container page-space"><p className="alert error">Returns become available after delivery.</p><Link to={`/orders/${orderNumber}`}>← Back to order</Link></div>;

  return <div className="container page-space return-request-page">
    <Link className="back-link" to={`/orders/${orderNumber}`}>← Back to order</Link>
    <div className="checkout-heading"><p className="eyebrow">RETURN {order.orderNumber}</p><h1>Request a return</h1><p>{settings?.returnWindowDays ?? 7}-day return window. Add clear photos for damaged, incorrect or quality-related products so the Riseora team can review faster.</p></div>
    {error && <p className="alert error">{error}</p>}
    <form className="return-request-layout" onSubmit={submit}>
      <section className="form-card"><h2>1. Choose items</h2><div className="return-select-items">{order.items.map((item) => <div key={item.id} className="return-select-row"><div><strong>{item.productName}</strong><span>{item.variantName || item.sku}</span><small>Purchased: {item.quantity}</small></div><label>Return qty<select value={selected[item.id] || 0} onChange={(e) => setSelected((current) => ({ ...current, [item.id]: Number(e.target.value) }))}><option value={0}>0</option>{Array.from({ length: item.quantity }, (_, index) => index + 1).map((qty) => <option key={qty} value={qty}>{qty}</option>)}</select></label></div>)}</div></section>
      <section className="form-card"><h2>2. Tell us why</h2><label>Reason<select value={reason} onChange={(e) => setReason(e.target.value)}>{reasons.map((item) => <option key={item}>{item}</option>)}</select></label><label>Details<textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Describe the issue so the Riseora team can review it quickly." /></label><label>Evidence photos <small className="field-hint">Optional • up to 4 JPG/PNG/WEBP images • max 5 MB each</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={chooseFiles} /></label>{files.length > 0 && <div className="return-file-list">{files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div>}<button className="button wide" disabled={submitting}>{submitting ? "Submitting…" : "Submit return request"}</button></section>
    </form>
  </div>;
}
