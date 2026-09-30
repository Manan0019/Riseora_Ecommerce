import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/http";
import { Icon } from "../../components/Icons";

export default function AdminDashboard() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([apiFetch("/categories"), apiFetch("/products"), apiFetch("/admin/orders")])
      .then(([categoryResponse, productResponse, orderResponse]) => {
        setCategories(categoryResponse.data);
        setProducts(productResponse.data);
        setOrders(orderResponse.data);
      })
      .catch((err) => setError(err.message));
  }, []);

  const lowStock = useMemo(() => products.flatMap((product) => product.variants || []).filter((variant) => Number(variant.stockQuantity) <= Number(variant.lowStockThreshold ?? 5)).length, [products]);
  const pending = orders.filter((order) => ["PENDING", "CONFIRMED", "PROCESSING"].includes(order.status)).length;

  const stats = [
    { label: "Products", value: products.length, icon: "package", to: "/admin/catalog" },
    { label: "Categories", value: categories.length, icon: "shop", to: "/admin/catalog" },
    { label: "Open orders", value: pending, icon: "orders", to: "/admin/orders" },
    { label: "Low stock", value: lowStock, icon: "tag", to: "/admin/catalog" },
  ];

  return (
    <>
      <div className="admin-page-heading"><div><p className="eyebrow">OVERVIEW</p><h1>Dashboard</h1><p>Manage the Riseora online store from one place.</p></div><Link className="button admin-primary" to="/admin/catalog">+ Add product</Link></div>
      {error && <p className="alert error">{error}</p>}
      <div className="admin-stat-grid">{stats.map((stat) => <Link className="admin-stat-card" key={stat.label} to={stat.to}><span><Icon name={stat.icon} size={22} /></span><div><strong>{stat.value}</strong><small>{stat.label}</small></div></Link>)}</div>

      <div className="admin-panel-grid">
        <section className="admin-panel">
          <div className="admin-panel-head"><div><h2>Recent orders</h2><p>Latest customer activity</p></div><Link to="/admin/orders">View all</Link></div>
          {orders.length === 0 ? <div className="admin-empty">No orders yet.</div> : <div className="admin-table-list">{orders.slice(0, 5).map((order) => <div className="admin-order-row" key={order.id}><div><strong>{order.orderNumber}</strong><span>{order.customerName}</span></div><div><span className={`status-dot status-${order.status.toLowerCase()}`}>{order.status}</span><strong>₹{Number(order.totalAmount).toFixed(0)}</strong></div></div>)}</div>}
        </section>
        <section className="admin-panel quick-actions-panel">
          <div className="admin-panel-head"><div><h2>Quick actions</h2><p>Common store tasks</p></div></div>
          <Link to="/admin/catalog"><Icon name="plus" /> Add category or product <span>→</span></Link>
          <Link to="/admin/promotions"><Icon name="tag" /> Create coupon or offer <span>→</span></Link>
          <Link to="/admin/orders"><Icon name="orders" /> Update order status <span>→</span></Link>
        </section>
      </div>
    </>
  );
}
