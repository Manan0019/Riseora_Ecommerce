import { useEffect, useMemo, useState } from "react";
import { apiFetch, mediaUrl } from "../../api/http";
import ReturnTimeline from "../../components/ReturnTimeline";

const transitions = {
  REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PICKUP_PENDING", "IN_TRANSIT", "RECEIVED", "CANCELLED"],
  PICKUP_PENDING: ["IN_TRANSIT", "RECEIVED"],
  IN_TRANSIT: ["RECEIVED"],
  RECEIVED: ["REFUNDED"],
  REFUNDED: [], REJECTED: [], CANCELLED: [], REFUNDING: [],
};

function money(value) { return `₹${Number(value || 0).toFixed(0)}`; }

export default function AdminReturns() {
  const [returns, setReturns] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [form, setForm] = useState({ status: "", adminNote: "", customerVisibleNote: "", refundMethod: "", refundReference: "", reverseCarrier: "", reverseTrackingNumber: "", reverseTrackingUrl: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await apiFetch("/admin/returns"); setReturns(response.data);
    if (!selectedId && response.data[0]) setSelectedId(response.data[0].id);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const visible = useMemo(() => filter === "ALL" ? returns : returns.filter((item) => item.status === filter), [returns, filter]);
  const selected = visible.find((item) => item.id === selectedId) || visible[0] || null;

  useEffect(() => {
    if (!selected) return;
    setForm({ status: selected.status, adminNote: selected.adminNote || "", customerVisibleNote: "", refundMethod: selected.refundMethod || (selected.order.paymentMethod === "ONLINE" ? "ORIGINAL_PAYMENT" : ""), refundReference: selected.refundReference || "", reverseCarrier: selected.reverseCarrier || "", reverseTrackingNumber: selected.reverseTrackingNumber || "", reverseTrackingUrl: selected.reverseTrackingUrl || "" });
  }, [selectedId, selected?.status]);

  async function save(event) {
    event.preventDefault(); if (!selected) return; setMessage(""); setError("");
    try {
      await apiFetch(`/admin/returns/${selected.id}`, { method: "PATCH", body: JSON.stringify(form) });
      setMessage(`Return ${selected.returnNumber} updated.`); setForm((current) => ({ ...current, customerVisibleNote: "" })); await load();
    } catch (e) { setError(e.message); }
  }

  const options = selected ? [selected.status, ...(transitions[selected.status] || [])] : [];

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">POST-PURCHASE</p><h1>Returns & refunds</h1><p>Review evidence, reverse pickup, item receipt, refund value and the customer-visible return journey.</p></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    <div className="admin-return-filters">{["ALL","REQUESTED","APPROVED","PICKUP_PENDING","IN_TRANSIT","RECEIVED","REFUNDED","REJECTED"].map((status) => <button key={status} className={filter === status ? "state-toggle active" : "state-toggle"} onClick={() => setFilter(status)}>{status.replaceAll("_", " ")}</button>)}</div>

    <div className="admin-returns-layout">
      <section className="admin-panel admin-return-list">
        {visible.length === 0 ? <div className="admin-empty">No return requests in this view.</div> : visible.map((item) => <button key={item.id} className={selected?.id === item.id ? "admin-return-row active" : "admin-return-row"} onClick={() => setSelectedId(item.id)}><span><strong>{item.returnNumber}</strong><small>{item.order.orderNumber} · {item.order.customerName}</small><small>{item.items.length} line(s) · {money(item.refundAmount)}{item.evidence?.length ? ` · ${item.evidence.length} photo${item.evidence.length === 1 ? "" : "s"}` : ""}</small></span><b>{item.status.replaceAll("_", " ")}</b></button>)}
      </section>

      {selected && <form className="admin-panel admin-form" onSubmit={save}>
        <div className="admin-panel-head"><div><h2>{selected.returnNumber}</h2><p>Order {selected.order.orderNumber} · {selected.reason}</p></div><span className={`return-pill return-${selected.status.toLowerCase().replaceAll("_", "-")}`}>{selected.status.replaceAll("_", " ")}</span></div>
        <div className="admin-return-customer"><strong>{selected.user ? `${selected.user.firstName} ${selected.user.lastName || ""}`.trim() : selected.order.customerName}</strong><span>{selected.user?.email || selected.order.customerEmail}</span><span>{selected.user?.phone || selected.order.customerPhone}</span></div>
        {selected.details && <div className="admin-note-box"><small>CUSTOMER DETAILS</small><p>{selected.details}</p></div>}
        {(selected.evidence || []).length > 0 && <div><small className="admin-section-kicker">CUSTOMER EVIDENCE</small><div className="return-evidence-grid admin">{selected.evidence.map((image) => <a key={image.id} href={mediaUrl(image.url)} target="_blank" rel="noreferrer"><img src={mediaUrl(image.url)} alt={image.originalName || "Return evidence"} /></a>)}</div></div>}
        <div className="admin-order-line-items">{selected.items.map((item) => <div key={item.id}><span><strong>{item.orderItem.productName}</strong><small>{item.orderItem.variantName || item.orderItem.sku} × {item.quantity}</small></span><strong>{money(Number(item.unitRefundAmount) * item.quantity)}</strong></div>)}</div>
        <div className="admin-payment-summary"><span>Expected refund <strong>{money(selected.refundAmount)}</strong></span><span>Payment <strong>{selected.order.paymentMethod}</strong></span></div>

        <div className="admin-return-history"><small className="admin-section-kicker">CUSTOMER JOURNEY</small><ReturnTimeline item={selected} /></div>

        <label>Next status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{options.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
        {["APPROVED","PICKUP_PENDING","IN_TRANSIT","RECEIVED"].includes(form.status) && <><div className="admin-field-grid two"><label>Reverse courier<input value={form.reverseCarrier} onChange={(e) => setForm({ ...form, reverseCarrier: e.target.value })} placeholder="Optional" /></label><label>Return tracking number<input value={form.reverseTrackingNumber} onChange={(e) => setForm({ ...form, reverseTrackingNumber: e.target.value })} /></label></div><label>Return tracking URL<input type="url" value={form.reverseTrackingUrl} onChange={(e) => setForm({ ...form, reverseTrackingUrl: e.target.value })} placeholder="https://..." /></label></>}
        {form.status === "REFUNDED" && <><label>Refund method<select value={form.refundMethod} onChange={(e) => setForm({ ...form, refundMethod: e.target.value })}>{selected.order.paymentMethod === "ONLINE" ? <option value="ORIGINAL_PAYMENT">Original online payment</option> : <><option value="">Choose method</option><option value="UPI">UPI</option><option value="BANK_TRANSFER">Bank transfer</option><option value="STORE_CREDIT">Store credit</option><option value="OTHER">Other</option></>}</select></label>{selected.order.paymentMethod === "COD" && <label>Refund reference<input value={form.refundReference} onChange={(e) => setForm({ ...form, refundReference: e.target.value })} placeholder="UPI / bank transaction reference" /></label>}</>}
        <label>Customer-visible update<textarea value={form.customerVisibleNote} onChange={(e) => setForm({ ...form, customerVisibleNote: e.target.value })} placeholder="Optional note shown in the customer's return timeline" /></label>
        <label>Admin note<textarea value={form.adminNote} onChange={(e) => setForm({ ...form, adminNote: e.target.value })} placeholder="Internal / operational note" /></label>
        <button className="button">Save return update</button>
        {form.status === "RECEIVED" && selected.status !== "RECEIVED" && <p className="admin-help-note">Marking received restocks the returned quantities once. Refund can be processed in the next step.</p>}
        {form.status === "REFUNDED" && selected.order.paymentMethod === "ONLINE" && <p className="admin-help-note">This issues the calculated partial refund through Razorpay before the return is marked refunded.</p>}
      </form>}
    </div>
  </>;
}
