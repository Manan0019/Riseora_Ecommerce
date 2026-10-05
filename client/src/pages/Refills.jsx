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

function timingText(item) {
  if (item.status === "DUE") return item.daysUntil < 0 ? `${Math.abs(item.daysUntil)} days overdue` : "Due now";
  if (item.daysUntil === 1) return "Likely due tomorrow";
  return `Likely due in ${item.daysUntil} days`;
}

function confidenceLabel(value) {
  if (value === "HIGH") return "HIGH CONFIDENCE";
  if (value === "MEDIUM") return "GROWING CONFIDENCE";
  return "STARTER ESTIMATE";
}

export default function Refills() {
  const { addItems } = useCart();
  const [rows, setRows] = useState([]);
  const [forecast, setForecast] = useState({ summary: {}, products: [] });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [reminders, intelligence] = await Promise.all([apiFetch("/refills"), apiFetch("/refills/intelligence")]);
    setRows(reminders.data || []);
    setForecast(intelligence.data || { summary: {}, products: [] });
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

  async function useSmartTiming(item) {
    setBusy(`smart:${item.variantId}`); setMessage(""); setError("");
    try {
      if (item.reminder?.id) {
        const response = await apiFetch(`/refills/${item.reminder.id}`, { method: "PATCH", body: JSON.stringify({ intervalDays: item.suggestedIntervalDays, quantity: item.suggestedQuantity, status: "ACTIVE" }) });
        setMessage(response.message || `Smart timing updated to every ${item.suggestedIntervalDays} days.`);
      } else {
        const response = await apiFetch("/refills", { method: "POST", body: JSON.stringify({ variantId: item.variantId, intervalDays: item.suggestedIntervalDays, quantity: item.suggestedQuantity }) });
        setMessage(response.message || `Smart reminder set for every ${item.suggestedIntervalDays} days.`);
      }
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  }

  function addForecastToCart(item) {
    setMessage(""); setError("");
    if (Number(item.availability || 0) <= 0) { setError(`${item.product?.name || "This product"} is currently out of stock.`); return; }
    const added = addItems([{ product: item.product, variant: item.variant, quantity: item.suggestedQuantity || 1 }]);
    if (added) setMessage(`${item.product?.name || "Refill"} added using today's price and available stock.`);
  }

  return <div className="container page-space phase38-refills-page phase59-routine-page">
    <div className="phase38-refills-hero"><div><p className="eyebrow">MY RISEORA</p><h1>Refill reminders</h1><p>Plan the products you regularly finish. Riseora can now learn from delivered orders to suggest a useful refill rhythm, while every reminder and purchase stays under your control.</p></div><div className="phase38-refill-summary"><span><b>{active}</b> active</span><span><b>{due}</b> due now</span></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

    <section className="phase59-routine-forecast">
      <div className="section-heading"><div><p className="eyebrow">ROUTINE FORECAST</p><h2>Your likely next refills</h2><p>Estimated from your delivered-order rhythm and each product's refill cadence. Nothing is ordered automatically.</p></div><div className="phase59-routine-summary"><span><b>{Number(forecast.summary?.repeatProducts || 0)}</b> tracked</span><span><b>{Number(forecast.summary?.dueNow || 0) + Number(forecast.summary?.dueSoon || 0)}</b> due / soon</span><span><b>{Number(forecast.summary?.protectedByReminder || 0)}</b> reminded</span></div></div>
      <div className="phase59-routine-grid">
        {(forecast.products || []).map((item) => {
          const image = item.product?.images?.find((entry) => entry.isPrimary) || item.product?.images?.[0];
          const smartBusy = busy === `smart:${item.variantId}`;
          return <article className={`phase59-routine-card ${String(item.status || "later").toLowerCase()}`} key={item.variantId}>
            <div className="phase59-routine-card-top">
              <Link className="phase59-routine-image" to={`/product/${item.product?.slug}`}>{image?.url ? <img src={mediaUrl(image.url)} alt={item.product?.name || ""} /> : <span>R</span>}</Link>
              <div><small>{confidenceLabel(item.confidence)}</small><Link to={`/product/${item.product?.slug}`}><h3>{item.product?.name}</h3></Link><p>{item.variant?.name} · Qty {item.suggestedQuantity}</p></div>
            </div>
            <div className="phase59-routine-timing"><strong>{timingText(item)}</strong><span>{when(item.nextSuggestedAt)} · about every {item.suggestedIntervalDays} days</span><small>{item.timingSource}</small></div>
            <div className="phase59-routine-facts"><span><small>Today's price</small><b>₹{Number(item.currentPrice || 0).toFixed(0)}</b>{item.priceChanged && <em>Previous ₹{Number(item.lastPrice || 0).toFixed(0)}</em>}</span><span><small>Available</small><b>{Number(item.availability || 0)}</b></span></div>
            <div className="phase59-routine-actions"><button className="button" disabled={Number(item.availability || 0) <= 0} onClick={() => addForecastToCart(item)}>{Number(item.availability || 0) > 0 ? "REFILL NOW" : "OUT OF STOCK"}</button><button className="button button-secondary" disabled={smartBusy || item.reminderAligned} onClick={() => useSmartTiming(item)}>{smartBusy ? "UPDATING…" : item.reminderAligned ? "SMART TIMING ACTIVE" : item.reminder?.id ? "USE SUGGESTED TIMING" : "SET SMART REMINDER"}</button></div>
          </article>;
        })}
        {!forecast.products?.length && <div className="phase59-routine-empty"><Icon name="sparkles" size={30} /><h3>Your routine forecast will appear here</h3><p>After eligible products are delivered, Riseora can estimate when they may be running low.</p><Link className="button button-secondary" to="/shop">Explore products</Link></div>}
      </div>
    </section>

    <div className="phase38-refill-list">
      {rows.map((row) => {
        const product = row.variant?.product; const image = product?.images?.find((item) => item.isPrimary) || product?.images?.[0]; const inStock = Number(row.variant?.stockQuantity || 0) > 0; const isDue = row.status === "ACTIVE" && new Date(row.nextReminderAt).getTime() <= Date.now();
        return <article className={`phase38-refill-card ${row.status.toLowerCase()} ${isDue ? "due" : ""}`} key={row.id}>
          <div className="phase38-refill-product"><div className="phase38-refill-image">{image?.url ? <img src={mediaUrl(image.url)} alt={product?.name || ""} /> : <span>R</span>}</div><div><small>{row.status === "PAUSED" ? "PAUSED" : isDue ? "REFILL DUE" : "NEXT REFILL"}</small><Link to={`/product/${product?.slug}`}><h2>{product?.name}</h2></Link><p>{row.variant?.name} · Qty {row.quantity}</p><strong>₹{Number(row.variant?.sellingPrice || 0).toFixed(0)}</strong></div></div>
          <div className="phase38-refill-schedule"><label>Remind every<select value={row.intervalDays} disabled={busy === row.id} onChange={(e) => update(row, { intervalDays: Number(e.target.value) })}>{intervalOptions.map((days) => <option key={days} value={days}>{days} days</option>)}</select></label><label>Quantity<input type="number" min="1" max="50" value={row.quantity} disabled={busy === row.id} onChange={(e) => update(row, { quantity: Number(e.target.value || 1) })} /></label><div><small>Next reminder</small><b>{when(row.nextReminderAt)}</b></div>{row.lastReminderAt && <div><small>Last reminder</small><b>{when(row.lastReminderAt)}</b></div>}</div>
          <div className="phase38-refill-actions"><button className="button" disabled={busy === row.id || !inStock} onClick={() => refillNow(row)}>{busy === row.id ? "WORKING…" : inStock ? "REFILL NOW" : "OUT OF STOCK"}</button>{row.status === "ACTIVE" ? <button className="button button-secondary" disabled={busy === row.id} onClick={() => update(row, { status: "PAUSED" })}>Pause</button> : <button className="button button-secondary" disabled={busy === row.id} onClick={() => update(row, { status: "ACTIVE" })}>Resume</button>}<button type="button" className="text-link" disabled={busy === row.id} onClick={() => snooze(row, 7)}>Snooze 7 days</button><button type="button" className="danger-text" disabled={busy === row.id} onClick={() => cancel(row)}>Cancel</button></div>
        </article>;
      })}
      {!rows.length && <div className="phase38-refill-empty"><Icon name="refresh" size={34} /><h2>No manual refill reminders yet</h2><p>Use a smart suggestion above or open a frequently used product and choose your own reminder rhythm.</p><Link className="button" to="/shop">Explore products</Link></div>}
    </div>
    <section className="phase38-refill-trust"><Icon name="shield" size={22} /><div><strong>No automatic charges.</strong><p>Routine forecasts and refill reminders never place an order or charge a payment method. Current price, stock and limits are re-checked when you choose Refill Now.</p></div></section>
  </div>;
}
