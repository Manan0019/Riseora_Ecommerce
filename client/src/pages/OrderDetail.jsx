import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import OrderTimeline from "../components/OrderTimeline";
import ShipmentJourney from "../components/ShipmentJourney";
import { useCart } from "../context/CartContext";

const cancellationReasons = ["Ordered by mistake", "Need to change products", "Need to change delivery details", "Delivery timing", "Other"];
const money = (value) => `₹${Number(value || 0).toFixed(0)}`;

function Address({ value }) {
  if (!value) return null;
  return <p className="order-address">{[value.line1, value.line2, value.landmark, value.city, value.state, value.postalCode, value.country].filter(Boolean).join(", ")}</p>;
}

function ReorderPreview({ preview, busy, onConfirm, onClose }) {
  if (!preview) return null;
  return <div className="phase58-reorder-preview phase58-order-detail-preview">
    <div className="phase58-reorder-preview-head"><div><small>CURRENT REORDER CHECK</small><strong>{preview.availableItemCount} of {preview.originalItemCount} item{preview.originalItemCount === 1 ? "" : "s"} available</strong></div><button className="link-button" type="button" onClick={onClose}>Close</button></div>
    <div className="phase58-reorder-lines">{(preview.items || []).map((item) => <div key={item.variant?.id || item.variant?.sku}><span><b>{item.product?.name}</b><small>{item.variant?.name} × {item.quantity}{item.quantity !== item.previousQuantity ? ` · adjusted from ${item.previousQuantity}` : ""}</small></span><span><strong>{money(item.currentLineTotal)}</strong>{item.priceChanged && <small className="phase58-price-change">Previous {money(item.previousLineTotal)}</small>}</span></div>)}</div>
    {(preview.skipped || []).length > 0 && <div className="phase58-reorder-notes"><strong>Availability notes</strong>{preview.skipped.map((item, index) => <span key={`${item.sku}-${index}`}>{item.productName}: {item.reason}</span>)}</div>}
    <div className="phase58-reorder-total"><span>Today's available-item total</span><strong>{money(preview.currentTotal)}</strong></div>
    <button className="button" type="button" disabled={busy || !preview.items?.length} onClick={onConfirm}>{busy ? "Refreshing stock…" : "Add available items to cart"}</button>
  </div>;
}

