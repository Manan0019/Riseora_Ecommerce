import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import OrderTimeline from "../components/OrderTimeline";
import ShipmentJourney from "../components/ShipmentJourney";
import { useCart } from "../context/CartContext";

const cancellationReasons = ["Ordered by mistake", "Need to change products", "Need to change delivery details", "Delivery timing", "Other"];

function Address({ value }) {
  if (!value) return null;
  return <p className="order-address">{[value.line1, value.line2, value.landmark, value.city, value.state, value.postalCode, value.country].filter(Boolean).join(", ")}</p>;
}

export default function OrderDetail() {
  const { orderNumber } = useParams();
  const { addItems } = useCart();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reordering, setReordering] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState(cancellationReasons[0]);
  const [cancelNote, setCancelNote] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    const response = await apiFetch(`/orders/my/${orderNumber}`);
    setOrder(response.data);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, [orderNumber]);

  async function buyAgain() {
    setError(""); setNotice(""); setReordering(true);
    try {
      const response = await apiFetch(`/account/reorder/${orderNumber}`, { method: "POST" });
      addItems(response.data.items || []);
      const notes = response.data.skipped || [];
      setNotice(`${response.data.priceChanged ? "Current prices were refreshed. " : ""}Available items were added to your cart${notes.length ? ` with ${notes.length} stock/limit adjustment${notes.length === 1 ? "" : "s"}` : ""}.`);
    } catch (e) { setError(e.message); }
    finally { setReordering(false); }
  }

  async function requestCancellation(event) {
    event.preventDefault(); setError(""); setNotice(""); setCancelling(true);
    try {
      await apiFetch(`/orders/my/${orderNumber}/cancellation`, { method: "POST", body: JSON.stringify({ reason: cancelReason, note: cancelNote }) });
      setNotice("Cancellation request submitted. Fulfilment is paused while Riseora reviews it."); setCancelOpen(false); setCancelNote(""); await load();
    } catch (e) { setError(e.message); } finally { setCancelling(false); }
  }

  async function withdrawCancellation() {
    if (!window.confirm("Withdraw your cancellation request and keep this order?")) return;
    setError(""); setNotice("");
    try { await apiFetch(`/orders/my/${orderNumber}/cancellation/withdraw`, { method: "POST" }); setNotice("Cancellation request withdrawn."); await load(); }
    catch (e) { setError(e.message); }
  }

  if (error && !order) return <div className="container page-space"><p className="alert error">{error}</p></div>;
  if (!order) return <div className="container page-space"><div className="skeleton-card tall" /></div>;

  const activeCancellation = order.cancellationRequest && ["REQUESTED", "APPROVED"].includes(order.cancellationRequest.status);
  const canRequestCancellation = ["PENDING", "CONFIRMED"].includes(order.status) && !activeCancellation;

  return <div className="container page-space order-detail-page">
    {notice && <p className="alert success">{notice}</p>}
    {error && <p className="alert error">{error}</p>}
    <div className="order-detail-head"><div><Link to="/orders" className="back-link">← My orders</Link><p className="eyebrow">ORDER {order.orderNumber}</p><h1>Track your order</h1><p>Placed {new Date(order.createdAt).toLocaleString()}</p><div className="order-detail-actions">{!["PENDING","CANCELLED"].includes(order.status) && <Link className="button button-secondary" to={`/invoice/${order.orderNumber}`}>Tax invoice</Link>}{order.status === "DELIVERED" && <button className="button button-secondary" type="button" disabled={reordering} onClick={buyAgain}>{reordering ? "Refreshing…" : "Buy again"}</button>}{order.status === "DELIVERED" && <Link className="button" to={`/returns/new/${order.orderNumber}`}>Request return</Link>}{canRequestCancellation && <button className="button button-secondary" type="button" onClick={() => setCancelOpen((value) => !value)}>Request cancellation</button>}</div></div><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status}</span></div>

    {order.cancellationRequest && !["WITHDRAWN"].includes(order.cancellationRequest.status) && <section className={`order-cancellation-card cancellation-${order.cancellationRequest.status.toLowerCase()}`}><div><small>CANCELLATION</small><strong>{order.cancellationRequest.status.replaceAll("_", " ")}</strong><p>{order.cancellationRequest.reason}{order.cancellationRequest.customerNote ? ` • ${order.cancellationRequest.customerNote}` : ""}</p>{order.cancellationRequest.adminNote && <p className="muted">Riseora: {order.cancellationRequest.adminNote}</p>}</div>{order.cancellationRequest.status === "REQUESTED" && <button className="link-button danger-text" type="button" onClick={withdrawCancellation}>Withdraw request</button>}</section>}

    {cancelOpen && canRequestCancellation && <form className="order-cancellation-form" onSubmit={requestCancellation}><div><h2>Request cancellation</h2><p>If the order has not moved into processing, Riseora can review the request. Online payments are refunded only after approval.</p></div><label>Reason<select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>{cancellationReasons.map((item) => <option key={item}>{item}</option>)}</select></label><label>Anything we should know?<textarea value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} maxLength={1000} placeholder="Optional details" /></label><div className="order-cancellation-actions"><button className="button" disabled={cancelling}>{cancelling ? "Submitting…" : "Submit request"}</button><button className="button button-secondary" type="button" onClick={() => setCancelOpen(false)}>Keep order</button></div></form>}

    <div className="order-detail-grid">
      <section className="order-detail-card"><h2>Order progress</h2><OrderTimeline order={order} /></section>
      <section className="order-detail-card"><h2>Delivery</h2><strong>{order.customerName}</strong><Address value={order.shippingAddress} /><p>{order.customerPhone}</p>{(order.shippingZoneName || order.deliveryEstimate) && <div className="phase21-order-zone">{order.shippingZoneName && <span><b>Delivery zone</b>{order.shippingZoneName}</span>}{order.deliveryEstimate && <span><b>Checkout estimate</b>{order.deliveryEstimate.deliveryMinDays}–{order.deliveryEstimate.deliveryMaxDays} days after dispatch</span>}</div>}{order.shipment && <div className="shipment-box"><span>{order.shipment.carrier || "Delivery partner"}</span><strong>{order.shipment.trackingNumber || "Tracking pending"}</strong>{order.shipment.trackingUrl && <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer">Track with courier ↗</a>}</div>}</section>
    </div>

    {order.shipment && <section className="order-detail-card"><h2>Shipment journey</h2><ShipmentJourney shipment={order.shipment} /></section>}

    <section className="order-detail-card order-items-card"><h2>Items</h2>{order.items.map((item) => <div className="summary-row" key={item.id}><span>{item.productName} {item.variantName ? `/ ${item.variantName}` : ""} × {item.quantity}{item.isComplimentary ? <small className="phase13-free-label"> FREE • {item.promotionLabel || "Offer"}</small> : null}</span><strong>{item.isComplimentary ? "FREE" : `₹${Number(item.lineTotal).toFixed(0)}`}</strong></div>)}<div className="summary-row"><span>Subtotal</span><strong>₹{Number(order.subtotal).toFixed(0)}</strong></div>{Number(order.discountAmount) > 0 && <div className="summary-row discount"><span>Discount {order.couponCode ? `(${order.couponCode})` : order.automaticPromotionName ? `(${order.automaticPromotionName})` : ""}</span><strong>−₹{Number(order.discountAmount).toFixed(0)}</strong></div>}<div className="summary-row total"><span>Total</span><strong>₹{Number(order.totalAmount).toFixed(0)}</strong></div></section>
  </div>;
}
