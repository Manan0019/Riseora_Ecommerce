import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/http";

/** Read-only launch decision. Backend is protected by authenticated admin middleware. */
export default function AdminLaunchReadinessCenter() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassed, setShowPassed] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await apiFetch("/admin/phase96-launch/readiness"); setSnapshot(response.data); }
    catch (e) { setError(e.message || "Launch checks could not be loaded"); setSnapshot(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const rows = (snapshot?.signals || []).filter(r => showPassed || r.status !== "PASS");
  return (
    <section className="admin-panel phase96-launch" aria-label="Production launch readiness">
      <header className="phase96-heading">
        <div><p className="eyebrow">PHASE 96 · PRODUCTION FINISH LINE</p><h2>Launch Readiness & Operational Integrity</h2>
        <p>Read-only go/no-go review across database, inventory, fulfilment, payments, QA, recall, support and maintenance.</p></div>
        <button type="button" className="button button-secondary" onClick={refresh} disabled={loading}>{loading ? "Checking…" : "Recheck now"}</button>
      </header>
      {error && <p role="alert" className="alert error">{error}</p>}
      {snapshot && <>
        <div className="phase96-kpis">
          <div className={`phase96-decision ${snapshot.decision === "GO" ? "good" : snapshot.decision === "REVIEW" ? "review" : "blocked"}`}><small>LIVE DECISION</small><strong>{snapshot.decision}</strong><span>{snapshot.environment} environment</span></div>
          <div><small>BLOCKERS</small><strong>{snapshot.blocked}</strong></div>
          <div><small>TO REVIEW</small><strong>{snapshot.warnings}</strong></div>
          <div><small>PASSING</small><strong>{snapshot.passing}</strong></div>
          <div><small>CHECKS</small><strong>{snapshot.checked}</strong></div>
        </div>
        <p className="phase96-guidance">{snapshot.decision === "NO_GO" ? "Do not deploy while blocking integrity checks remain." : snapshot.decision === "REVIEW" ? "Review the warnings and record an explicit business decision before launch." : "Live checks passed. Continue the separate production config, security, payment, backup/restore and public smoke gates."}</p>
        <div className="phase96-toolbar"><label><input type="checkbox" checked={showPassed} onChange={(e) => setShowPassed(e.target.checked)} /> Include passing checks</label><small>Checked {new Date(snapshot.generatedAt).toLocaleString()}</small></div>
        <div className="phase96-signals">
          {rows.length ? rows.map(row => <div className={`phase96-signal ${row.status.toLowerCase()}`} key={row.code}>
            <span className="phase96-marker">{row.status}</span><div><strong>{row.name}</strong><p>{row.detail}</p></div><strong className="phase96-observed">{row.observed ?? "—"}</strong>
          </div>) : <p className="phase96-guidance">No outstanding warnings or blockers in these read-only checks.</p>}
        </div>
        <p className="phase96-note">This dashboard does not perform payment transactions, migrations, stock changes, or production cutover. It cannot replace a verified backup/restore drill or end-to-end checkout tests.</p>
      </>}
    </section>
  );
}
