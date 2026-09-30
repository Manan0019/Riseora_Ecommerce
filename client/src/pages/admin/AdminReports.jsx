import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/http";

function isoDate(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function money(value) { return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`; }
function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function downloadCsv(name, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

export default function AdminReports() {
  const today = new Date();
  const initialFrom = new Date(today); initialFrom.setDate(initialFrom.getDate() - 29);
  const [from, setFrom] = useState(isoDate(initialFrom));
  const [to, setTo] = useState(isoDate(today));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await apiFetch(`/admin/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setData(response.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const maxDaily = useMemo(() => Math.max(1, ...(data?.daily || []).map((row) => Number(row.net))), [data]);
  const summary = data?.summary;

  function exportReport() {
    if (!data) return;
    const rows = [
      ["Riseora Sales Report", `${data.range.from} to ${data.range.to}`],
      [],
      ["Metric", "Value"],
      ["Orders", summary.totalOrders], ["Active orders", summary.activeOrders], ["Gross order value", summary.grossOrderValue],
      ["Refunded value", summary.refundedValue], ["Net order value", summary.netOrderValue], ["Average order value", summary.averageOrderValue],
      ["Units ordered", summary.unitsOrdered], ["Delivered orders", summary.deliveredOrders], ["New customers", summary.newCustomers],
      [], ["Daily sales"], ["Date", "Orders", "Units", "Gross", "Refunds", "Net"],
      ...data.daily.map((row) => [row.date, row.orders, row.units, row.gross, row.refunds, row.net]),
      [], ["Top products"], ["SKU", "Product", "Variant", "Units", "Ordered value"],
      ...data.topProducts.map((row) => [row.sku, row.productName, row.variantName || "", row.units, row.value]),
      [], ["Coupon performance"], ["Coupon", "Orders", "Discount", "Order value"],
      ...data.couponPerformance.map((row) => [row.code, row.orders, row.discount, row.orderValue]),
    ];
    downloadCsv(`riseora-report-${data.range.from}-${data.range.to}.csv`, rows);
  }

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">BUSINESS INTELLIGENCE</p><h1>Sales reports</h1><p>Orders, refunds, customers, products and promotion performance.</p></div><button className="button button-secondary" disabled={!data} onClick={exportReport}>Export CSV</button></div>
    <section className="admin-panel phase10-report-filter"><label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><button className="button" onClick={load} disabled={loading}>{loading ? "Loading…" : "Apply"}</button></section>
    {error && <p className="alert error">{error}</p>}
    {summary && <>
      <div className="phase10-kpi-grid">
        <article><small>Net order value</small><strong>{money(summary.netOrderValue)}</strong><span>Gross {money(summary.grossOrderValue)} · refunds {money(summary.refundedValue)}</span></article>
        <article><small>Orders</small><strong>{summary.activeOrders}</strong><span>{summary.deliveredOrders} delivered · {summary.totalOrders - summary.activeOrders} cancelled</span></article>
        <article><small>Average order</small><strong>{money(summary.averageOrderValue)}</strong><span>{summary.unitsOrdered} units ordered</span></article>
        <article><small>New customers</small><strong>{summary.newCustomers}</strong><span>Joined in selected period</span></article>
      </div>

      <div className="phase10-report-grid">
        <section className="admin-panel"><div className="admin-panel-head"><div><h2>Sales trend</h2><p>Net order value after recorded refunds</p></div></div><div className="phase10-bars">{data.daily.length ? data.daily.map((row) => <div className="phase10-bar-row" key={row.date}><small>{row.date.slice(5)}</small><div><i style={{ width: `${Math.max(2, Number(row.net) / maxDaily * 100)}%` }} /></div><b>{money(row.net)}</b></div>) : <div className="admin-empty">No sales in this period.</div>}</div></section>
        <section className="admin-panel"><div className="admin-panel-head"><div><h2>Order status</h2><p>All orders created in this period</p></div></div><div className="phase10-status-list">{data.statusSplit.map((row) => <div key={row.status}><span>{row.status.replaceAll("_", " ")}</span><b>{row.count}</b></div>)}</div></section>
      </div>

      <div className="phase10-report-grid">
        <section className="admin-panel"><div className="admin-panel-head"><div><h2>Top products</h2><p>Ordered value before item-level return allocation</p></div></div><div className="phase10-table">{data.topProducts.slice(0, 10).map((row, index) => <div key={`${row.sku}-${index}`}><span><strong>{row.productName}</strong><small>{row.variantName || row.sku}</small></span><b>{row.units} units</b><strong>{money(row.value)}</strong></div>)}{!data.topProducts.length && <div className="admin-empty">No product sales yet.</div>}</div></section>
        <section className="admin-panel"><div className="admin-panel-head"><div><h2>Top customers</h2><p>Order value in the selected period</p></div></div><div className="phase10-table">{data.topCustomers.slice(0, 10).map((row, index) => <div key={`${row.email || row.phone}-${index}`}><span><strong>{row.name}</strong><small>{row.email || row.phone}</small></span><b>{row.orders} orders</b><strong>{money(row.value)}</strong></div>)}{!data.topCustomers.length && <div className="admin-empty">No customer activity yet.</div>}</div></section>
      </div>

      <div className="phase10-report-grid">
        <section className="admin-panel"><div className="admin-panel-head"><div><h2>Payments</h2><p>Order value by payment method</p></div></div><div className="phase10-status-list">{data.paymentSplit.map((row) => <div key={row.method}><span>{row.method}</span><b>{row.orders} · {money(row.value)}</b></div>)}</div></section>
        <section className="admin-panel"><div className="admin-panel-head"><div><h2>Coupons</h2><p>Promotion performance</p></div></div><div className="phase10-table compact">{data.couponPerformance.slice(0, 10).map((row) => <div key={row.code}><span><strong>{row.code}</strong><small>{row.orders} orders · {money(row.discount)} discount</small></span><strong>{money(row.orderValue)}</strong></div>)}{!data.couponPerformance.length && <div className="admin-empty">No coupon orders in this period.</div>}</div></section>
      </div>
    </>}
  </>;
}
