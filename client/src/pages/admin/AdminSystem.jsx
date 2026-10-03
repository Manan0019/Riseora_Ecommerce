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

function ToolRow({ label, path, version }) {
  return <div className="phase40-tool-row"><span><strong>{label}</strong><small>{version || "Not detected"}</small></span><code>{path || "Unavailable"}</code></div>;
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
      setMessage(`Verified backup created: ${response.data.name}`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="admin-page-heading"><div><p className="eyebrow">SYSTEM</p><h1>Checking production health…</h1></div></div>;

  const backupReady = Boolean(health?.backup?.pgDumpAvailable && health?.backup?.pgRestoreAvailable);
  return <>
    <div className="admin-page-heading phase24-system-heading"><div><p className="eyebrow">PHASE 40 · RESILIENCE</p><h1>System health, backups & recovery</h1><p>Runtime health, PostgreSQL tooling, verified backup archives and production-service readiness.</p></div><button className="button button-secondary" onClick={load}>Refresh status</button></div>
    {error && <div className="form-message error">{error}</div>}
    {message && <div className="form-message success">{message}</div>}

    {health && <>
      <section className="phase24-health-grid">
        <article><small>Overall</small><strong>{health.status === "healthy" ? "Healthy" : "Degraded"}</strong><StatusPill ok={health.status === "healthy"} yes="Healthy" no="Degraded" /></article>
        <article><small>Database</small><strong>{health.database?.ok ? `${health.database.latencyMs} ms` : "Offline"}</strong><StatusPill ok={health.database?.ok} yes="Connected" no="Disconnected" /></article>
        <article><small>Backup tools</small><strong>{backupReady ? "Ready" : "Setup needed"}</strong><StatusPill ok={backupReady} /></article>
        <article><small>Latest backup</small><strong>{health.backup?.latest ? formatBytes(health.backup.latest.sizeBytes) : "None"}</strong><StatusPill ok={Boolean(health.backup?.latest?.verified)} yes="Checksum recorded" no="Create backup" /></article>
      </section>

      <section className="admin-panel phase24-system-panel">
        <div className="admin-panel-head"><div><h2>PostgreSQL recovery tools</h2><p>Phase 40 automatically discovers PostgreSQL client tools from PATH, PG_BIN, the Windows registry and common PostgreSQL install folders.</p></div><span className="phase24-runtime">{health.environment} · {health.nodeVersion}</span></div>
        <div className="phase40-tool-list">
          <ToolRow label="pg_dump" path={health.backup?.dumpPath} version={health.backup?.dumpVersion} />
          <ToolRow label="pg_restore" path={health.backup?.restorePath} version={health.backup?.restoreVersion} />
        </div>
        {!backupReady && <div className="phase24-warning">{health.backup?.setupHint || "Set PG_BIN to your PostgreSQL bin directory."}</div>}
      </section>

      <section className="admin-panel phase24-system-panel">
        <div className="admin-panel-head"><div><h2>Production services</h2><p>Configuration presence only. Secret values are never returned to the browser.</p></div></div>
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
      <div className="admin-panel-head"><div><h2>Verified database backups</h2><p>Custom-format PostgreSQL archives are validated with <code>pg_restore --list</code> and receive a SHA-256 checksum before they are accepted.</p></div><button className="button" disabled={creating || !backupReady || !health?.storage?.backupsWritable} onClick={createBackup}>{creating ? "Creating & verifying…" : "Backup now"}</button></div>
      <div className="phase24-backup-list">
        {backups.length === 0 && <div className="admin-empty"><strong>No backups yet</strong><p>Create the first verified backup before production launch.</p></div>}
        {backups.map((item) => <div key={item.name}><span><strong>{item.name}</strong><small>{new Date(item.createdAt).toLocaleString()} · {item.verified ? "SHA-256 recorded" : "Legacy/unverified backup"}</small></span><b>{formatBytes(item.sizeBytes)}</b></div>)}
      </div>
      <p className="admin-help-note">Run <code>npm run db:doctor</code> from PowerShell to diagnose local PostgreSQL tools. Restore remains CLI-only and requires typed confirmation.</p>
    </section>
  </>;
}
