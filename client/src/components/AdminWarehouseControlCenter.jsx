import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/http";

const fmt = (value) => value ? new Date(value).toLocaleDateString() : "—";
const statusLabel = (value) => String(value || "").replaceAll("_", " ");

export default function AdminWarehouseControlCenter() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("attention");
  const [selected, setSelected] = useState([]);
  const [trace, setTrace] = useState(null);
  const [count, setCount] = useState(null);
  const [counts, setCounts] = useState({});
  const [recall, setRecall] = useState({ reason: "", customerMessage: "" });
  const [warehouseForm, setWarehouseForm] = useState({ code: "", name: "", isDefault: false });
  const [binForm, setBinForm] = useState({ warehouseId: "", code: "", name: "", kind: "PICK" });

  async function load() {
    setError("");
    const response = await apiFetch("/admin/phase90-warehouse/overview");
    setData(response.data);
    if (!binForm.warehouseId && response.data.warehouses?.[0]?.id) setBinForm((v) => ({ ...v, warehouseId: response.data.warehouses[0].id }));
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const batches = useMemo(() => {
    const rows = data?.batches || [];
    if (filter === "expired") return rows.filter((x) => x.expiryState === "EXPIRED");
    if (filter === "near") return rows.filter((x) => x.expiryState === "NEAR_EXPIRY");
    if (filter === "quarantine") return rows.filter((x) => x.status === "QUARANTINED");
    if (filter === "recall") return rows.filter((x) => x.status === "RECALLED");
    if (filter === "available") return rows.filter((x) => x.status === "AVAILABLE" && x.availableQty > 0);
    if (filter === "all") return rows;
    return rows.filter((x) => ["EXPIRED", "NEAR_EXPIRY"].includes(x.expiryState) || ["QUARANTINED", "RECALLED"].includes(x.status));
  }, [data, filter]);

  async function run(action) {
    setBusy(true); setError(""); setMessage("");
    try { const result = await action(); if (result?.message) setMessage(result.message); await load(); return result; }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function batchAction(batch, action) {
    if (action === "write-off") {
      const quantity = Number(window.prompt(`Write-off quantity for ${batch.batchCode}`, String(Math.max(1, batch.quantityBlocked || batch.availableQty || 1))));
      if (!Number.isInteger(quantity) || quantity <= 0) return;
      const reason = window.prompt("Reason for write-off (required)", batch.status === "EXPIRED" ? "Expired stock disposal" : "Damaged / unusable stock");
      if (!reason) return;
      return run(() => apiFetch(`/admin/phase90-warehouse/batches/${batch.id}/write-off`, { method: "POST", body: JSON.stringify({ quantity, reason }) }));
    }
    const note = window.prompt(action === "release" ? "Release note" : "Quarantine reason", action === "release" ? "Quality review cleared" : "Quality hold pending inspection");
    if (!note) return;
    return run(() => apiFetch(`/admin/phase90-warehouse/batches/${batch.id}/${action}`, { method: "POST", body: JSON.stringify({ note }) }));
  }

  async function showTrace(batch) {
    setBusy(true); setError("");
    try { const response = await apiFetch(`/admin/phase90-warehouse/batches/${batch.id}/trace`); setTrace(response.data); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function createWarehouse(event) {
    event.preventDefault();
    await run(() => apiFetch("/admin/phase90-warehouse/warehouses", { method: "POST", body: JSON.stringify({ ...warehouseForm, status: "ACTIVE" }) }));
    setWarehouseForm({ code: "", name: "", isDefault: false });
  }

  async function createBin(event) {
    event.preventDefault();
    await run(() => apiFetch("/admin/phase90-warehouse/bins", { method: "POST", body: JSON.stringify(binForm) }));
    setBinForm((v) => ({ ...v, code: "", name: "" }));
  }

  async function startCount() {
    const warehouseId = data?.warehouses?.find((x) => x.isDefault)?.id || data?.warehouses?.[0]?.id;
    if (!warehouseId) return setError("Create an active warehouse first.");
    const result = await run(() => apiFetch("/admin/phase90-warehouse/cycle-counts", { method: "POST", body: JSON.stringify({ warehouseId, notes: "Phase 90 operational cycle count" }) }));
    if (result?.data?.id) await openCount(result.data.id);
  }

  async function openCount(id) {
    setBusy(true); setError("");
    try {
      const response = await apiFetch(`/admin/phase90-warehouse/cycle-counts/${id}`);
      setCount(response.data);
      const initial = {}; for (const item of response.data.items || []) initial[item.batchId] = item.countedQty ?? item.systemQty;
      setCounts(initial);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveCount() {
    if (!count) return;
    const items = count.items.map((item) => ({ batchId: item.batchId, countedQty: Number(counts[item.batchId]), reason: Number(counts[item.batchId]) === Number(item.systemQty) ? "" : "Physical count variance verified" }));
    await run(() => apiFetch(`/admin/phase90-warehouse/cycle-counts/${count.id}/items`, { method: "PATCH", body: JSON.stringify({ items }) }));
    await openCount(count.id);
  }

  async function countAction(action) {
    if (!count) return;
    await run(() => apiFetch(`/admin/phase90-warehouse/cycle-counts/${count.id}/${action}`, { method: "POST" }));
    await openCount(count.id);
  }

  async function createRecall(event) {
    event.preventDefault();
    if (!selected.length) return setError("Select at least one batch for the recall.");
    const result = await run(() => apiFetch("/admin/phase90-warehouse/recalls", { method: "POST", body: JSON.stringify({ batchIds: selected, ...recall }) }));
    if (result?.data) { setSelected([]); setRecall({ reason: "", customerMessage: "" }); }
  }

  async function recallAction(item, action) {
    if (action === "activate" && !window.confirm(`Activate ${item.recallNumber}? Remaining sellable stock in the selected batches will be blocked immediately.`)) return;
    await run(() => apiFetch(`/admin/phase90-warehouse/recalls/${item.id}/${action}`, { method: "POST" }));
  }

  if (!data) return <section className="admin-panel phase90-warehouse"><div className="skeleton-card tall" />{error && <p className="alert error">{error}</p>}</section>;
  const s = data.summary || {};

  return <section className="admin-panel phase90-warehouse">
    <div className="admin-panel-head"><div><p className="eyebrow">PHASE 90 · WAREHOUSE CONTROL</p><h2>Batch, Expiry, Cycle Count & Recall Command Center</h2><p>Physical warehouse traceability now sits underneath aggregate inventory. FEFO reservations protect expiry rotation, batch holds remove stock from sale, and cycle-count or recall actions remain auditable.</p></div><button type="button" className="button button-secondary" disabled={busy} onClick={() => load().catch((e) => setError(e.message))}>Refresh</button></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

    <div className="phase90-kpis">
      <article><small>BATCHES</small><strong>{s.batches || 0}</strong><span>Traceable stock lots</span></article>
      <article><small>SELLABLE</small><strong>{s.sellableUnits || 0}</strong><span>Batch-level available units</span></article>
      <article><small>RESERVED</small><strong>{s.reservedUnits || 0}</strong><span>Allocated at checkout</span></article>
      <article className={(s.blockedUnits || 0) > 0 ? "warn" : ""}><small>BLOCKED</small><strong>{s.blockedUnits || 0}</strong><span>Quarantine / expiry / recall</span></article>
      <article className={(s.expiredBatches || 0) > 0 ? "danger" : ""}><small>EXPIRED</small><strong>{s.expiredBatches || 0}</strong><span>Needs expiry sweep</span></article>
      <article className={(s.nearExpiryBatches || 0) > 0 ? "warn" : ""}><small>NEAR EXPIRY</small><strong>{s.nearExpiryBatches || 0}</strong><span>Next 30 days</span></article>
      <article><small>OPEN COUNTS</small><strong>{s.openCounts || 0}</strong><span>Physical reconciliation</span></article>
      <article className={(s.activeRecalls || 0) > 0 ? "danger" : ""}><small>ACTIVE RECALLS</small><strong>{s.activeRecalls || 0}</strong><span>Customer/stock action</span></article>
    </div>

    <div className="phase90-toolbar">
      <button type="button" className="button" disabled={busy} onClick={() => run(() => apiFetch("/admin/phase90-warehouse/expiry-sweep", { method: "POST" }))}>Run expiry sweep</button>
      <button type="button" className="button button-secondary" disabled={busy} onClick={startCount}>Start cycle count</button>
      <button type="button" className="button button-secondary" onClick={() => document.getElementById("phase90-recall-builder")?.scrollIntoView({ behavior: "smooth" })}>Create recall</button>
    </div>

    <div className="phase90-layout two">
      <form className="phase90-card" onSubmit={createWarehouse}><h3>Warehouse master</h3><div className="admin-field-grid two"><label>Code<input required value={warehouseForm.code} onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value.toUpperCase() })} placeholder="SECONDARY" /></label><label>Name<input required value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} placeholder="Secondary Warehouse" /></label></div><label className="admin-check-row"><input type="checkbox" checked={warehouseForm.isDefault} onChange={(e) => setWarehouseForm({ ...warehouseForm, isDefault: e.target.checked })} /> Make default warehouse</label><button className="button button-secondary" disabled={busy}>Add warehouse</button><div className="phase90-mini-list">{data.warehouses.map((w) => <span key={w.id}><b>{w.code}</b> · {w.name} · {w.status}{w.isDefault ? " · DEFAULT" : ""}</span>)}</div></form>
      <form className="phase90-card" onSubmit={createBin}><h3>Warehouse bins</h3><div className="admin-field-grid two"><label>Warehouse<select value={binForm.warehouseId} onChange={(e) => setBinForm({ ...binForm, warehouseId: e.target.value })}>{data.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></label><label>Type<select value={binForm.kind} onChange={(e) => setBinForm({ ...binForm, kind: e.target.value })}>{["PICK","BULK","QUARANTINE","RETURNS"].map((x) => <option key={x}>{x}</option>)}</select></label><label>Bin code<input required value={binForm.code} onChange={(e) => setBinForm({ ...binForm, code: e.target.value.toUpperCase() })} placeholder="PICK-02" /></label><label>Name<input required value={binForm.name} onChange={(e) => setBinForm({ ...binForm, name: e.target.value })} placeholder="Pick Shelf 02" /></label></div><button className="button button-secondary" disabled={busy}>Add bin</button></form>
    </div>

    <div className="admin-panel-head phase90-section-head"><div><h3>Batch inventory</h3><p>FEFO puts the earliest valid expiry first. Expired, recalled and quarantined stock is excluded from sellable allocation.</p></div><div className="phase90-filter-row">{[["attention","Attention"],["expired","Expired"],["near","Near expiry"],["quarantine","Quarantine"],["recall","Recall"],["available","Available"],["all","All"]].map(([v,l]) => <button key={v} type="button" className={filter === v ? "active" : ""} onClick={() => setFilter(v)}>{l}</button>)}</div></div>
    <div className="phase90-batch-table-wrap"><table className="phase90-batch-table"><thead><tr><th></th><th>SKU / batch</th><th>Warehouse</th><th>Status</th><th>Physical</th><th>Reserved</th><th>Blocked</th><th>Sellable</th><th>Expiry</th><th>Actions</th></tr></thead><tbody>{batches.map((b) => <tr key={b.id} className={b.expiryState === "EXPIRED" || b.status === "RECALLED" ? "danger" : b.expiryState === "NEAR_EXPIRY" ? "warn" : ""}><td><input type="checkbox" checked={selected.includes(b.id)} onChange={(e) => setSelected((rows) => e.target.checked ? [...rows, b.id] : rows.filter((id) => id !== b.id))} /></td><td><strong>{b.variant?.sku}</strong><small>{b.variant?.product?.name} · {b.batchCode}</small></td><td>{b.warehouse?.code}<small>{b.bin?.code || "No bin"}</small></td><td><span className={`phase90-chip ${String(b.status).toLowerCase()}`}>{statusLabel(b.status)}</span></td><td>{b.quantityOnHand}</td><td>{b.quantityReserved}</td><td>{b.quantityBlocked}</td><td><b>{b.availableQty}</b></td><td>{fmt(b.expiryDate)}<small>{statusLabel(b.expiryState)}</small></td><td><div className="phase90-actions"><button type="button" onClick={() => showTrace(b)}>Trace</button>{b.status === "AVAILABLE" && <button type="button" onClick={() => batchAction(b,"quarantine")}>Quarantine</button>}{b.status === "QUARANTINED" && <button type="button" onClick={() => batchAction(b,"release")}>Release</button>}{b.quantityOnHand - b.quantityReserved > 0 && <button type="button" onClick={() => batchAction(b,"write-off")}>Write-off</button>}</div></td></tr>)}</tbody></table>{batches.length === 0 && <p className="admin-empty">No batches match this view.</p>}</div>

    {trace && <div className="phase90-card phase90-trace"><div className="admin-panel-head"><div><h3>Batch trace · {trace.batchCode}</h3><p>{trace.variant?.product?.name} · {trace.variant?.sku}</p></div><button type="button" onClick={() => setTrace(null)}>Close</button></div><div className="phase90-trace-grid"><span><b>{trace.goodsReceiptItem?.goodsReceipt?.grnNumber || "Legacy / adjustment"}</b>Inbound source</span><span><b>{trace.goodsReceiptItem?.goodsReceipt?.purchaseOrder?.supplier?.name || "—"}</b>Supplier</span><span><b>{trace.orderAllocations?.length || 0}</b>Shipped order links</span><span><b>{trace.recallLinks?.length || 0}</b>Recall links</span></div><div className="phase90-mini-list">{(trace.orderAllocations || []).map((a) => <span key={a.id}><b>{a.order.orderNumber}</b> · {a.quantity} unit(s) · {a.order.status} · {a.order.customerName}</span>)}</div></div>}

    <div className="phase90-layout two">
      <div className="phase90-card"><div className="admin-panel-head"><div><h3>Cycle counts</h3><p>Snapshot → count → approve → post. Approval alone never changes inventory.</p></div></div><div className="phase90-mini-list">{data.counts.map((c) => <button type="button" key={c.id} onClick={() => openCount(c.id)}><b>{c.countNumber}</b> · {c.status} · {c._count?.items || 0} batches · {c.warehouse?.code}</button>)}</div></div>
      <form id="phase90-recall-builder" className="phase90-card" onSubmit={createRecall}><h3>Recall builder</h3><p>{selected.length} batch(es) selected from the table.</p><label>Internal recall reason<textarea required value={recall.reason} onChange={(e) => setRecall({ ...recall, reason: e.target.value })} placeholder="Reason, investigation reference and required action" /></label><label>Customer-facing message<textarea value={recall.customerMessage} onChange={(e) => setRecall({ ...recall, customerMessage: e.target.value })} placeholder="Only published after explicit admin action" /></label><button className="button" disabled={busy || !selected.length}>Create recall draft</button></form>
    </div>

    {count && <div className="phase90-card phase90-count-editor"><div className="admin-panel-head"><div><h3>{count.countNumber}</h3><p>{count.status} · {count.warehouse?.name}</p></div><button type="button" onClick={() => setCount(null)}>Close</button></div><div className="phase90-count-list">{count.items.map((item) => <label key={item.id}><span><b>{item.batch?.variant?.sku}</b><small>{item.batch?.batchCode} · system {item.systemQty} · reserved {item.batch?.quantityReserved} · blocked {item.batch?.quantityBlocked}</small></span><input type="number" min="0" value={counts[item.batchId] ?? ""} disabled={["APPROVED","POSTED","CANCELLED"].includes(count.status)} onChange={(e) => setCounts({ ...counts, [item.batchId]: e.target.value })} /></label>)}</div><div className="phase90-toolbar">{["DRAFT","REVIEW_REQUIRED"].includes(count.status) && <><button type="button" className="button button-secondary" onClick={saveCount}>Save counts</button><button type="button" className="button" onClick={() => countAction("approve")}>Approve count</button></>}{count.status === "APPROVED" && <button type="button" className="button" onClick={() => countAction("post")}>Post approved variance</button>}</div></div>}

    <div className="phase90-card"><div className="admin-panel-head"><div><h3>Recall register</h3><p>Activation removes remaining sellable batch stock immediately. Customer notices are separate and explicit.</p></div></div><div className="phase90-recalls">{data.recalls.map((r) => <article key={r.id}><div><span className={`phase90-chip ${String(r.status).toLowerCase()}`}>{r.status}</span><strong>{r.recallNumber}</strong><small>{r.batches?.length || 0} batch(es) · {fmt(r.createdAt)}</small><p>{r.reason}</p></div><div className="phase90-actions">{r.status === "DRAFT" && <button type="button" onClick={() => recallAction(r,"activate")}>Activate</button>}{r.status === "ACTIVE" && r.customerMessage && <button type="button" onClick={() => recallAction(r,"publish-notice")}>{r.noticePublishedAt ? "Republish-safe notice" : "Publish customer notice"}</button>}{r.status === "ACTIVE" && <button type="button" onClick={() => recallAction(r,"complete")}>Complete case</button>}</div></article>)}</div></div>
  </section>;
}
