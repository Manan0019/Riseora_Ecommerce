import { useEffect, useState } from "react";
import { apiFetch } from "../../api/http";

const statuses = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  async function refresh() { const response = await apiFetch("/admin/orders"); setOrders(response.data); }
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);
  async function updateOrder(id, status) { try { await apiFetch(`/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await refresh(); } catch (e) { setError(e.message); } }

  return <><div className="admin-page-heading"><div><p className="eyebrow">ORDERS</p><h1>Order management</h1><p>Review customer orders and update fulfilment status.</p></div></div>{error && <p className="alert error">{error}</p>}<section className="admin-panel">{orders.length === 0 ? <div className="admin-empty">No orders yet.</div> : <div className="admin-order-cards">{orders.map((order) => <article className="admin-order-card" key={order.id}><div className="admin-order-card-head"><div><strong>{order.orderNumber}</strong><span>{new Date(order.createdAt).toLocaleString()}</span></div><strong>₹{Number(order.totalAmount).toFixed(0)}</strong></div><div className="admin-order-customer"><strong>{order.customerName}</strong><span>{order.customerPhone}{order.customerEmail ? ` • ${order.customerEmail}` : ""}</span></div><div className="admin-order-items">{order.items.map((item) => <span key={item.id}>{item.productName} × {item.quantity}</span>)}</div><label className="admin-status-control">Status<select value={order.status} onChange={(e) => updateOrder(order.id, e.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label></article>)}</div>}</section></>;
}
