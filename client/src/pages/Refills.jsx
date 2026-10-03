import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { useCart } from "../context/CartContext";
import { Icon } from "../components/Icons";

const intervalOptions = [14, 21, 30, 45, 60, 90, 120];

function when(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function Refills() {
  const { addItems } = useCart();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await apiFetch("/refills");
    setRows(response.data || []);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const active = useMemo(() => rows.filter((row) => row.status === "ACTIVE").length, [rows]);
  const due = useMemo(() => rows.filter((row) => row.status === "ACTIVE" && new Date(row.nextReminderAt).getTime() <= Date.now()).length, [rows]);

  async function update(row, patch) {
    setBusy(row.id); setMessage(""); setError("");
    try {
      const response = await apiFetch(`/refills/${row.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setMessage(response.message || "Refill reminder updated."); await load();
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  }

  async function snooze(row, days = 7) {
    setBusy(row.id); setMessage(""); setError("");
    try {
      const response = await apiFetch(`/refills/${row.id}/snooze`, { method: "POST", body: JSON.stringify({ days }) });
      setMessage(response.message || "Reminder snoozed."); await load();
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  }

  async function cancel(row) {
    if (!window.confirm(`Cancel refill reminders for ${row.variant?.product?.name}?`)) return;
    setBusy(row.id); setMessage(""); setError("");
    try { const response = await apiFetch(`/refills/${row.id}`, { method: "DELETE" }); setMessage(response.message); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(""); }
  }

  async function refillNow(row) {
    setBusy(row.id); setMessage(""); setError("");
    try {
      const response = await apiFetch(`/refills/${row.id}/reorder`, { method: "POST" });
      addItems(response.data.items || []);
      setMessage(response.message || "Refill added to cart using current price and stock.");
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  }

  return <div className="container page-space phase38-refills-page">
    <div className="phase38-refills-hero"><div><p className="eyebrow">MY RISEORA</p><h1>Refill reminders</h1><p>Plan the products you regularly finish. Riseora reminds you; you stay in control of every purchase and payment.</p></div><div className="phase38-refill-summary"><span><b>{active}</b> active</span><span><b>{due}</b> due now</span></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    <div className="phase38-refill-list">
      {rows.map((row) => {
        const product = row.variant?.product; const image = product?.images?.find((item) => item.isPrimary) || product?.images?.[0]; const inStock = Number(row.variant?.stockQuantity || 0) > 0; const isDue = row.status === "ACTIVE" && new Date(row.nextReminderAt).getTime() <= Date.now();
        return <article className={`phase38-refill-card ${row.status.toLowerCase()} ${isDue ? "due" : ""}`} key={row.id}>
          <div className="phase38-refill-product"><div className="phase38-refill-image">{image?.url ? <img src={mediaUrl(image.url)} alt={product?.name || ""} /> : <span>R</span>}</div><div><small>{row.status === "PAUSED" ? "PAUSED" : isDue ? "REFILL DUE" : "NEXT REFILL"}</small><Link to={`/product/${product?.slug}`}><h2>{product?.name}</h2></Link><p>{row.variant?.name} · Qty {row.quantity}</p><strong>₹{Number(row.variant?.sellingPrice || 0).toFixed(0)}</strong></div></div>
          <div className="phase38-refill-schedule"><label>Remind every<select value={row.intervalDays} disabled={busy === row.id} onChange={(e) => update(row, { intervalDays: Number(e.target.value) })}>{intervalOptions.map((days) => <option key={days} value={days}>{days} days</option>)}</select></label><label>Quantity<input type="number" min="1" max="50" value={row.quantity} disabled={busy === row.id} onChange={(e) => update(row, { quantity: Number(e.target.value || 1) })} /></label><div><small>Next reminder</small><b>{when(row.nextReminderAt)}</b></div>{row.lastReminderAt && <div><small>Last reminder</small><b>{when(row.lastReminderAt)}</b></div>}</div>
          <div className="phase38-refill-actions"><button className="button" disabled={busy === row.id || !inStock} onClick={() => refillNow(row)}>{busy === row.id ? "WORKING…" : inStock ? "REFILL NOW" : "OUT OF STOCK"}</button>{row.status === "ACTIVE" ? <button className="button button-secondary" disabled={busy === row.id} onClick={() => update(row, { status: "PAUSED" })}>Pause</button> : <button className="button button-secondary" disabled={busy === row.id} onClick={() => update(row, { status: "ACTIVE" })}>Resume</button>}<button type="button" className="text-link" disabled={busy === row.id} onClick={() => snooze(row, 7)}>Snooze 7 days</button><button type="button" className="danger-text" disabled={busy === row.id} onClick={() => cancel(row)}>Cancel</button></div>
        </article>;
      })}
      {!rows.length && <div className="phase38-refill-empty"><Icon name="refresh" size={34} /><h2>No refill reminders yet</h2><p>Open a frequently used product and choose how often you want Riseora to remind you.</p><Link className="button" to="/shop">Explore products</Link></div>}
    </div>
    <section className="phase38-refill-trust"><Icon name="shield" size={22} /><div><strong>No automatic charges.</strong><p>Refill reminders never place an order or charge a payment method. Current price, stock and limits are re-checked when you choose Refill Now.</p></div></section>
  </div>;
}
