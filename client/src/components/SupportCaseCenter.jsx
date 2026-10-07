import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/http";

const terminal = new Set(["RESOLVED", "CLOSED", "SPAM"]);
const categories = ["GENERAL", "ORDER", "PAYMENT", "DELIVERY", "RETURN_REFUND", "PRODUCT", "ACCOUNT", "REWARDS"];

export default function SupportCaseCenter({ linkedReturn = null, compact = false }) {
  const [cases, setCases] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    category: linkedReturn ? "RETURN_REFUND" : "GENERAL",
    subject: linkedReturn ? `Help with return ${linkedReturn.returnNumber}` : "",
    message: "",
    orderNumber: linkedReturn?.orderNumber || "",
    returnRequestId: linkedReturn?.id || null,
  });
  const [reply, setReply] = useState("");
  const [rating, setRating] = useState({ score: 5, comment: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await apiFetch("/returns/support-cases");
    setCases(response.data || []);
    if (!selectedId && response.data?.[0]) setSelectedId(response.data[0].id);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!selectedId) return setSelected(null);
    apiFetch(`/returns/support-cases/${selectedId}`).then((r) => setSelected(r.data)).catch((e) => setError(e.message));
  }, [selectedId, cases]);

  const openCount = useMemo(() => cases.filter((item) => !terminal.has(item.status)).length, [cases]);
  const attention = useMemo(() => cases.filter((item) => item.supportHealth?.needsAttention).length, [cases]);

  async function createCase(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiFetch("/returns/support-cases", { method: "POST", body: JSON.stringify(form) });
      setMessage(`Support case ${response.data.ticketNumber} created.`);
      setForm((current) => ({ ...current, subject: linkedReturn ? current.subject : "", message: "", orderNumber: linkedReturn?.orderNumber || "", returnRequestId: linkedReturn?.id || null }));
      await load(); setSelectedId(response.data.id);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setBusy(true); setError("");
    try {
      await apiFetch(`/returns/support-cases/${selected.id}/reply`, { method: "POST", body: JSON.stringify({ message: reply }) });
      setReply(""); setMessage("Reply sent to Riseora support."); await load();
      const r = await apiFetch(`/returns/support-cases/${selected.id}`); setSelected(r.data);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function reopen() {
    if (!selected) return; setBusy(true);
    try { await apiFetch(`/returns/support-cases/${selected.id}/reopen`, { method: "POST" }); setMessage("Case reopened."); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function submitRating() {
    if (!selected) return; setBusy(true);
    try { await apiFetch(`/returns/support-cases/${selected.id}/rating`, { method: "POST", body: JSON.stringify(rating) }); setMessage("Thank you for rating this support experience."); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <section className={`phase84-support-center ${compact ? "compact" : ""}`}>
    <div className="phase84-support-head">
      <div><p className="eyebrow">PHASE 84 · CUSTOMER CARE</p><h2>{compact ? "Need help with this return?" : "Support & issue resolution"}</h2><p>Open one traceable case for order, payment, delivery, return, product, account or rewards issues. Every case has a service SLA and conversation history.</p></div>
      {!compact && <div className="phase84-support-kpis"><span><small>OPEN</small><strong>{openCount}</strong></span><span className={attention ? "warn" : ""}><small>NEEDS ATTENTION</small><strong>{attention}</strong></span><span><small>TOTAL</small><strong>{cases.length}</strong></span></div>}
    </div>
    {error && <p className="alert error">{error}</p>}{message && <p className="alert success">{message}</p>}
    <div className="phase84-support-grid">
      <form className="order-detail-card phase84-support-create" onSubmit={createCase}>
        <h3>Open a support case</h3>
        <div className="admin-field-grid two">
          <label>Issue type<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
          <label>Order number<input value={form.orderNumber} onChange={(e) => setForm({ ...form, orderNumber: e.target.value })} placeholder="Optional · e.g. ORD-..." readOnly={Boolean(linkedReturn)} /></label>
        </div>
        <label>Subject<input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Describe the issue briefly" required /></label>
        <label>What happened?<textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Share the details, what you expected, and what needs to be resolved." required /></label>
        {linkedReturn && <p className="phase84-linked-pill">Linked to {linkedReturn.returnNumber}</p>}
        <button className="button" disabled={busy}>{busy ? "Opening case…" : "Open support case"}</button>
      </form>

      {!compact && <div className="order-detail-card phase84-support-cases">
        <h3>Your cases</h3>
        {cases.length === 0 ? <p className="muted">No support cases yet.</p> : <div className="phase84-support-case-list">{cases.map((item) => <button key={item.id} type="button" className={selectedId === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}><span><strong>{item.ticketNumber}</strong><small>{item.subject || item.category}</small><small>{item.orderNumber ? `${item.orderNumber} · ` : ""}{item.priority}</small></span><b>{item.status.replaceAll("_", " ")}</b></button>)}</div>}
      </div>}
    </div>

    {!compact && selected && <article className="order-detail-card phase84-support-thread">
      <div className="phase84-thread-head"><div><small>{selected.ticketNumber}</small><h3>{selected.subject}</h3><p>{selected.category.replaceAll("_", " ")} · {selected.priority} priority{selected.returnRequest ? ` · ${selected.returnRequest.returnNumber}` : ""}</p></div><div><span className={`phase84-case-state ${selected.supportHealth?.state?.toLowerCase()}`}>{selected.supportHealth?.state?.replaceAll("_", " ")}</span><small>SLA {selected.slaDueAt ? new Date(selected.slaDueAt).toLocaleString() : "—"}</small></div></div>
      {selected.supportHealth?.overdue && <p className="alert warning">This case has passed its service SLA and is flagged for operations attention.</p>}
      {selected.recoveryGrant && <div className="phase85-customer-benefit"><div><small>PHASE 85 · RISEORA CARE BENEFIT</small><strong>{selected.recoveryGrant.kind === "COUPON" ? `₹${Number(selected.recoveryGrant.couponAmount || 0).toLocaleString("en-IN")} coupon` : `${selected.recoveryGrant.points} reward points`}</strong></div>{selected.recoveryGrant.couponCodeSnapshot && <code>{selected.recoveryGrant.couponCodeSnapshot}</code>}<p>{selected.recoveryGrant.kind === "COUPON" ? `Use this code at checkout before ${selected.recoveryGrant.expiresAt ? new Date(selected.recoveryGrant.expiresAt).toLocaleDateString() : "expiry"}.` : "These points are already available in your Riseora rewards balance."}</p></div>}
      <div className="phase84-conversation">{(selected.messages || []).map((row) => <div key={row.id} className={`phase84-message ${row.sender.toLowerCase()}`}><small>{row.sender === "CUSTOMER" ? "You" : row.sender === "ADMIN" ? "Riseora support" : "System"} · {new Date(row.createdAt).toLocaleString()}</small><p>{row.message}</p></div>)}</div>
      {!terminal.has(selected.status) ? <div className="phase84-reply-box"><textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to this case…" /><button className="button" type="button" disabled={busy || !reply.trim()} onClick={sendReply}>Send reply</button></div> : <div className="phase84-resolved-actions"><div><strong>{selected.resolutionCode?.replaceAll("_", " ") || "Resolved"}</strong>{selected.resolutionSummary && <p>{selected.resolutionSummary}</p>}</div><button className="button button-secondary" type="button" disabled={busy} onClick={reopen}>Reopen case</button></div>}
      {["RESOLVED", "CLOSED"].includes(selected.status) && !selected.satisfactionSubmittedAt && <div className="phase84-csat"><strong>How was this support experience?</strong><div className="phase84-score">{[1,2,3,4,5].map((n) => <button type="button" key={n} className={rating.score === n ? "active" : ""} onClick={() => setRating({ ...rating, score: n })}>{n}</button>)}</div><textarea value={rating.comment} onChange={(e) => setRating({ ...rating, comment: e.target.value })} placeholder="Optional feedback" /><button type="button" className="button button-secondary" disabled={busy} onClick={submitRating}>Submit rating</button></div>}
      {selected.satisfactionSubmittedAt && <p className="phase84-csat-done">Feedback submitted · {selected.satisfactionScore}/5</p>}
    </article>}
  </section>;
}
