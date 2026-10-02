import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/http";

function money(value) { return `₹${Number(value || 0).toFixed(0)}`; }

export default function AdminCancellations() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("REQUESTED");
  const [adminNote, setAdminNote] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await apiFetch("/admin/cancellations");
    setItems(response.data || []);
    const preferred = (response.data || []).find((item) => item.status === "REQUESTED") || response.data?.[0];
    if (!selectedId && preferred) setSelectedId(preferred.id);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const visible = useMemo(() => filter === "ALL" ? items : items.filter((item) => item.status === filter), [items, filter]);
  const selected = visible.find((item) => item.id === selectedId) || visible[0] || null;

  useEffect(() => { setAdminNote(selected?.adminNote || ""); }, [selected?.id]);

  async function decide(action) {
    if (!selected) return;
    const prompt = action === "APPROVE"
      ? `Approve cancellation for ${selected.order.orderNumber}?${selected.order.paymentMethod === "ONLINE" && selected.order.payment?.status === "PAID" ? " This will refund the online payment before cancelling." : ""}`
      : `Reject cancellation for ${selected.order.orderNumber}?`;
    if (!window.confirm(prompt)) return;
    setWorking(true); setError(""); setMessage("");
    try {
      await apiFetch(`/admin/cancellations/${selected.id}`, { method: "PATCH", body: JSON.stringify({ action, adminNote }) });
      setMessage(action === "APPROVE" ? "Cancellation approved and order safely cancelled." : "Cancellation request rejected.");
      await load();
    } catch (e) { setError(e.message); } finally { setWorking(false); }
  }

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">POST-PURCHASE</p><h1>Cancellation requests</h1><p>Review customer requests before fulfilment moves forward. Paid online orders are refunded before stock is restored.</p></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    <div className="admin-return-filters">{["REQUESTED","APPROVED","COMPLETED","REJECTED","WITHDRAWN","ALL"].map((status) => <button key={status} className={filter === status ? "state-toggle active" : "state-toggle"} onClick={() => setFilter(status)}>{status}</button>)}</div>

    <div className="admin-returns-layout">
      <section className="admin-panel admin-return-list">
        {visible.length === 0 ? <div className="admin-empty">No cancellation requests in this view.</div> : visible.map((item) => <button key={item.id} className={selected?.id === item.id ? "admin-return-row active" : "admin-return-row"} onClick={() => setSelectedId(item.id)}><span><strong>{item.order.orderNumber}</strong><small>{item.user.firstName} {item.user.lastName || ""} · {item.reason}</small><small>{money(item.order.totalAmount)} · {item.order.paymentMethod}</small></span><b>{item.status}</b></button>)}
      </section>

      {selected && <section className="admin-panel admin-form">
        <div className="admin-panel-head"><div><h2>{selected.order.orderNumber}</h2><p>Requested {new Date(selected.requestedAt).toLocaleString()}</p></div><span className={`status-pill status-${selected.order.status.toLowerCase()}`}>{selected.order.status}</span></div>
        <div className="admin-return-customer"><strong>{selected.user.firstName} {selected.user.lastName || ""}</strong><span>{selected.user.email}</span><span>{selected.user.phone || selected.order.customerPhone}</span></div>
        <div className="admin-note-box"><small>REASON</small><p>{selected.reason}</p>{selected.customerNote && <p>{selected.customerNote}</p>}</div>
        <div className="admin-payment-summary"><span>Payment <strong>{selected.order.paymentMethod}</strong></span><span>Status <strong>{selected.order.payment?.status || "PENDING"}</strong></span><span>Total <strong>{money(selected.order.totalAmount)}</strong></span></div>
        <div className="admin-order-line-items">{selected.order.items.map((line) => <div key={line.id}><span><strong>{line.productName}</strong><small>{line.variantName || line.sku} × {line.quantity}</small></span><strong>{line.isComplimentary ? "FREE" : money(line.lineTotal)}</strong></div>)}</div>
        {selected.status === "APPROVED" && <div className="admin-note-box"><small>ACTION REQUIRED</small><p>This request reached refund-in-progress state. Verify the payment provider before taking any manual action to avoid a duplicate refund.</p></div>}{selected.status === "REQUESTED" ? <><label>Customer-visible decision note<textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="Optional explanation for the customer" /></label><div className="admin-cancellation-actions"><button className="button" disabled={working} onClick={() => decide("APPROVE")}>{working ? "Working…" : selected.order.paymentMethod === "ONLINE" && selected.order.payment?.status === "PAID" ? "Refund & approve cancellation" : "Approve cancellation"}</button><button className="button button-secondary" disabled={working} onClick={() => decide("REJECT")}>Reject request</button></div></> : <>{selected.adminNote && <div className="admin-note-box"><small>DECISION NOTE</small><p>{selected.adminNote}</p></div>}<Link className="button button-secondary" to={`/admin/orders/${selected.order.id}`}>Open order</Link></>}
      </section>}
    </div>
  </>;
}
