import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import OrderTimeline from "../components/OrderTimeline";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch("/orders/my").then((r) => setOrders(r.data)).catch((e) => setError(e.message)); }, []);

  return <div className="container page-space"><div className="page-title-row"><div><p className="eyebrow">MY RISEORA</p><h1>My orders</h1></div><Link className="text-link" to="/track-order">Track another order</Link></div>{error && <p className="alert error">{error}</p>}{!error && orders.length === 0 && <div className="empty-state">No orders yet.</div>}<div className="order-list">{orders.map((order) => <article className="order-card phase5-order-card" key={order.id}><div className="order-head"><div><strong>{order.orderNumber}</strong><p>{new Date(order.createdAt).toLocaleString()}</p></div><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status}</span></div><OrderTimeline order={order} compact />{order.items.slice(0, 2).map((item) => <div className="summary-row" key={item.id}><span>{item.productName} / {item.variantName} × {item.quantity}</span><strong>₹{Number(item.lineTotal).toFixed(0)}</strong></div>)}{order.items.length > 2 && <small className="more-items">+{order.items.length - 2} more item(s)</small>}<div className="summary-row total"><span>Total</span><strong>₹{Number(order.totalAmount).toFixed(0)}</strong></div><Link className="button outline wide" to={`/orders/${order.orderNumber}`}>View & track order</Link></article>)}</div></div>;
}
