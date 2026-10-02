import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/http";
import { Icon } from "../../components/Icons";

function money(value) { return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`; }
function delta(value) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(0)}%`;
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch("/admin/dashboard").then((r) => setData(r.data)).catch((e) => setError(e.message)); }, []);

  const stats = data ? [
    { label: "Today's sales", value: money(data.todaySales), meta: `${delta(data.todaySalesChange)} vs yesterday`, tone: Number(data.todaySalesChange) >= 0 ? "up" : "down", icon: "sparkles", to: "/admin/reports" },
    { label: "Today's orders", value: data.todayOrderCount, meta: `${delta(data.todayOrderChange)} vs yesterday`, tone: Number(data.todayOrderChange) >= 0 ? "up" : "down", icon: "orders", to: "/admin/orders" },
    { label: "This month", value: money(data.monthSales), meta: `${data.monthOrderCount} orders`, icon: "dashboard", to: "/admin/reports" },
    { label: "Open orders", value: data.openOrderCount, meta: "Needs fulfilment", icon: "package", to: "/admin/orders" },
    { label: "Inventory cost", value: money(data.inventoryCostValue), meta: `${money(data.inventoryRetailValue)} retail potential`, icon: "tag", to: "/admin/inventory" },
    { label: "Customers", value: data.customerCount, meta: `${data.productCount} active products`, icon: "user", to: "/admin/customers" },
    { label: "Returns", value: data.pendingReturnCount ?? 0, meta: "Active return journeys", icon: "truck", to: "/admin/returns" },
    { label: "Cancellations", value: data.pendingCancellationCount ?? 0, meta: "Waiting for review", icon: "close", to: "/admin/cancellations" },
  ] : [];

  const maxTrend = useMemo(() => Math.max(1, ...(data?.last7Days || []).map((row) => Number(row.sales))), [data]);

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">CONTROL CENTER</p><h1>Dashboard</h1><p>Live sales, fulfilment, customer and inventory health.</p></div><div className="phase34-heading-actions"><Link className="button button-secondary" to="/admin/reports">Open reports</Link><Link className="button admin-primary" to="/admin/catalog">+ Add product</Link></div></div>
    {error && <p className="alert error">{error}</p>}
    <div className="admin-stat-grid phase34-dashboard-kpis">{stats.map((stat) => <Link className="admin-stat-card phase34-kpi" key={stat.label} to={stat.to}><span><Icon name={stat.icon} size={22} /></span><div><strong>{stat.value}</strong><small>{stat.label}</small><em className={stat.tone || ""}>{stat.meta}</em></div></Link>)}</div>

    <div className="phase34-dashboard-grid">
      <section className="admin-panel phase34-trend-panel">
        <div className="admin-panel-head"><div><h2>7-day sales pulse</h2><p>Net order value excluding cancelled orders</p></div><Link to="/admin/reports">Deep dive</Link></div>
        <div className="phase34-mini-chart">{(data?.last7Days || []).map((row) => <div key={row.date} className="phase34-mini-bar"><div><i style={{ height: `${Math.max(4, Number(row.sales) / maxTrend * 100)}%` }} /></div><small>{new Date(`${row.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" })}</small><b>{money(row.sales)}</b></div>)}</div>
      </section>
      <section className="admin-panel phase34-attention-panel">
        <div className="admin-panel-head"><div><h2>Needs attention</h2><p>Operational items worth checking now</p></div></div>
        {!data?.attention?.length ? <div className="phase34-all-clear"><span>✓</span><div><strong>All clear</strong><p>No urgent store-operation alerts right now.</p></div></div> : <div className="phase34-attention-list">{data.attention.map((item, index) => <Link to={item.to} key={`${item.label}-${index}`} className={`phase34-attention ${item.type || "info"}`}><span /><strong>{item.label}</strong><Icon name="arrow" size={15} /></Link>)}</div>}
      </section>
    </div>

    <div className="admin-panel-grid phase34-dashboard-lower">
      <section className="admin-panel">
        <div className="admin-panel-head"><div><h2>Recent orders</h2><p>Latest customer activity</p></div><Link to="/admin/orders">View all</Link></div>
        {!data?.recentOrders?.length ? <div className="admin-empty">No orders yet.</div> : <div className="admin-table-list">{data.recentOrders.map((order) => <div className="admin-order-row" key={order.id}><div><strong>{order.orderNumber}</strong><span>{order.customerName} · {order.paymentMethod}</span></div><div><span className={`status-dot status-${order.status.toLowerCase()}`}>{order.status}</span><strong>{money(order.totalAmount)}</strong></div></div>)}</div>}
      </section>
      <section className="admin-panel">
        <div className="admin-panel-head"><div><h2>Stock attention</h2><p>{data?.outOfStockCount || 0} out · {data?.lowStockCount || 0} low · {data?.missingCostCount || 0} missing cost</p></div><Link to="/admin/inventory">Inventory</Link></div>
        {!data?.lowStock?.length ? <div className="admin-empty">Stock levels look healthy.</div> : <div className="dashboard-low-stock">{data.lowStock.map((variant) => <div key={variant.id}><span><strong>{variant.product.name}</strong><small>{variant.name} • {variant.sku}</small></span><b>{variant.stockQuantity}</b></div>)}</div>}
      </section>
    </div>
  </>;
}
