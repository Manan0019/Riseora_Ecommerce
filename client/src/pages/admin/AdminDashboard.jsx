import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/http";
import { Icon } from "../../components/Icons";

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { apiFetch("/admin/dashboard").then((r) => setData(r.data)).catch((e) => setError(e.message)); }, []);

  const stats = data ? [
    { label: "Today's orders", value: data.todayOrderCount, icon: "orders", to: "/admin/orders" },
    { label: "Today's sales", value: `₹${Number(data.todaySales).toFixed(0)}`, icon: "sparkles", to: "/admin/orders" },
    { label: "Open orders", value: data.openOrderCount, icon: "package", to: "/admin/orders" },
    { label: "Low stock", value: data.lowStockCount, icon: "tag", to: "/admin/inventory" },
    { label: "Products", value: data.productCount, icon: "shop", to: "/admin/catalog" },
    { label: "Customers", value: data.customerCount, icon: "user", to: "/admin/customers" },
  ] : [];

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">OVERVIEW</p><h1>Dashboard</h1><p>Live store activity, fulfilment and stock health.</p></div><Link className="button admin-primary" to="/admin/catalog">+ Add product</Link></div>
    {error && <p className="alert error">{error}</p>}
    <div className="admin-stat-grid admin-stat-grid-six">{stats.map((stat) => <Link className="admin-stat-card" key={stat.label} to={stat.to}><span><Icon name={stat.icon} size={22} /></span><div><strong>{stat.value}</strong><small>{stat.label}</small></div></Link>)}</div>

    <div className="admin-panel-grid">
      <section className="admin-panel">
        <div className="admin-panel-head"><div><h2>Recent orders</h2><p>Latest customer activity</p></div><Link to="/admin/orders">View all</Link></div>
        {!data?.recentOrders?.length ? <div className="admin-empty">No orders yet.</div> : <div className="admin-table-list">{data.recentOrders.map((order) => <div className="admin-order-row" key={order.id}><div><strong>{order.orderNumber}</strong><span>{order.customerName}</span></div><div><span className={`status-dot status-${order.status.toLowerCase()}`}>{order.status}</span><strong>₹{Number(order.totalAmount).toFixed(0)}</strong></div></div>)}</div>}
      </section>
      <section className="admin-panel">
        <div className="admin-panel-head"><div><h2>Stock attention</h2><p>Variants at or below their warning level</p></div><Link to="/admin/inventory">Inventory</Link></div>
        {!data?.lowStock?.length ? <div className="admin-empty">Stock levels look healthy.</div> : <div className="dashboard-low-stock">{data.lowStock.map((variant) => <div key={variant.id}><span><strong>{variant.product.name}</strong><small>{variant.name} • {variant.sku}</small></span><b>{variant.stockQuantity}</b></div>)}</div>}
      </section>
    </div>
  </>;
}
