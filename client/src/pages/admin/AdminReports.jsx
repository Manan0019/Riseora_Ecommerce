import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/http";

function isoDate(value) {
  const date = new Date(value);
  const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function money(value) { return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`; }
function pct(value) { return `${Number(value || 0).toFixed(1)}%`; }
function signedPct(value) { const n = Number(value || 0); return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`; }
function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function downloadCsv(name, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}
function presetRange(days) { const to = new Date(); const from = new Date(to); from.setDate(from.getDate() - (days - 1)); return [isoDate(from), isoDate(to)]; }

function TrendChart({ rows = [] }) {
  const width = 820; const height = 220; const pad = 18;
  const max = Math.max(1, ...rows.map((row) => Number(row.net || 0)));
  const points = rows.map((row, index) => {
    const x = rows.length <= 1 ? width / 2 : pad + index * ((width - pad * 2) / (rows.length - 1));
    const y = height - pad - (Number(row.net || 0) / max) * (height - pad * 2);
    return { x, y, row };
  });
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = points.length ? `${path} L${points.at(-1).x},${height-pad} L${points[0].x},${height-pad} Z` : "";
  return <div className="phase34-chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Net sales trend"><defs><linearGradient id="phase34Area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".20"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>{area && <path d={area} fill="url(#phase34Area)"/>}{path && <path d={path} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>}{points.map((point) => <circle key={point.row.date} cx={point.x} cy={point.y} r="4" fill="currentColor"><title>{point.row.date}: {money(point.row.net)}</title></circle>)}</svg><div className="phase34-chart-labels">{rows.filter((_, i) => i === 0 || i === rows.length - 1 || (rows.length <= 10 && i % 2 === 0)).map((row) => <span key={row.date}>{row.date.slice(5)}</span>)}</div></div>;
}

export default function AdminReports() {
  const [initialFrom, initialTo] = presetRange(30);
  const [from, setFrom] = useState(initialFrom); const [to, setTo] = useState(initialTo);
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [tab, setTab] = useState("overview");
  async function load(nextFrom = from, nextTo = to) { setLoading(true); setError(""); try { const response = await apiFetch(`/admin/reports?from=${encodeURIComponent(nextFrom)}&to=${encodeURIComponent(nextTo)}`); setData(response.data); } catch (e) { setError(e.message); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  const summary = data?.summary;
  const comparison = data?.comparison || {};
  const maxCategory = useMemo(() => Math.max(1, ...(data?.categoryPerformance || []).map((row) => Number(row.value))), [data]);

  function usePreset(days) { const [nextFrom, nextTo] = presetRange(days); setFrom(nextFrom); setTo(nextTo); load(nextFrom, nextTo); }
  function exportReport() {
    if (!data) return;
    const rows = [
      ["Riseora Business Intelligence", `${data.range.from} to ${data.range.to}`], [], ["Metric", "Value", "Vs previous period"],
      ["Net revenue", summary.netOrderValue, comparison.netOrderValuePct], ["Estimated gross profit", summary.grossProfit, comparison.grossProfitPct], ["Gross margin %", summary.grossMarginPct, ""],
      ["Orders", summary.activeOrders, comparison.activeOrdersPct], ["Average order value", summary.averageOrderValue, comparison.averageOrderValuePct], ["Refunded value", summary.refundedValue, ""], ["COGS", summary.cogs, ""],
      ["New customers", summary.newCustomers, comparison.newCustomersPct], ["Repeat customer rate %", summary.repeatCustomerRatePct, ""], ["Cancellation rate %", summary.cancellationRatePct, ""], ["Refund rate %", summary.refundRatePct, ""],
      [], ["Daily"], ["Date", "Orders", "Units", "Gross", "Refunds", "Net", "COGS", "Profit"], ...data.daily.map((row) => [row.date,row.orders,row.units,row.gross,row.refunds,row.net,row.cogs,row.profit]),
      [], ["Top products"], ["SKU","Product","Variant","Units","Revenue","COGS","Profit"], ...data.topProducts.map((row) => [row.sku,row.productName,row.variantName||"",row.units,row.value,row.cogs,row.profit]),
      [], ["Categories"], ["Category","Units","Revenue","COGS","Profit"], ...data.categoryPerformance.map((row) => [row.category,row.units,row.value,row.cogs,row.profit]),
      [], ["Inventory"], ["Units in stock",data.inventory.units],["Cost value",data.inventory.costValue],["Retail value",data.inventory.retailValue],["Potential margin",data.inventory.potentialMarginValue],["Low stock",data.inventory.lowStock],["Out of stock",data.inventory.outOfStock],["Missing cost",data.inventory.missingCost],
    ];
    downloadCsv(`riseora-bi-${data.range.from}-${data.range.to}.csv`, rows);
  }

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">BUSINESS INTELLIGENCE</p><h1>Reports</h1><p>Revenue, margin, customers, products, inventory and operational quality.</p></div><button className="button button-secondary" disabled={!data} onClick={exportReport}>Export full CSV</button></div>
    <section className="admin-panel phase34-report-controls"><div className="phase34-presets"><button onClick={() => usePreset(7)}>7D</button><button onClick={() => usePreset(30)}>30D</button><button onClick={() => usePreset(90)}>90D</button><button onClick={() => usePreset(365)}>1Y</button></div><label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><button className="button" onClick={() => load()} disabled={loading}>{loading ? "Loading…" : "Apply"}</button></section>
    {error && <p className="alert error">{error}</p>}
    {summary && <>
      <div className="phase34-bi-kpis">
        <article><small>Net revenue</small><strong>{money(summary.netOrderValue)}</strong><span className={Number(comparison.netOrderValuePct) >= 0 ? "up" : "down"}>{signedPct(comparison.netOrderValuePct)} vs prior</span></article>
        <article><small>Estimated gross profit</small><strong>{money(summary.grossProfit)}</strong><span className={Number(comparison.grossProfitPct) >= 0 ? "up" : "down"}>{signedPct(comparison.grossProfitPct)} · {pct(summary.grossMarginPct)} margin</span></article>
        <article><small>Orders</small><strong>{summary.activeOrders}</strong><span className={Number(comparison.activeOrdersPct) >= 0 ? "up" : "down"}>{signedPct(comparison.activeOrdersPct)} · AOV {money(summary.averageOrderValue)}</span></article>
        <article><small>Repeat customer rate</small><strong>{pct(summary.repeatCustomerRatePct)}</strong><span>{summary.repeatCustomers} returning registered buyers</span></article>
        <article><small>Refund rate</small><strong>{pct(summary.refundRatePct)}</strong><span>{money(summary.refundedValue)} refunded</span></article>
        <article><small>Cost coverage</small><strong>{pct(summary.costCoveragePct)}</strong><span>{data.inventory.missingCost} active variants missing cost</span></article>
      </div>

      <div className="phase34-report-tabs"><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button><button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>Products</button><button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}>Inventory</button><button className={tab === "customers" ? "active" : ""} onClick={() => setTab("customers")}>Customers & marketing</button></div>

      {tab === "overview" && <>
        <div className="phase34-report-grid-wide">
          <section className="admin-panel"><div className="admin-panel-head"><div><h2>Net revenue trend</h2><p>{data.range.from} → {data.range.to} · prior {data.previousRange.from} → {data.previousRange.to}</p></div></div><TrendChart rows={data.daily} /></section>
          <section className="admin-panel"><div className="admin-panel-head"><div><h2>Operational quality</h2><p>Cancellation and refund pressure</p></div></div><div className="phase34-health-metrics"><div><span>Delivered orders</span><strong>{summary.deliveredOrders}</strong></div><div><span>Cancelled orders</span><strong>{summary.cancelledOrders}</strong><small>{pct(summary.cancellationRatePct)}</small></div><div><span>Refunded orders</span><strong>{summary.refundedOrders}</strong><small>{pct(summary.refundRatePct)} value rate</small></div><div><span>Units ordered</span><strong>{summary.unitsOrdered}</strong></div></div></section>
        </div>
        <div className="phase10-report-grid">
          <section className="admin-panel"><div className="admin-panel-head"><div><h2>Order status</h2><p>All orders created in the period</p></div></div><div className="phase10-status-list">{data.statusSplit.map((row) => <div key={row.status}><span>{row.status.replaceAll("_", " ")}</span><b>{row.count}</b></div>)}</div></section>
          <section className="admin-panel"><div className="admin-panel-head"><div><h2>Payment mix</h2><p>Order value by method</p></div></div><div className="phase10-status-list">{data.paymentSplit.map((row) => <div key={row.method}><span>{row.method}</span><b>{row.orders} · {money(row.value)}</b></div>)}</div></section>
        </div>
      </>}

      {tab === "products" && <>
        <div className="phase10-report-grid">
          <section className="admin-panel"><div className="admin-panel-head"><div><h2>Top products by revenue</h2><p>After line-level discounts</p></div></div><div className="phase10-table">{data.topProducts.slice(0,15).map((row,index) => <div key={`${row.sku}-${index}`}><span><strong>{row.productName}</strong><small>{row.variantName || row.sku}</small></span><b>{row.units} units</b><strong>{money(row.value)}</strong></div>)}{!data.topProducts.length && <div className="admin-empty">No product sales yet.</div>}</div></section>
          <section className="admin-panel"><div className="admin-panel-head"><div><h2>Top products by contribution</h2><p>Product revenue minus recorded product cost</p></div></div><div className="phase10-table">{data.profitableProducts.slice(0,15).map((row,index) => <div key={`${row.sku}-${index}`}><span><strong>{row.productName}</strong><small>{money(row.value)} revenue · {money(row.cogs)} COGS</small></span><b>{row.units} units</b><strong>{money(row.profit)}</strong></div>)}</div></section>
        </div>
        <section className="admin-panel"><div className="admin-panel-head"><div><h2>Category performance</h2><p>Revenue and estimated gross contribution</p></div></div><div className="phase34-category-bars">{data.categoryPerformance.map((row) => <div key={row.category}><div><span>{row.category}</span><b>{money(row.value)}</b></div><i><em style={{ width: `${Math.max(2, Number(row.value)/maxCategory*100)}%` }} /></i><small>{row.units} units · {money(row.profit)} profit</small></div>)}</div></section>
      </>}

      {tab === "inventory" && <>
        <div className="phase34-inventory-kpis"><article><small>Units in stock</small><strong>{data.inventory.units}</strong></article><article><small>Inventory cost</small><strong>{money(data.inventory.costValue)}</strong></article><article><small>Retail potential</small><strong>{money(data.inventory.retailValue)}</strong></article><article><small>Potential margin</small><strong>{money(data.inventory.potentialMarginValue)}</strong></article><article><small>Low / out</small><strong>{data.inventory.lowStock} / {data.inventory.outOfStock}</strong></article></div>
        <section className="admin-panel"><div className="admin-panel-head"><div><h2>Slow stock in selected period</h2><p>In-stock variants with no sales during this report window, sorted by tied-up cost.</p></div></div><div className="phase10-table">{data.slowStock.map((row) => <div key={row.id}><span><strong>{row.productName}</strong><small>{row.variantName} · {row.sku}</small></span><b>{row.stock} in stock</b><strong>{money(row.costValue)}</strong></div>)}{!data.slowStock.length && <div className="admin-empty">Every stocked variant moved during this period.</div>}</div></section>
      </>}

      {tab === "customers" && <>
        <div className="phase10-report-grid">
          <section className="admin-panel"><div className="admin-panel-head"><div><h2>Top customers</h2><p>Order value in selected period</p></div></div><div className="phase10-table">{data.topCustomers.slice(0,15).map((row,index) => <div key={`${row.email || row.phone}-${index}`}><span><strong>{row.name}</strong><small>{row.email || row.phone}</small></span><b>{row.orders} orders</b><strong>{money(row.value)}</strong></div>)}{!data.topCustomers.length && <div className="admin-empty">No customer activity yet.</div>}</div></section>
          <section className="admin-panel"><div className="admin-panel-head"><div><h2>Coupon performance</h2><p>Discount investment versus order value</p></div></div><div className="phase10-table compact">{data.couponPerformance.slice(0,15).map((row) => <div key={row.code}><span><strong>{row.code}</strong><small>{row.orders} orders · {money(row.discount)} discount</small></span><strong>{money(row.orderValue)}</strong></div>)}{!data.couponPerformance.length && <div className="admin-empty">No coupon orders in this period.</div>}</div></section>
        </div>
      </>}

      <p className="phase34-report-note">Estimated margin reporting uses each order item's product-cost snapshot. It does not subtract payment-gateway fees, courier expense or other operating costs. Existing historical items are backfilled once from the current variant cost during the Phase 34 migration; future orders preserve the cost that existed at checkout time.</p>
    </>}
  </>;
}
