import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { Icon } from "./Icons";

const intervals = [14, 21, 30, 45, 60, 90, 120];

export default function RefillPlanner({ product, variant }) {
  const { user } = useAuth();
  const suggested = Math.max(7, Math.min(180, Number(product?.replenishmentDays || 30)));
  const [days, setDays] = useState(suggested);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { setDays(suggested); setQuantity(1); setMessage(""); }, [product?.id, variant?.id, suggested]);
  if (!product?.replenishmentEnabled || !variant) return null;

  async function save() {
    if (!user) return;
    setBusy(true); setMessage("");
    try {
      const response = await apiFetch("/refills", { method: "POST", body: JSON.stringify({ variantId: variant.id, intervalDays: Number(days), quantity: Number(quantity) }) });
      setMessage(response.message || "Refill reminder saved.");
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }

  return <section className="phase38-product-refill">
    <div className="phase38-product-refill-icon"><Icon name="refresh" size={22} /></div>
    <div className="phase38-product-refill-copy"><small>NEVER RUN OUT</small><h3>{product.replenishmentLabel || "Set a refill reminder"}</h3><p>Riseora can remind you around the time this product may be running low. No automatic orders or charges.</p></div>
    {user ? <div className="phase38-product-refill-controls"><label>Every<select value={days} onChange={(e) => setDays(Number(e.target.value))}>{[...new Set([suggested, ...intervals])].sort((a,b)=>a-b).map((item) => <option key={item} value={item}>{item} days</option>)}</select></label><label>Qty<input type="number" min="1" max={Math.max(1, Number(product.maxPurchaseQuantity || 50))} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value || 1)))} /></label><button className="button button-secondary" type="button" disabled={busy} onClick={save}>{busy ? "SAVING…" : "SET REMINDER"}</button>{message && <small className="phase38-refill-inline-message">{message} <Link to="/refills">Manage refills →</Link></small>}</div> : <div className="phase38-product-refill-login"><Link className="button button-secondary" to="/login">LOGIN TO SET REMINDER</Link><small>Your refill plan syncs with your Riseora account.</small></div>}
  </section>;
}
