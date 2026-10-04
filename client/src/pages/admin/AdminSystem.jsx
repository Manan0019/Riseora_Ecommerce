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
  const [launch, setLaunch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [runningJob, setRunningJob] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [healthResponse, backupResponse, launchResponse] = await Promise.all([
        apiFetch("/admin/system/health"),
        apiFetch("/admin/system/backups"),
        apiFetch("/admin/system/launch-readiness"),
      ]);
      setHealth(healthResponse.data);
      setBackups(backupResponse.data || []);
      setLaunch(launchResponse.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);


  async function runJob(key) {
    setRunningJob(key); setMessage(""); setError("");
    try {
      const response = await apiFetch(`/admin/system/jobs/${key}/run`, { method: "POST" });
      setMessage(response.message || "Background job completed");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunningJob("");
    }
  }

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
    <div className="admin-page-heading phase24-system-heading"><div><p className="eyebrow">PHASE 54 · DISCOVERY INTELLIGENCE CONTROL</p><h1>System health, release & recovery</h1><p>Deployment identity, API readiness, browser experience, search discovery quality, PostgreSQL recovery, schema integrity and durable background jobs.</p></div><button className="button button-secondary" onClick={load}>Refresh status</button></div>
    {error && <div className="form-message error">{error}</div>}
    {message && <div className="form-message success">{message}</div>}

    {health && <>
      <section className="phase24-health-grid">
        <article><small>Overall</small><strong>{health.status === "healthy" ? "Healthy" : "Degraded"}</strong><StatusPill ok={health.status === "healthy"} yes="Healthy" no="Degraded" /></article>
        <article><small>Database</small><strong>{health.database?.ok ? `${health.database.latencyMs} ms` : "Offline"}</strong><StatusPill ok={health.database?.ok} yes="Connected" no="Disconnected" /></article>
        <article><small>Backup tools</small><strong>{backupReady ? "Ready" : "Setup needed"}</strong><StatusPill ok={backupReady} /></article>
        <article><small>Latest backup</small><strong>{health.backup?.latest ? formatBytes(health.backup.latest.sizeBytes) : "None"}</strong><StatusPill ok={Boolean(health.backup?.latest?.verified)} yes="Checksum recorded" no="Create backup" /></article>
      </section>

      <section className="admin-panel phase24-system-panel phase49-release-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">RELEASE CONTROL</p><h2>Deployment & runtime identity</h2><p>Safe release metadata and production-configuration health. Secret values are never returned to this screen.</p></div><StatusPill ok={Boolean(health.deployment?.apiReady)} yes="API ready" no="Not ready" /></div>
        <div className="phase49-release-grid">
          <article><small>Release</small><strong>{health.deployment?.release?.name || "Local / unnamed"}</strong><span>{health.environment}</span></article>
          <article><small>Commit</small><strong>{health.deployment?.release?.sha || "Not supplied"}</strong><span>Short release SHA</span></article>
          <article><small>Build time</small><strong>{health.deployment?.release?.buildTime ? new Date(health.deployment.release.buildTime).toLocaleString() : "Not supplied"}</strong><span>Build provenance</span></article>
          <article><small>Started</small><strong>{health.deployment?.release?.startedAt ? new Date(health.deployment.release.startedAt).toLocaleString() : "Unknown"}</strong><span>{Math.floor((health.uptimeSeconds || 0) / 60)} min uptime</span></article>
          <article><small>Client mode</small><strong>{health.deployment?.clientMode === "same-origin" ? "Same origin" : "Separate client"}</strong><span>{health.deployment?.configuration?.configuredOrigins ?? 0} allowed origin(s)</span></article>
          <article><small>Production config</small><strong>{health.deployment?.configuration?.ok ? "Valid" : "Blocked"}</strong><span>{health.deployment?.configuration?.warnings?.length || 0} warning(s)</span></article>
        </div>
        {(health.deployment?.configuration?.errors || []).length > 0 && <div className="phase24-warning"><strong>Blocking production configuration:</strong><ul>{health.deployment.configuration.errors.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {(health.deployment?.configuration?.warnings || []).length > 0 && <div className="phase49-release-warnings"><strong>Review before launch</strong><ul>{health.deployment.configuration.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      </section>

      <section className="admin-panel phase24-system-panel">
        <div className="admin-panel-head"><div><h2>PostgreSQL recovery tools</h2><p>Phase 40 automatically discovers PostgreSQL client tools from PATH, PG_BIN, the Windows registry and common PostgreSQL install folders.</p></div><span className="phase24-runtime">{health.environment} · {health.nodeVersion}</span></div>
        <div className="phase40-tool-list">
          <ToolRow label="pg_dump" path={health.backup?.dumpPath} version={health.backup?.dumpVersion} />
          <ToolRow label="pg_restore" path={health.backup?.restorePath} version={health.backup?.restoreVersion} />
        </div>
        {!backupReady && <div className="phase24-warning">{health.backup?.setupHint || "Set PG_BIN to your PostgreSQL bin directory."}</div>}
      </section>

      <section className="admin-panel phase24-system-panel phase48-schema-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">DATABASE CONTRACT</p><h2>Schema & migration integrity</h2><p>The running API now refuses to start against a database that is behind the committed Prisma schema.</p></div><StatusPill ok={Boolean(health.schema?.ok)} yes="Schema ready" no="Migration required" /></div>
        <div className="phase48-schema-grid">
          <article><small>Expected migration head</small><strong>{health.schema?.expectedMigrationHead || "Unknown"}</strong></article>
          <article><small>Applied migrations</small><strong>{health.schema?.appliedMigrationCount ?? "—"}</strong></article>
          <article><small>Latest applied</small><strong>{health.schema?.latestAppliedMigration || "None"}</strong></article>
        </div>
        {(health.schema?.missing || []).length > 0 && <div className="phase24-warning"><strong>Missing database contract:</strong><ul>{health.schema.missing.map((item) => <li key={item}>{item}</li>)}</ul><code>npm run db:backup && npm run db:deploy && npm run db:generate</code></div>}
      </section>

      <section className="admin-panel phase24-system-panel phase48-jobs-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">BACKGROUND JOBS</p><h2>Lifecycle job reliability</h2><p>Database-backed leases prevent multiple API instances from sending the same recovery/refill alert at the same time.</p></div><span className="phase24-runtime">{health.jobs?.instance || "Instance unavailable"}</span></div>
        <div className="phase48-job-list">
          {(health.jobs?.jobs || []).map((job) => <article key={job.key} className={job.lastError ? "has-error" : ""}>
            <div><strong>{job.key.replaceAll("_", " ")}</strong><small>{job.state ? `${job.state.replace("-", " ").toUpperCase()} · ` : ""}{job.running ? "Running now" : job.lastSucceededAt ? `Last success ${new Date(job.lastSucceededAt).toLocaleString()}` : "Not run yet"}</small>{job.lastError && <em>{job.lastError}</em>}</div>
            <span>{job.lastDurationMs != null ? `${job.lastDurationMs} ms` : "—"}</span>
            <button className="button button-secondary" disabled={runningJob === job.key || job.running} onClick={() => runJob(job.key)}>{runningJob === job.key ? "Running…" : job.running ? "Running" : "Run now"}</button>
          </article>)}
        </div>
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
      <section className="admin-panel phase24-system-panel phase41-runtime-panel">
        <div className="admin-panel-head"><div><h2>Runtime observability</h2><p>Rolling 15-minute API health. Request IDs are returned in <code>X-Request-Id</code> and production logs are structured JSON.</p></div><span className={`phase24-status-pill ${health.runtime?.draining ? "warn" : "ok"}`}>{health.runtime?.draining ? "Draining" : "Accepting traffic"}</span></div>
        <div className="phase41-runtime-grid">
          <article><small>Requests · 15 min</small><strong>{health.runtime?.requestCount ?? 0}</strong><span>{health.runtime?.activeRequests ?? 0} active now</span></article>
          <article><small>P95 API latency</small><strong>{health.runtime?.p95Ms ?? 0} ms</strong><span>P50 {health.runtime?.p50Ms ?? 0} ms</span></article>
          <article><small>Server errors</small><strong>{health.runtime?.error5xx ?? 0}</strong><span>{health.runtime?.errorRatePercent ?? 0}% error rate</span></article>
          <article><small>Slow requests</small><strong>{health.runtime?.slowRequestCount ?? 0}</strong><span>Threshold {health.runtime?.slowThresholdMs ?? 1000} ms</span></article>
          <article><small>Client errors · 15 min</small><strong>{health.runtime?.clientErrorCount ?? 0}</strong><span>Browser/runtime reports</span></article>
          <article><small>Process memory</small><strong>{health.runtime?.memory?.rssMb ?? 0} MB</strong><span>Heap {health.runtime?.memory?.heapUsedMb ?? 0} MB</span></article>
          <article><small>Event loop lag</small><strong>{health.runtime?.eventLoopLagMs ?? 0} ms</strong><span>{health.runtime?.eventLoopLagMs > 250 ? "Investigate load" : "Normal"}</span></article>
        </div>
        <div className="phase53-web-experience">
          <div className="phase41-route-head"><span>Customer web experience</span><small>Privacy-safe browser performance samples · rolling 15 minutes</small></div>
          <div className="phase53-web-vitals-grid">
            <article><small>Samples</small><strong>{health.runtime?.webExperience?.sampleCount ?? 0}</strong><span>Recent page loads</span></article>
            <article><small>LCP · P75</small><strong>{health.runtime?.webExperience?.lcpP75Ms ?? 0} ms</strong><span>{(health.runtime?.webExperience?.lcpP75Ms ?? 0) > 2500 ? "Needs attention" : "Healthy target ≤ 2500 ms"}</span></article>
            <article><small>CLS · P75</small><strong>{health.runtime?.webExperience?.clsP75 ?? 0}</strong><span>{(health.runtime?.webExperience?.clsP75 ?? 0) > 0.1 ? "Needs attention" : "Healthy target ≤ 0.1"}</span></article>
            <article><small>Interaction · P75</small><strong>{health.runtime?.webExperience?.interactionP75Ms ?? 0} ms</strong><span>Longest observed interaction</span></article>
            <article><small>Page load · P75</small><strong>{health.runtime?.webExperience?.loadP75Ms ?? 0} ms</strong><span>Navigation load event</span></article>
            <article><small>Long tasks · P75</small><strong>{health.runtime?.webExperience?.longTaskP75Ms ?? 0} ms</strong><span>Main-thread blocking</span></article>
          </div>
          {(health.runtime?.webExperience?.routes || []).length > 0 && <div className="phase53-route-performance">
            {(health.runtime.webExperience.routes || []).map((row) => <div key={row.route}><code>{row.route}</code><span>{row.samples} sample{row.samples === 1 ? "" : "s"}</span><span>LCP {row.lcpP75Ms} ms</span><b>CLS {row.clsP75}</b></div>)}
          </div>}
        </div>
        <div className="phase54-search-health">
          <div className="phase41-route-head"><span>Search discovery health</span><small>Privacy-safe in-memory search signals · rolling {health.discovery?.windowMinutes ?? 60} minutes</small></div>
          <div className="phase54-search-health-grid">
            <article><small>Searches</small><strong>{health.discovery?.searchCount ?? 0}</strong><span>Header + shop discovery requests</span></article>
            <article><small>Zero-result rate</small><strong>{health.discovery?.zeroResultRatePercent ?? 0}%</strong><span>{(health.discovery?.zeroResultRatePercent ?? 0) > 20 ? "Review unmatched terms" : "Healthy discovery coverage"}</span></article>
            <article><small>Corrections</small><strong>{health.discovery?.correctionCount ?? 0}</strong><span>{health.discovery?.correctionRatePercent ?? 0}% received typo recovery</span></article>
          </div>
          <div className="phase54-search-lists">
            <section><strong>Top searches</strong>{(health.discovery?.topQueries || []).length ? (health.discovery.topQueries || []).map((item) => <div key={item.query}><span>{item.query}</span><b>{item.count}</b></div>) : <p>No search samples yet.</p>}</section>
            <section><strong>Zero-result searches</strong>{(health.discovery?.zeroResultQueries || []).length ? (health.discovery.zeroResultQueries || []).map((item) => <div key={item.query}><span>{item.query}</span><b>{item.count}</b></div>) : <p>No zero-result searches in the current window.</p>}</section>
          </div>
        </div>
        {(health.runtime?.routes || []).length > 0 && <div className="phase41-route-table">
          <div className="phase41-route-head"><span>Slowest API routes</span><small>P95 / maximum over the rolling window</small></div>
          {(health.runtime?.routes || []).map((row) => <div key={row.route}><code>{row.route}</code><span>{row.requests} req</span><span>{row.errors} errors</span><b>{row.p95Ms} / {row.maxMs} ms</b></div>)}
        </div>}
        {(health.runtime?.recentClientErrors || []).length > 0 && <div className="phase47-client-errors"><div className="phase41-route-head"><span>Recent client errors</span><small>Sanitized browser reports · rolling 15 minutes</small></div>{health.runtime.recentClientErrors.map((item, index) => <div key={`${item.at}-${index}`}><code>{item.referenceId ? `${item.referenceId} · ${item.route}` : item.route}</code><span>{item.source}</span><b>{item.message}</b><small>{new Date(item.at).toLocaleTimeString()}</small></div>)}</div>}
        <p className="admin-help-note">Release: {health.release?.name || "local / unnamed"}{health.release?.sha ? ` · ${health.release.sha}` : ""}. A graceful shutdown first marks readiness as unavailable, then waits up to the configured grace window before forcing exit.</p>
      </section>

    </>}

    {launch && <section className="admin-panel phase24-system-panel phase47-launch-panel">
      <div className="admin-panel-head"><div><p className="eyebrow">LAUNCH GATE</p><h2>Production readiness</h2><p>A consolidated check across database recovery, catalog, tax data, policies, delivery, payments and storefront availability.</p></div><div className={`phase47-launch-score ${launch.ready ? "ready" : "blocked"}`}><strong>{launch.score}%</strong><span>{launch.ready ? "READY" : `${launch.blocks} BLOCKER${launch.blocks === 1 ? "" : "S"}`}</span></div></div>
      <div className="phase47-launch-summary"><span><b>{launch.passed}</b> passed</span><span><b>{launch.warnings}</b> warnings</span><span><b>{launch.blocks}</b> blockers</span></div>
      <div className="phase47-launch-checks">{(launch.checks || []).map((item) => <article key={item.key} className={`phase47-launch-check ${item.status.toLowerCase()}`}><span>{item.status === "PASS" ? "✓" : item.status === "WARN" ? "!" : "×"}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></article>)}</div>
      <p className="admin-help-note">Use this together with <code>npm run prelaunch:check</code> and <code>npm run smoke:local</code>. A green launch gate does not replace final payment, tax and policy review with the owner/accountant.</p>
    </section>}

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
