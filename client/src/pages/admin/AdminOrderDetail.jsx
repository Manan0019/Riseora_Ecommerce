import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../api/http";
import OrderTimeline from "../../components/OrderTimeline";

const nextByStatus = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export default function AdminOrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [form, setForm] = useState({ status: "", note: "", carrier: "", trackingNumber: "", trackingUrl: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await apiFetch(`/admin/orders/${id}`);
    setOrder(response.data);
    setForm((current) => ({ ...current, status: response.data.status, carrier: response.data.shipment?.carrier || "", trackingNumber: response.data.shipment?.trackingNumber || "", trackingUrl: response.data.shipment?.trackingUrl || "" }));
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, [id]);

  const statusOptions = useMemo(() => order ? [order.status, ...(nextByStatus[order.status] || [])] : [], [order]);

  async function save(event) {
    event.preventDefault(); setMessage(""); setError("");
    try {
      await apiFetch(`/admin/orders/${id}/fulfilment`, { method: "PATCH", body: JSON.stringify(form) });
      setMessage("Order fulfilment updated."); setForm((current) => ({ ...current, note: "" })); await load();
    } catch (e) { setError(e.message); }
  }

  if (error && !order) return <><p className="alert error">{error}</p><Link to="/admin/orders">← Back to orders</Link></>;
  if (!order) return <div className="admin-panel"><div className="skeleton-card" /></div>;
  const address = order.shippingAddress || {};

  return <>
    <div className="admin-page-heading"><div><Link className="back-link" to="/admin/orders">← Orders</Link><p className="eyebrow">{order.orderNumber}</p><h1>Order fulfilment</h1><p>Placed {new Date(order.createdAt).toLocaleString()}</p></div><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status}</span></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

    <div className="admin-order-detail-grid">
      <section className="admin-panel"><div className="admin-panel-head"><div><h2>Customer & delivery</h2><p>Shipping snapshot captured at checkout.</p></div></div><div className="admin-detail-stack"><strong>{order.customerName}</strong><span>{order.customerPhone}</span>{order.customerEmail && <span>{order.customerEmail}</span>}<p>{[address.line1, address.line2, address.landmark, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(", ")}</p></div></section>
      <section className="admin-panel"><div className="admin-panel-head"><div><h2>Payment</h2><p>{order.paymentMethod}</p></div></div><div className="admin-payment-summary"><span>Status <strong>{order.payment?.status || "PENDING"}</strong></span><span>Total <strong>₹{Number(order.totalAmount).toFixed(0)}</strong></span>{order.couponCode && <span>Coupon <strong>{order.couponCode}</strong></span>}</div></section>
    </div>

    <div className="admin-order-detail-grid fulfilment-grid">
      <section className="admin-panel"><div className="admin-panel-head"><div><h2>Progress</h2><p>Customer sees this timeline.</p></div></div><OrderTimeline order={order} /></section>
      <form className="admin-panel admin-form" onSubmit={save}><div className="admin-panel-head"><div><h2>Update fulfilment</h2><p>Move orders forward and add courier details.</p></div></div><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>{form.status === "SHIPPED" && <><div className="admin-field-grid two"><label>Courier / carrier<input required value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} placeholder="e.g. Delhivery" /></label><label>Tracking number<input required value={form.trackingNumber} onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })} /></label></div><label>Tracking URL<input type="url" value={form.trackingUrl} onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })} placeholder="https://..." /></label></>}<label>Customer-visible note<textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional update, e.g. Packed and ready for dispatch" /></label><button className="button">Save fulfilment update</button></form>
    </div>

    <section className="admin-panel"><div className="admin-panel-head"><div><h2>Order items</h2><p>{order.items.length} line item(s)</p></div></div><div className="admin-order-line-items">{order.items.map((item) => <div key={item.id}><span><strong>{item.productName}</strong><small>{item.variantName || item.sku} × {item.quantity}</small></span><strong>₹{Number(item.lineTotal).toFixed(0)}</strong></div>)}</div><div className="admin-order-totals"><span>Subtotal <strong>₹{Number(order.subtotal).toFixed(0)}</strong></span>{Number(order.discountAmount) > 0 && <span>Discount <strong>−₹{Number(order.discountAmount).toFixed(0)}</strong></span>}<span className="total">Total <strong>₹{Number(order.totalAmount).toFixed(0)}</strong></span></div></section>
  </>;
}
