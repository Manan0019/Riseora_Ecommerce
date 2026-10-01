import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/http";

function StatusPill({ ok, yes = "Ready", no = "Needs attention" }) {
  return <span className={`phase24-status-pill ${ok ? "ok" : "warn"}`}>{ok ? yes : no}</span>;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminSystem() {
  const [health, setHealth] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [healthResponse, backupResponse] = await Promise.all([
        apiFetch("/admin/system/health"),
        apiFetch("/admin/system/backups"),
      ]);
      setHealth(healthResponse.data);
      setBackups(backupResponse.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createBackup() {
    setCreating(true); setMessage(""); setError("");
    try {
      const response = await apiFetch("/admin/system/backups", { method: "POST" });
      setMessage(`Backup created: ${response.data.name}`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="admin-page-heading"><div><p className="eyebrow">SYSTEM</p><h1>Checking production health…</h1></div></div>;

  return <>
    <div className="admin-page-heading phase24-system-heading"><div><p className="eyebrow">PHASE 24 · OPERATIONS</p><h1>System health & backups</h1><p>Production readiness, integrations and server-side database backup history.</p></div><button className="button button-secondary" onClick={load}>Refresh status</button></div>
    {error && <div className="form-message error">{error}</div>}
    {message && <div className="form-message success">{message}</div>}

    {health && <>
      <section className="phase24-health-grid">
        <article><small>Overall</small><strong>{health.status === "healthy" ? "Healthy" : "Degraded"}</strong><StatusPill ok={health.status === "healthy"} yes="Healthy" no="Degraded" /></article>
        <article><small>Database</small><strong>{health.database?.ok ? `${health.database.latencyMs} ms` : "Offline"}</strong><StatusPill ok={health.database?.ok} yes="Connected" no="Disconnected" /></article>
        <article><small>Uploads</small><strong>{health.storage?.uploadsWritable ? "Writable" : "Blocked"}</strong><StatusPill ok={health.storage?.uploadsWritable} /></article>
        <article><small>Backup tool</small><strong>{health.backup?.pgDumpAvailable ? "pg_dump ready" : "Unavailable"}</strong><StatusPill ok={health.backup?.pgDumpAvailable} /></article>
      </section>

      <section className="admin-panel phase24-system-panel">
        <div className="admin-panel-head"><div><h2>Production services</h2><p>Configuration presence only. Secret values are never returned to the browser.</p></div><span className="phase24-runtime">{health.environment} · {health.nodeVersion}</span></div>
        <div className="phase24-integration-grid">
          <div><span>Razorpay</span><StatusPill ok={health.integrations?.razorpay} yes="Configured" no="Not configured" /></div>
          <div><span>Cloudinary</span><StatusPill ok={health.integrations?.cloudinary} yes="Configured" no="Not configured" /></div>
          <div><span>Transactional email</span><StatusPill ok={health.integrations?.email} yes="Configured" no="Not configured" /></div>
          <div><span>Public site URL</span><StatusPill ok={health.integrations?.publicSiteUrl} yes="Configured" no="Not configured" /></div>
        </div>
        <p className="admin-help-note">Uptime: {Math.floor((health.uptimeSeconds || 0) / 60)} minutes. Health snapshot: {new Date(health.timestamp).toLocaleString()}.</p>
      </section>
    </>}

    <section className="admin-panel phase24-system-panel">
      <div className="admin-panel-head"><div><h2>Database backups</h2><p>Creates PostgreSQL custom-format backups on the application host. Old backups are automatically pruned to the configured retention count.</p></div><button className="button" disabled={creating || !health?.backup?.pgDumpAvailable || !health?.storage?.backupsWritable} onClick={createBackup}>{creating ? "Creating…" : "Backup now"}</button></div>
      {!health?.backup?.pgDumpAvailable && <div className="phase24-warning">PostgreSQL client tools are not available on this host. Install pg_dump or use the Phase 24 Docker image, which includes it.</div>}
      <div className="phase24-backup-list">
        {backups.length === 0 && <div className="admin-empty"><strong>No backups yet</strong><p>Create the first backup before production launch.</p></div>}
        {backups.map((item) => <div key={item.name}><span><strong>{item.name}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span><b>{formatBytes(item.sizeBytes)}</b></div>)}
      </div>
      <p className="admin-help-note">Restore is deliberately not available in the browser. Use <code>RESTORE_DATABASE.bat</code>, which requires explicit typed confirmation.</p>
    </section>
  </>;
}
