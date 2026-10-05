import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import OrderTimeline from "../components/OrderTimeline";
import { useCart } from "../context/CartContext";

const money = (value) => `₹${Number(value || 0).toFixed(0)}`;

function ReorderPreview({ preview, busy, onConfirm, onClose }) {
  if (!preview) return null;
  return <div className="phase58-reorder-preview">
    <div className="phase58-reorder-preview-head"><div><small>BUY AGAIN REVIEW</small><strong>{preview.availableItemCount} of {preview.originalItemCount} item{preview.originalItemCount === 1 ? "" : "s"} available today</strong></div><button type="button" className="link-button" onClick={onClose}>Close</button></div>
    <div className="phase58-reorder-lines">
      {(preview.items || []).map((item) => <div key={item.variant?.id || item.variant?.sku}><span><b>{item.product?.name}</b><small>{item.variant?.name} × {item.quantity}{item.quantity !== item.previousQuantity ? ` · was ${item.previousQuantity}` : ""}</small></span><span><strong>{money(item.currentLineTotal)}</strong>{item.priceChanged && <small className="phase58-price-change">Was {money(item.previousLineTotal)}</small>}</span></div>)}
    </div>
    {(preview.skipped || []).length > 0 && <div className="phase58-reorder-notes"><strong>Current availability notes</strong>{preview.skipped.map((item, index) => <span key={`${item.sku}-${index}`}>{item.productName}: {item.reason}</span>)}</div>}
    <div className="phase58-reorder-total"><span>Today's available-item total</span><strong>{money(preview.currentTotal)}</strong></div>
    <button className="button wide" type="button" disabled={busy || !preview.items?.length} onClick={onConfirm}>{busy ? "Refreshing current stock…" : "Add available items to cart"}</button>
  </div>;
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reordering, setReordering] = useState("");
  const [previewing, setPreviewing] = useState("");
  const [preview, setPreview] = useState(null);
  const { addItems } = useCart();

  useEffect(() => { apiFetch("/orders/my").then((r) => setOrders(r.data)).catch((e) => setError(e.message)); }, []);

  async function openReorderPreview(order) {
    setError(""); setNotice(""); setPreviewing(order.orderNumber);
    try {
      const response = await apiFetch(`/account/reorder/${order.orderNumber}/preview`);
      setPreview({ orderNumber: order.orderNumber, data: response.data });
    } catch (e) { setError(e.message); }
    finally { setPreviewing(""); }
  }

  async function buyAgain(order) {
    setError(""); setNotice(""); setReordering(order.orderNumber);
    try {
      const response = await apiFetch(`/account/reorder/${order.orderNumber}`, { method: "POST" });
      addItems(response.data.items || []);
      const adjusted = response.data.skipped?.length || 0;
      setNotice(response.data.priceChanged
        ? `Added available items from ${order.orderNumber} using today's prices${adjusted ? `; ${adjusted} availability note${adjusted === 1 ? "" : "s"} applied` : ""}.`
        : `Added available items from ${order.orderNumber}${adjusted ? `; ${adjusted} availability note${adjusted === 1 ? "" : "s"} applied` : ""}.`);
      setPreview(null);
    } catch (e) { setError(e.message); }
    finally { setReordering(""); }
  }

  return <div className="container page-space">
    <div className="page-title-row"><div><p className="eyebrow">MY RISEORA</p><h1>My orders</h1><p className="muted">Track active orders, review aftercare and safely refresh delivered products before buying again.</p></div><Link className="text-link" to="/track-order">Track another order</Link></div>
    {notice && <p className="alert success">{notice}</p>}
    {error && <p className="alert error">{error}</p>}
    {!error && orders.length === 0 && <div className="empty-state">No orders yet.</div>}
    <div className="order-list">{orders.map((order) => <article className="order-card phase5-order-card" key={order.id}>
      <div className="order-head"><div><strong>{order.orderNumber}</strong><p>{new Date(order.createdAt).toLocaleString()}</p></div><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status}</span></div>
      <OrderTimeline order={order} compact />
      {order.items.slice(0, 2).map((item) => <div className="summary-row" key={item.id}><span>{item.productName} / {item.variantName} × {item.quantity}</span><strong>{item.isComplimentary ? "FREE" : money(item.lineTotal)}</strong></div>)}
      {order.items.length > 2 && <small className="more-items">+{order.items.length - 2} more item(s)</small>}
      <div className="summary-row total"><span>Total</span><strong>{money(order.totalAmount)}</strong></div>
      <div className="phase23-order-actions">
        <Link className="button outline wide" to={`/orders/${order.orderNumber}`}>View & track order</Link>
        {order.status === "DELIVERED" && <button className="button wide" type="button" disabled={previewing === order.orderNumber || reordering === order.orderNumber} onClick={() => openReorderPreview(order)}>{previewing === order.orderNumber ? "Checking today's stock…" : "Review buy again"}</button>}
      </div>
      {preview?.orderNumber === order.orderNumber && <ReorderPreview preview={preview.data} busy={reordering === order.orderNumber} onConfirm={() => buyAgain(order)} onClose={() => setPreview(null)} />}
    </article>)}</div>
  </div>;
}
