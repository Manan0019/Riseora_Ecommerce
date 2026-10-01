import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import OrderTimeline from "../components/OrderTimeline";
import { useCart } from "../context/CartContext";

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

  useEffect(() => { apiFetch(`/orders/my/${orderNumber}`).then((r) => setOrder(r.data)).catch((e) => setError(e.message)); }, [orderNumber]);

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

  if (error && !order) return <div className="container page-space"><p className="alert error">{error}</p></div>;
  if (!order) return <div className="container page-space"><div className="skeleton-card tall" /></div>;

  return <div className="container page-space order-detail-page">
    {notice && <p className="alert success">{notice}</p>}
    {error && <p className="alert error">{error}</p>}
    <div className="order-detail-head"><div><Link to="/orders" className="back-link">← My orders</Link><p className="eyebrow">ORDER {order.orderNumber}</p><h1>Track your order</h1><p>Placed {new Date(order.createdAt).toLocaleString()}</p><div className="order-detail-actions">{!["PENDING","CANCELLED"].includes(order.status) && <Link className="button button-secondary" to={`/invoice/${order.orderNumber}`}>Tax invoice</Link>}{order.status === "DELIVERED" && <button className="button button-secondary" type="button" disabled={reordering} onClick={buyAgain}>{reordering ? "Refreshing…" : "Buy again"}</button>}{order.status === "DELIVERED" && <Link className="button" to={`/returns/new/${order.orderNumber}`}>Request return</Link>}</div></div><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status}</span></div>

    <div className="order-detail-grid">
      <section className="order-detail-card"><h2>Order progress</h2><OrderTimeline order={order} /></section>
      <section className="order-detail-card"><h2>Delivery</h2><strong>{order.customerName}</strong><Address value={order.shippingAddress} /><p>{order.customerPhone}</p>{(order.shippingZoneName || order.deliveryEstimate) && <div className="phase21-order-zone">{order.shippingZoneName && <span><b>Delivery zone</b>{order.shippingZoneName}</span>}{order.deliveryEstimate && <span><b>Checkout estimate</b>{order.deliveryEstimate.deliveryMinDays}–{order.deliveryEstimate.deliveryMaxDays} days after dispatch</span>}</div>}{order.shipment && <div className="shipment-box"><span>{order.shipment.carrier || "Delivery partner"}</span><strong>{order.shipment.trackingNumber || "Tracking pending"}</strong>{order.shipment.trackingUrl && <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer">Track with courier ↗</a>}</div>}</section>
    </div>

    <section className="order-detail-card order-items-card"><h2>Items</h2>{order.items.map((item) => <div className="summary-row" key={item.id}><span>{item.productName} {item.variantName ? `/ ${item.variantName}` : ""} × {item.quantity}{item.isComplimentary ? <small className="phase13-free-label"> FREE • {item.promotionLabel || "Offer"}</small> : null}</span><strong>{item.isComplimentary ? "FREE" : `₹${Number(item.lineTotal).toFixed(0)}`}</strong></div>)}<div className="summary-row"><span>Subtotal</span><strong>₹{Number(order.subtotal).toFixed(0)}</strong></div>{Number(order.discountAmount) > 0 && <div className="summary-row discount"><span>Discount {order.couponCode ? `(${order.couponCode})` : order.automaticPromotionName ? `(${order.automaticPromotionName})` : ""}</span><strong>−₹{Number(order.discountAmount).toFixed(0)}</strong></div>}<div className="summary-row total"><span>Total</span><strong>₹{Number(order.totalAmount).toFixed(0)}</strong></div></section>
  </div>;
}
