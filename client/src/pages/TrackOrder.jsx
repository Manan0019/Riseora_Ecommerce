import { useState } from "react";
import { apiFetch } from "../api/http";
import OrderTimeline from "../components/OrderTimeline";

export default function TrackOrder() {
  const [form, setForm] = useState({ orderNumber: "", phone: "" });
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError(""); setOrder(null); setLoading(true);
    try {
      const params = new URLSearchParams({ orderNumber: form.orderNumber.trim(), phone: form.phone.trim() });
      const response = await apiFetch(`/orders/track?${params.toString()}`);
      setOrder(response.data);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  return <div className="container page-space track-order-page">
    <section className="track-order-hero"><p className="eyebrow">ORDER TRACKING</p><h1>Where is my Riseora order?</h1><p>Enter the order number and phone number used at checkout.</p><form onSubmit={submit} className="track-order-form"><label>Order number<input required value={form.orderNumber} onChange={(e) => setForm({ ...form, orderNumber: e.target.value.toUpperCase() })} placeholder="RISE-20260930-ABC123" /></label><label>Phone number<input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone used at checkout" /></label><button className="button" disabled={loading}>{loading ? "Checking…" : "Track order"}</button></form>{error && <p className="alert error">{error}</p>}</section>
    {order && <section className="order-detail-card tracked-result"><div className="tracked-result-head"><div><small>{order.orderNumber}</small><h2>{order.customerName}</h2></div><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status}</span></div><OrderTimeline order={order} />{order.shipment?.trackingNumber && <div className="shipment-box"><span>{order.shipment.carrier || "Delivery partner"}</span><strong>{order.shipment.trackingNumber}</strong>{order.shipment.trackingUrl && <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer">Open courier tracking ↗</a>}</div>}</section>}
  </div>;
}
