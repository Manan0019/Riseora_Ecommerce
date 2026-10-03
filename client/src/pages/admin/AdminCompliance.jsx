import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/http";

function niceDate(value) { return value ? new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; }
function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export default function AdminCompliance() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("requests");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() { const response = await apiFetch("/admin/compliance"); setData(response.data); }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const requests = useMemo(() => (data?.requests || []).filter((item) => !search || `${item.user?.firstName || ""} ${item.user?.lastName || ""} ${item.user?.email || ""} ${item.type} ${item.status} ${item.message || ""}`.toLowerCase().includes(search.toLowerCase())), [data, search]);
  const events = useMemo(() => (data?.recentConsent || []).filter((item) => !search || `${item.user?.email || item.email || ""} ${item.purpose} ${item.decision} ${item.source}`.toLowerCase().includes(search.toLowerCase())), [data, search]);

  async function updateRequest(item, status) {
    const note = window.prompt(status === "IN_REVIEW" ? "Internal processing note (optional)" : "Resolution note (optional)", item.adminNote || "");
    if (note === null) return;
    setError(""); setMessage("");
    try { const response = await apiFetch(`/admin/compliance/privacy-requests/${item.id}`, { method: "PATCH", body: JSON.stringify({ status, adminNote: note }) }); setMessage(response.message || "Privacy request updated."); await load(); }
    catch (e) { setError(e.message); }
  }

  function exportConsentCsv() {
    const rows = ["createdAt,email,purpose,decision,source,policyVersion", ...(data?.recentConsent || []).map((item) => [item.createdAt, item.user?.email || item.email || "", item.purpose, item.decision, item.source, item.policyVersion].map(csvCell).join(","))];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `riseora-consent-log-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const s = data?.summary || {};
  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">PRIVACY OPERATIONS</p><h1>Consent & privacy</h1><p>Customer-controlled marketing choices, consent history and privacy requests.</p></div><div className="phase46-admin-policy"><small>Privacy version</small><strong>{data?.policy?.version || "—"}</strong><span>{data?.policy?.configured ? "Policy configured" : "Policy content missing"}</span></div></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    <div className="phase46-compliance-kpis"><article><small>ACTIVE NEWSLETTER</small><strong>{s.activeNewsletter ?? "—"}</strong></article><article><small>EMAIL OPT-IN</small><strong>{s.emailMarketing ?? "—"}</strong></article><article><small>SMS OPT-IN</small><strong>{s.smsMarketing ?? "—"}</strong></article><article><small>WHATSAPP OPT-IN</small><strong>{s.whatsappMarketing ?? "—"}</strong></article><article><small>WITHDRAWALS · 30D</small><strong>{s.withdrawals30d ?? "—"}</strong></article><article className={s.openPrivacyRequests ? "attention" : ""}><small>OPEN REQUESTS</small><strong>{s.openPrivacyRequests ?? "—"}</strong></article></div>
    <div className="admin-audience-toolbar"><div className="admin-tab-switch"><button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>Privacy requests</button><button className={tab === "consent" ? "active" : ""} onClick={() => setTab("consent")}>Consent log</button></div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, purpose, request…" /></div>

    {tab === "requests" && <section className="admin-panel"><div className="admin-panel-head"><div><h2>Privacy request queue</h2><p>Erasure requests disable optional marketing immediately. Resolve only after the operational review and any required retention/anonymisation work is complete.</p></div></div><div className="phase46-admin-request-list">{requests.map((item) => <article key={item.id}><div><strong>{item.user?.firstName} {item.user?.lastName || ""}</strong><a href={`mailto:${item.user?.email}`}>{item.user?.email}</a><small>{niceDate(item.requestedAt)}</small></div><div><b>{item.type.replaceAll("_", " ")}</b><p>{item.message}</p>{item.adminNote && <small>Internal note: {item.adminNote}</small>}</div><div><span className={`phase46-request-status ${item.status.toLowerCase()}`}>{item.status.replaceAll("_", " ")}</span>{["OPEN", "IN_REVIEW"].includes(item.status) && <div className="phase46-admin-request-actions">{item.status === "OPEN" && <button className="button button-secondary" onClick={() => updateRequest(item, "IN_REVIEW")}>Start review</button>}<button className="button" onClick={() => updateRequest(item, "RESOLVED")}>Resolve</button><button className="link-button danger" onClick={() => updateRequest(item, "REJECTED")}>Reject</button></div>}</div></article>)}{!requests.length && <div className="admin-empty">No privacy requests found.</div>}</div></section>}

    {tab === "consent" && <section className="admin-panel"><div className="admin-panel-head"><div><h2>Consent ledger</h2><p>Recent grants and withdrawals with purpose, source and policy version. Raw IP addresses are not shown.</p></div><button className="button button-secondary" onClick={exportConsentCsv}>Export CSV</button></div><div className="phase46-admin-consent-list">{events.map((item) => <article key={item.id}><span className={item.decision === "GRANTED" ? "granted" : "withdrawn"}>{item.decision}</span><div><strong>{item.user?.email || item.email || "Anonymous browser"}</strong><small>{item.purpose.replaceAll("_", " ")} · {item.source} · policy {item.policyVersion}</small></div><time>{niceDate(item.createdAt)}</time></article>)}{!events.length && <div className="admin-empty">No consent events found.</div>}</div></section>}
  </>;
}
