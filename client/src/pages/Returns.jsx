import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";

function money(value) { return `₹${Number(value || 0).toFixed(0)}`; }

export default function Returns() {
  const [returns, setReturns] = useState([]);
  const [error, setError] = useState("");
  async function load() { const response = await apiFetch("/returns"); setReturns(response.data); }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  async function cancel(id) {
    if (!window.confirm("Cancel this return request?")) return;
    try { await apiFetch(`/returns/${id}/cancel`, { method: "POST" }); await load(); } catch (e) { setError(e.message); }
  }

  return <div className="container page-space returns-page">
    <div className="page-heading-row"><div><p className="eyebrow">MY RISEORA</p><h1>Returns & refunds</h1><p>Track return requests, pickups and refunds from one place.</p></div><Link className="button button-secondary" to="/orders">My orders</Link></div>
    {error && <p className="alert error">{error}</p>}
    {returns.length === 0 ? <div className="empty-state"><h2>No return requests yet</h2><p>If an eligible delivered order needs to come back, start from its order details page.</p><Link className="button" to="/orders">View orders</Link></div> : <div className="return-card-list">{returns.map((item) => <article className="return-card" key={item.id}><div className="return-card-head"><div><small>{item.returnNumber}</small><h2>{item.order.orderNumber}</h2><span>Requested {new Date(item.requestedAt).toLocaleDateString()}</span></div><span className={`return-pill return-${item.status.toLowerCase().replaceAll("_", "-")}`}>{item.status.replaceAll("_", " ")}</span></div><div className="return-items-mini">{item.items.map((line) => <span key={line.id}>{line.orderItem.productName} × {line.quantity}</span>)}</div><div className="return-card-foot"><span>Refund value <strong>{money(item.refundAmount)}</strong></span>{item.status === "REQUESTED" && <button className="link-button danger-text" onClick={() => cancel(item.id)}>Cancel request</button>}</div>{item.reverseTrackingNumber && <div className="shipment-box"><span>{item.reverseCarrier || "Return courier"}</span><strong>{item.reverseTrackingNumber}</strong>{item.reverseTrackingUrl && <a href={item.reverseTrackingUrl} target="_blank" rel="noreferrer">Track return ↗</a>}</div>}</article>)}</div>}
  </div>;
}
