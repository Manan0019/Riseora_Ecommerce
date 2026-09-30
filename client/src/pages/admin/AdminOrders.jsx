import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/http";
import { Icon } from "../../components/Icons";

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  useEffect(() => { apiFetch("/admin/orders").then((r) => setOrders(r.data)).catch((e) => setError(e.message)); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((order) => (status === "ALL" || order.status === status) && (!q || [order.orderNumber, order.customerName, order.customerPhone, order.customerEmail].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))));
  }, [orders, search, status]);

  return <><div className="admin-page-heading"><div><p className="eyebrow">ORDERS</p><h1>Order management</h1><p>Review, fulfil, ship and track customer orders.</p></div></div>{error && <p className="alert error">{error}</p>}<section className="admin-panel"><div className="admin-order-toolbar"><div className="admin-search-bar"><Icon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order, customer or phone" /></div><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All statuses</option>{["PENDING","CONFIRMED","PROCESSING","SHIPPED","DELIVERED","CANCELLED"].map((s) => <option key={s}>{s}</option>)}</select></div>{visible.length === 0 ? <div className="admin-empty">No orders found.</div> : <div className="admin-order-cards">{visible.map((order) => <article className="admin-order-card phase5-admin-order" key={order.id}><div className="admin-order-card-head"><div><strong>{order.orderNumber}</strong><span>{new Date(order.createdAt).toLocaleString()}</span></div><strong>₹{Number(order.totalAmount).toFixed(0)}</strong></div><div className="admin-order-customer"><strong>{order.customerName}</strong><span>{order.customerPhone}{order.customerEmail ? ` • ${order.customerEmail}` : ""}</span></div><div className="admin-order-items">{order.items.slice(0, 3).map((item) => <span key={item.id}>{item.productName} × {item.quantity}</span>)}</div><div className="admin-order-card-footer"><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status}</span>{order.shipment?.trackingNumber && <small>{order.shipment.carrier}: {order.shipment.trackingNumber}</small>}<Link className="state-toggle active" to={`/admin/orders/${order.id}`}>Manage order</Link></div></article>)}</div>}</section></>;
}
