import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/http";

const resolutionCodes = ["INFORMATION_PROVIDED", "ORDER_CORRECTED", "PAYMENT_RESOLVED", "DELIVERY_RESOLVED", "RETURN_RESOLVED", "REPLACEMENT_RESOLVED", "ACCOUNT_RESOLVED", "GOODWILL_RESOLUTION", "NO_ACTION_REQUIRED", "DUPLICATE", "OTHER"];
const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];

export default function AdminSupportOperations() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("ATTENTION");
  const [reply, setReply] = useState({ message: "", internal: false, waitForCustomer: true });
  const [resolution, setResolution] = useState({ resolutionCode: "INFORMATION_PROVIDED", resolutionSummary: "", customerVisibleMessage: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [list, metrics] = await Promise.all([apiFetch("/admin/support-cases"), apiFetch("/admin/support-cases/phase84-summary")]);
    setRows(list.data || []); setSummary(metrics.data || {});
    if (!selectedId && list.data?.[0]) setSelectedId(list.data[0].id);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!selectedId) return setSelected(null);
    apiFetch(`/admin/support-cases/${selectedId}`).then((r) => setSelected(r.data)).catch((e) => setError(e.message));
  }, [selectedId, rows]);

  const visible = useMemo(() => rows.filter((item) => {
    if (filter === "ALL") return true;
    if (filter === "ATTENTION") return item.supportHealth?.needsAttention;
    if (filter === "UNASSIGNED") return !item.assignedAdminUserId && item.supportHealth?.open;
    if (filter === "ESCALATED") return item.escalationLevel !== "NONE" && item.supportHealth?.open;
    if (filter === "OPEN") return item.supportHealth?.open;
    return item.status === filter;
  }), [rows, filter]);

  async function mutate(path, options, success) {
    setBusy(true); setError(""); setNotice("");
    try {
      await apiFetch(path, options); setNotice(success); await load();
      if (selectedId) { const r = await apiFetch(`/admin/support-cases/${selectedId}`); setSelected(r.data); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <section className="phase84-admin-support">
    <div className="admin-page-heading phase84-support-admin-head"><div><p className="eyebrow">PHASE 84 · SERVICE OPERATIONS</p><h2>Customer Care Command Center</h2><p>Own customer issues from intake to auditable resolution with SLA, escalation, internal notes, linked commerce context and CSAT.</p></div></div>
    {notice && <p className="alert success">{notice}</p>}{error && <p className="alert error">{error}</p>}
    <div className="phase84-admin-support-kpis">
      <article><span>OPEN</span><strong>{summary.open || 0}</strong></article>
      <article className={(summary.attention || 0) ? "warn" : ""}><span>ATTENTION</span><strong>{summary.attention || 0}</strong></article>
      <article className={(summary.overdue || 0) ? "danger" : ""}><span>SLA BREACH</span><strong>{summary.overdue || 0}</strong></article>
      <article><span>UNASSIGNED</span><strong>{summary.unassigned || 0}</strong></article>
      <article><span>ESCALATED</span><strong>{summary.escalated || 0}</strong></article>
      <article><span>CSAT</span><strong>{summary.csatResponses ? `${summary.csatAverage}/5` : "—"}</strong></article>
    </div>
    <div className="admin-return-filters phase84-support-filters">{["ATTENTION","OPEN","UNASSIGNED","ESCALATED","WAITING_CUSTOMER","RESOLVED","ALL"].map((value) => <button key={value} className={filter === value ? "state-toggle active" : "state-toggle"} onClick={() => setFilter(value)}>{value.replaceAll("_", " ")}</button>)}</div>
    <div className="phase84-admin-support-layout">
      <div className="admin-panel phase84-ticket-list">{visible.length === 0 ? <div className="admin-empty">No support cases in this view.</div> : visible.map((item) => <button key={item.id} className={selectedId === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}><span><strong>{item.ticketNumber}</strong><small>{item.subject || item.category}</small><small>{item.orderNumber || "No order"} · {item.priority}</small>{item.supportHealth?.overdue && <small className="danger-text">SLA BREACH</small>}</span><b>{item.status.replaceAll("_", " ")}</b></button>)}</div>
      {selected && <div className="phase84-ticket-workbench">
        <section className="admin-panel">
          <div className="admin-panel-head"><div><small>{selected.ticketNumber}</small><h2>{selected.subject}</h2><p>{selected.name} · {selected.email}{selected.orderNumber ? ` · ${selected.orderNumber}` : ""}</p></div><span className={`phase84-case-state ${selected.supportHealth?.state?.toLowerCase()}`}>{selected.supportHealth?.state?.replaceAll("_", " ")}</span></div>
          <div className="phase84-support-admin-meta">
            <span><small>STATUS</small><strong>{selected.status.replaceAll("_", " ")}</strong></span>
            <span><small>PRIORITY</small><strong>{selected.priority}</strong></span>
            <span><small>SLA</small><strong>{selected.slaDueAt ? new Date(selected.slaDueAt).toLocaleString() : "—"}</strong></span>
            <span><small>ESCALATION</small><strong>{selected.escalationLevel}</strong></span>
            <span><small>OWNER</small><strong>{selected.assignedAdmin ? `${selected.assignedAdmin.firstName} ${selected.assignedAdmin.lastName || ""}`.trim() : selected.assignedAdminUserId ? "Assigned admin" : "Unassigned"}</strong></span>
          </div>
          {selected.returnRequest && <p className="phase84-linked-pill">Linked return · {selected.returnRequest.returnNumber} · {selected.returnRequest.status.replaceAll("_", " ")}</p>}
          <div className="phase84-support-actions">
            <button className="button button-secondary" disabled={busy} onClick={() => mutate(`/admin/support-cases/${selected.id}/assign-to-me`, { method: "POST" }, "Case assigned to you.")}>Assign to me</button>
            <select value={selected.priority} disabled={busy} onChange={(e) => mutate(`/admin/support-cases/${selected.id}/priority`, { method: "PATCH", body: JSON.stringify({ priority: e.target.value }) }, "Priority and SLA updated.")}>{priorities.map((v) => <option key={v}>{v}</option>)}</select>
            {!["RESOLVED","CLOSED","SPAM"].includes(selected.status) && <button className="button button-secondary" disabled={busy || selected.escalationLevel === "MANAGEMENT"} onClick={() => mutate(`/admin/support-cases/${selected.id}/escalate`, { method: "POST" }, "Case escalated.")}>Escalate</button>}
          </div>
        </section>

        <section className="admin-panel phase84-admin-thread">
          <div className="admin-panel-head"><div><p className="eyebrow">CASE CONVERSATION</p><h3>Customer + internal operations trail</h3></div></div>
          <div className="phase84-conversation admin">{(selected.messages || []).map((row) => <div key={row.id} className={`phase84-message ${row.sender.toLowerCase()} ${row.isInternal ? "internal" : ""}`}><small>{row.isInternal ? "INTERNAL NOTE" : row.sender} · {new Date(row.createdAt).toLocaleString()}</small><p>{row.message}</p></div>)}</div>
          {!["CLOSED","SPAM"].includes(selected.status) && <div className="phase84-admin-reply">
            <label>Reply / note<textarea value={reply.message} onChange={(e) => setReply({ ...reply, message: e.target.value })} placeholder="Write the next action, customer reply or internal handoff note…" /></label>
            <div className="phase84-reply-options"><label><input type="checkbox" checked={reply.internal} onChange={(e) => setReply({ ...reply, internal: e.target.checked })} /> Internal note only</label>{!reply.internal && <label><input type="checkbox" checked={reply.waitForCustomer} onChange={(e) => setReply({ ...reply, waitForCustomer: e.target.checked })} /> Waiting for customer after reply</label>}</div>
            <button className="button" disabled={busy || !reply.message.trim()} onClick={() => mutate(`/admin/support-cases/${selected.id}/reply`, { method: "POST", body: JSON.stringify(reply) }, reply.internal ? "Internal note added." : "Reply sent to customer.")}>Save {reply.internal ? "internal note" : "reply"}</button>
          </div>}
        </section>

        {!["RESOLVED","CLOSED","SPAM"].includes(selected.status) ? <section className="admin-panel phase84-resolution-panel">
          <p className="eyebrow">RESOLUTION EVIDENCE</p><h3>Close with a reason, not just a status</h3>
          <label>Resolution code<select value={resolution.resolutionCode} onChange={(e) => setResolution({ ...resolution, resolutionCode: e.target.value })}>{resolutionCodes.map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></label>
          <label>Internal resolution summary<textarea value={resolution.resolutionSummary} onChange={(e) => setResolution({ ...resolution, resolutionSummary: e.target.value })} placeholder="What was verified, changed, refunded, replaced or explained?" /></label>
          <label>Customer-visible resolution<textarea value={resolution.customerVisibleMessage} onChange={(e) => setResolution({ ...resolution, customerVisibleMessage: e.target.value })} placeholder="Clear final message for the customer" /></label>
          <button className="button" disabled={busy || resolution.resolutionSummary.trim().length < 8 || resolution.customerVisibleMessage.trim().length < 4} onClick={() => mutate(`/admin/support-cases/${selected.id}/resolve`, { method: "POST", body: JSON.stringify(resolution) }, "Support case resolved with evidence.")}>Resolve case</button>
        </section> : <section className="admin-panel phase84-resolution-panel"><p className="eyebrow">RESOLVED CASE</p><h3>{selected.resolutionCode?.replaceAll("_", " ") || "Resolved"}</h3><p>{selected.resolutionSummary || "No resolution summary."}</p>{selected.satisfactionScore && <p className="alert success">Customer CSAT · {selected.satisfactionScore}/5{selected.satisfactionComment ? ` · ${selected.satisfactionComment}` : ""}</p>}<button className="button button-secondary" disabled={busy} onClick={() => mutate(`/admin/support-cases/${selected.id}/reopen`, { method: "POST" }, "Case reopened.")}>Reopen case</button></section>}
      </div>}
    </div>
  </section>;
}
