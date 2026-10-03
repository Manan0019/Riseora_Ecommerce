import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/http";
import { Icon } from "../../components/Icons";

const EMPTY_SUMMARY = { onHand: 0, safetyStock: 0, available: 0, lowStock: 0, outOfStock: 0, costValue: 0, retailValue: 0, suggestedReorder: 0 };

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function daysLabel(value) {
  if (value == null) return "No recent sales";
  if (value > 365) return "365+ days";
  return `${Number(value).toFixed(value < 10 ? 1 : 0)} days`;
}

export default function AdminInventory() {
  const [variants, setVariants] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState(null);
  const [historyBusy, setHistoryBusy] = useState(false);

  async function refresh(query = search) {
    const response = await apiFetch(`/admin/inventory${query ? `?search=${encodeURIComponent(query)}` : ""}`);
    setVariants(response.data || []);
    setSummary(response.summary || EMPTY_SUMMARY);
  }

  useEffect(() => { refresh("").catch((e) => setError(e.message)); }, []);

  const visible = useMemo(() => variants.filter((variant) => {
    if (filter === "LOW") return variant.inventoryStatus === "LOW_STOCK";
    if (filter === "OUT") return variant.inventoryStatus === "OUT_OF_STOCK";
    if (filter === "REORDER") return Number(variant.suggestedReorder || 0) > 0;
    return true;
  }), [variants, filter]);

  async function save(variant, values) {
    setError(""); setMessage("");
    try {
      await apiFetch(`/admin/inventory/${variant.id}`, { method: "PATCH", body: JSON.stringify(values) });
      setMessage(`${variant.product.name} inventory updated.`);
      await refresh();
      if (history?.variant?.id === variant.id) await openHistory(variant.id);
    } catch (e) { setError(e.message); }
  }

  async function openHistory(id) {
    setHistoryBusy(true); setError("");
    try {
      const response = await apiFetch(`/admin/inventory/${id}/movements`);
      setHistory(response.data);
    } catch (e) { setError(e.message); }
    finally { setHistoryBusy(false); }
  }

  function exportCsv() {
    const rows = [
      ["Product", "Variant", "SKU", "On hand", "Safety stock", "Available to sell", "Low at", "Sold 30d", "Days cover", "Suggested reorder", "Cost value", "Retail value"],
      ...visible.map((variant) => [
        variant.product?.name || "", variant.name, variant.sku, variant.stockQuantity, variant.safetyStock, variant.availableQuantity,
        variant.lowStockThreshold, variant.sold30d, variant.daysCover ?? "", variant.suggestedReorder,
        Number(variant.stockQuantity || 0) * Number(variant.costPrice || 0), Number(variant.stockQuantity || 0) * Number(variant.sellingPrice || 0),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `riseora-inventory-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <>
    <div className="admin-page-heading phase39-inventory-heading">
      <div><p className="eyebrow">INVENTORY CONTROL</p><h1>Stock, availability & demand</h1><p>Protect safety stock, keep a movement audit trail and use the last 30 days of delivered sales for reorder guidance.</p></div>
      <div className="phase34-heading-actions"><button className="button button-secondary" type="button" onClick={exportCsv}><Icon name="package" size={16} /> Export CSV</button></div>
    </div>

    <section className="phase39-inventory-kpis">
      <Kpi label="On hand" value={summary.onHand} note="Physical units" />
      <Kpi label="Safety buffer" value={summary.safetyStock} note="Protected from checkout" />
      <Kpi label="Sellable now" value={summary.available} note="Customer-available units" />
      <Kpi label="Low / out" value={`${summary.lowStock} / ${summary.outOfStock}`} note="Variants needing attention" />
      <Kpi label="Reorder guide" value={summary.suggestedReorder} note="Approx. 30-day target" />
      <Kpi label="Inventory cost" value={money(summary.costValue)} note={`Retail ${money(summary.retailValue)}`} />
    </section>

    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

    <section className="admin-panel phase39-inventory-panel">
      <form className="admin-search-bar" onSubmit={(e) => { e.preventDefault(); refresh(search).catch((err) => setError(err.message)); }}><Icon name="search" size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, variant or SKU" /><button>Search</button></form>
      <div className="phase39-inventory-tabs">
        {[['ALL','All'],['LOW',`Low ${summary.lowStock}`],['OUT',`Out ${summary.outOfStock}`],['REORDER','Reorder suggested']].map(([value,label]) => <button key={value} type="button" className={filter===value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
      <div className="phase39-inventory-list">{visible.map((variant) => <InventoryRow key={variant.id} variant={variant} onSave={save} onHistory={() => openHistory(variant.id)} />)}</div>
      {visible.length === 0 && <div className="admin-empty">No matching inventory rows.</div>}
    </section>

    {history && <InventoryHistory data={history} busy={historyBusy} onClose={() => setHistory(null)} />}
  </>;
}

function Kpi({ label, value, note }) {
  return <article><small>{label}</small><strong>{value}</strong><span>{note}</span></article>;
}

function InventoryRow({ variant, onSave, onHistory }) {
  const [stock, setStock] = useState(String(variant.stockQuantity));
  const [safety, setSafety] = useState(String(variant.safetyStock || 0));
  const [threshold, setThreshold] = useState(String(variant.lowStockThreshold));
  const [price, setPrice] = useState(String(Number(variant.sellingPrice)));
  const [reason, setReason] = useState("");
  const stockChanged = Number(stock) !== Number(variant.stockQuantity);
  const erpManaged = variant.erpManaged === true;
  const availableDraft = Math.max(0, Number(stock || 0) - Number(safety || 0));

  useEffect(() => {
    setStock(String(variant.stockQuantity)); setSafety(String(variant.safetyStock || 0)); setThreshold(String(variant.lowStockThreshold)); setPrice(String(Number(variant.sellingPrice))); setReason("");
  }, [variant]);

  const tone = variant.inventoryStatus === "OUT_OF_STOCK" ? "out" : variant.inventoryStatus === "LOW_STOCK" ? "low" : "ok";
  return <article className={`phase39-inventory-row ${tone}`}>
    <div className="phase39-inventory-product">
      <div className="phase39-stock-dot" />
      <div><strong>{variant.product.name}{erpManaged && <em className="phase25-erp-badge">ERP</em>}</strong><span>{variant.name} • {variant.sku}</span><small>{variant.inventoryStatus === "OUT_OF_STOCK" ? "Unavailable to customers" : variant.inventoryStatus === "LOW_STOCK" ? "Low sellable stock" : "Available"}</small></div>
    </div>
    <div className="phase39-stock-metrics"><span><small>SELLABLE</small><b>{availableDraft}</b></span><span><small>SOLD 30D</small><b>{variant.sold30d}</b></span><span><small>COVER</small><b>{daysLabel(variant.daysCover)}</b></span><span><small>REORDER</small><b>{variant.suggestedReorder || 0}</b></span></div>
    <div className="phase39-inventory-fields">
      <label>On hand<input type="number" min="0" value={stock} disabled={erpManaged} onChange={(e) => setStock(e.target.value)} /></label>
      <label>Safety stock<input type="number" min="0" value={safety} onChange={(e) => setSafety(e.target.value)} /><small>Never offered at checkout</small></label>
      <label>Low warning<input type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label>
      <label>Price ₹<input type="number" min="1" step="0.01" value={price} disabled={erpManaged} onChange={(e) => setPrice(e.target.value)} /></label>
    </div>
    {stockChanged && !erpManaged && <label className="phase39-adjust-reason">Adjustment reason<input value={reason} maxLength={240} onChange={(e) => setReason(e.target.value)} placeholder="Received 24 units / damaged 2 units / physical count correction…" /></label>}
    <div className="phase39-inventory-actions">
      <button className="state-toggle" type="button" onClick={onHistory}>History</button>
      <button className="state-toggle active" type="button" disabled={stockChanged && !reason.trim()} onClick={() => onSave(variant, erpManaged ? { safetyStock: Number(safety), lowStockThreshold: Number(threshold) } : { stockQuantity: Number(stock), safetyStock: Number(safety), lowStockThreshold: Number(threshold), sellingPrice: Number(price), reason: reason.trim() })}>{erpManaged ? "Save web rules" : "Save"}</button>
    </div>
  </article>;
}

function InventoryHistory({ data, busy, onClose }) {
  const variant = data.variant;
  return <div className="phase39-history-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="phase39-history-drawer">
    <header><div><p className="eyebrow">STOCK LEDGER</p><h2>{variant.product?.name}</h2><span>{variant.name} • {variant.sku}</span></div><button type="button" onClick={onClose}><Icon name="close" size={18} /></button></header>
    <div className="phase39-history-summary"><span><small>ON HAND</small><b>{variant.onHand ?? variant.stockQuantity}</b></span><span><small>SAFETY</small><b>{variant.safetyStock}</b></span><span><small>SELLABLE</small><b>{variant.availableQuantity ?? variant.available}</b></span></div>
    {busy ? <div className="admin-empty">Loading history…</div> : <div className="phase39-history-list">{(data.movements || []).map((row) => <article key={row.id}><div className={Number(row.quantityChange) >= 0 ? "positive" : "negative"}>{Number(row.quantityChange) > 0 ? "+" : ""}{row.quantityChange}</div><div><strong>{String(row.type || "").replaceAll("_", " ")}</strong><span>{row.reason || "Inventory movement"}</span><small>{row.stockBefore} → {row.stockAfter}{row.referenceType ? ` • ${row.referenceType}` : ""}</small></div><time>{new Date(row.createdAt).toLocaleString()}</time></article>)}{!data.movements?.length && <div className="admin-empty">No inventory movements recorded yet.</div>}</div>}
  </section></div>;
}