export default function OrderDetail() {
  const { orderNumber } = useParams();
  const { addItems } = useCart();
  const [order, setOrder] = useState(null);
  const [care, setCare] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reordering, setReordering] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [reorderPreview, setReorderPreview] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState(cancellationReasons[0]);
  const [cancelNote, setCancelNote] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    const [orderResponse, careResponse] = await Promise.all([
      apiFetch(`/orders/my/${orderNumber}`),
      apiFetch(`/account/order-care/${orderNumber}`),
    ]);
    setOrder(orderResponse.data);
    setCare(careResponse.data);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, [orderNumber]);

  async function openReorderPreview() {
    setError(""); setNotice(""); setPreviewing(true);
    try {
      const response = await apiFetch(`/account/reorder/${orderNumber}/preview`);
      setReorderPreview(response.data);
    } catch (e) { setError(e.message); }
    finally { setPreviewing(false); }
  }

  async function buyAgain() {
    setError(""); setNotice(""); setReordering(true);
    try {
      const response = await apiFetch(`/account/reorder/${orderNumber}`, { method: "POST" });
      addItems(response.data.items || []);
      const notes = response.data.skipped || [];
      setNotice(`${response.data.priceChanged ? "Current prices were refreshed. " : ""}Available items were added to your cart${notes.length ? ` with ${notes.length} stock/limit adjustment${notes.length === 1 ? "" : "s"}` : ""}.`);
      setReorderPreview(null);
      const careResponse = await apiFetch(`/account/order-care/${orderNumber}`);
      setCare(careResponse.data);
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
  const supportUrl = `/support?category=ORDER&order=${encodeURIComponent(order.orderNumber)}&subject=${encodeURIComponent(`Help with order ${order.orderNumber}`)}`;

  return <div className="container page-space order-detail-page">
    {notice && <p className="alert success">{notice}</p>}
    {error && <p className="alert error">{error}</p>}
    <div className="order-detail-head"><div><Link to="/orders" className="back-link">← My orders</Link><p className="eyebrow">ORDER {order.orderNumber}</p><h1>Track your order</h1><p>Placed {new Date(order.createdAt).toLocaleString()}</p><div className="order-detail-actions">{!["PENDING","CANCELLED"].includes(order.status) && <Link className="button button-secondary" to={`/invoice/${order.orderNumber}`}>Tax invoice</Link>}{order.status === "DELIVERED" && <button className="button button-secondary" type="button" disabled={previewing || reordering} onClick={openReorderPreview}>{previewing ? "Checking today's stock…" : "Review buy again"}</button>}{order.status === "DELIVERED" && <Link className="button" to={`/returns/new/${order.orderNumber}`}>Request return</Link>}{canRequestCancellation && <button className="button button-secondary" type="button" onClick={() => setCancelOpen((value) => !value)}>Request cancellation</button>}</div></div><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status}</span></div>

    {care && <section className="phase58-order-care">
      <div className="phase58-order-care-head"><div><p className="eyebrow">ORDER AFTERCARE</p><h2>What can you do next?</h2><p>{care.nextAction}</p></div><Link className="button button-secondary" to={supportUrl}>Get help with this order</Link></div>
      <div className="phase58-order-care-grid">
        <article><small>RETURN WINDOW</small><strong>{care.returns?.eligible ? `${care.returns.daysRemaining} day${care.returns.daysRemaining === 1 ? "" : "s"} remaining` : care.returns?.enabled ? "Not currently eligible" : "Returns disabled"}</strong><span>{care.returns?.deadline ? `Until ${new Date(care.returns.deadline).toLocaleDateString()}` : "Return timing appears after delivery"}</span></article>
        <article><small>BUY AGAIN</small><strong>{care.reorder ? `${care.reorder.availableItemCount}/${care.reorder.originalItemCount} available` : "Available after delivery"}</strong><span>{care.reorder?.priceChanged ? "Today's price differs on at least one item" : care.reorder ? "Current price and stock checked live" : "We'll recheck stock when eligible"}</span></article>
        <article><small>SUPPORT</small><strong>Order-linked help</strong><span>Start a support request with this order number already attached.</span></article>
      </div>
      {reorderPreview && <ReorderPreview preview={reorderPreview} busy={reordering} onConfirm={buyAgain} onClose={() => setReorderPreview(null)} />}
    </section>}

    {order.cancellationRequest && !["WITHDRAWN"].includes(order.cancellationRequest.status) && <section className={`order-cancellation-card cancellation-${order.cancellationRequest.status.toLowerCase()}`}><div><small>CANCELLATION</small><strong>{order.cancellationRequest.status.replaceAll("_", " ")}</strong><p>{order.cancellationRequest.reason}{order.cancellationRequest.customerNote ? ` • ${order.cancellationRequest.customerNote}` : ""}</p>{order.cancellationRequest.adminNote && <p className="muted">Riseora: {order.cancellationRequest.adminNote}</p>}</div>{order.cancellationRequest.status === "REQUESTED" && <button className="link-button danger-text" type="button" onClick={withdrawCancellation}>Withdraw request</button>}</section>}

    {cancelOpen && canRequestCancellation && <form className="order-cancellation-form" onSubmit={requestCancellation}><div><h2>Request cancellation</h2><p>If the order has not moved into processing, Riseora can review the request. Online payments are refunded only after approval.</p></div><label>Reason<select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>{cancellationReasons.map((item) => <option key={item}>{item}</option>)}</select></label><label>Anything we should know?<textarea value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} maxLength={1000} placeholder="Optional details" /></label><div className="order-cancellation-actions"><button className="button" disabled={cancelling}>{cancelling ? "Submitting…" : "Submit request"}</button><button className="button button-secondary" type="button" onClick={() => setCancelOpen(false)}>Keep order</button></div></form>}

    <div className="order-detail-grid">
      <section className="order-detail-card"><h2>Order progress</h2><OrderTimeline order={order} /></section>
      <section className="order-detail-card"><h2>Delivery</h2><strong>{order.customerName}</strong><Address value={order.shippingAddress} /><p>{order.customerPhone}</p>{(order.shippingZoneName || order.deliveryEstimate) && <div className="phase21-order-zone">{order.shippingZoneName && <span><b>Delivery zone</b>{order.shippingZoneName}</span>}{order.deliveryEstimate && <span><b>Checkout estimate</b>{order.deliveryEstimate.deliveryMinDays}–{order.deliveryEstimate.deliveryMaxDays} days after dispatch</span>}</div>}{order.shipment && <div className="shipment-box"><span>{order.shipment.carrier || "Delivery partner"}</span><strong>{order.shipment.trackingNumber || "Tracking pending"}</strong>{order.shipment.trackingUrl && <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer">Track with courier ↗</a>}</div>}</section>
    </div>

    {order.shipment && <section className="order-detail-card"><h2>Shipment journey</h2><ShipmentJourney shipment={order.shipment} /></section>}

    <section className="order-detail-card order-items-card"><h2>Items</h2>{order.items.map((item) => <div className="summary-row" key={item.id}><span>{item.productName} {item.variantName ? `/ ${item.variantName}` : ""} × {item.quantity}{item.isComplimentary ? <small className="phase13-free-label"> FREE • {item.promotionLabel || "Offer"}</small> : null}</span><strong>{item.isComplimentary ? "FREE" : money(item.lineTotal)}</strong></div>)}<div className="summary-row"><span>Subtotal</span><strong>{money(order.subtotal)}</strong></div>{Number(order.discountAmount) > 0 && <div className="summary-row discount"><span>Discount {order.couponCode ? `(${order.couponCode})` : order.automaticPromotionName ? `(${order.automaticPromotionName})` : ""}</span><strong>−{money(order.discountAmount)}</strong></div>}<div className="summary-row total"><span>Total</span><strong>{money(order.totalAmount)}</strong></div></section>
  </div>;
}
