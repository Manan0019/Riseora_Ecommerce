import { useEffect, useState } from "react";
import { apiFetch } from "../api/http";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch("/orders/my").then((r) => setOrders(r.data)).catch((e) => setError(e.message)); }, []);

  return <div className="container page-space"><h1>My orders</h1>{error && <p className="alert error">{error}</p>}{!error && orders.length === 0 && <div className="empty-state">No orders yet.</div>}<div className="order-list">{orders.map((order) => <article className="order-card" key={order.id}><div className="order-head"><div><strong>{order.orderNumber}</strong><p>{new Date(order.createdAt).toLocaleString()}</p></div><span className="status-pill">{order.status}</span></div>{order.items.map((item) => <div className="summary-row" key={item.id}><span>{item.productName} / {item.variantName} × {item.quantity}</span><strong>₹{Number(item.lineTotal).toFixed(0)}</strong></div>)}<div className="summary-row total"><span>Total</span><strong>₹{Number(order.totalAmount).toFixed(0)}</strong></div></article>)}</div></div>;
}
