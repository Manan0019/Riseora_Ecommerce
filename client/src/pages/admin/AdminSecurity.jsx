import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/http";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../../components/Icons";
import { ADMIN_ROLE_LABELS } from "../../adminPermissions";

const roles = ["OWNER", "OPERATIONS", "CATALOG", "MARKETING", "SUPPORT"];
const roleHelp = {
  OWNER: "Full store, settings, ERP, security and staff access.",
  OPERATIONS: "Orders, returns, shipping and customer operations.",
  CATALOG: "Products, categories, inventory and product content.",
  MARKETING: "Offers, campaigns, audience, retention and growth tools.",
  SUPPORT: "Orders, returns, customers, reviews and product questions.",
};

function niceDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminSecurity() {
  const { user, replaceToken, updateUser } = useAuth();
  const [overview, setOverview] = useState(null);
  const [audit, setAudit] = useState([]);
  const [tab, setTab] = useState("activity");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [promote, setPromote] = useState({ email: "", adminRole: "SUPPORT" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const owner = (user?.adminRole || "OWNER") === "OWNER";

  function loadOverview() {
    return apiFetch("/admin/security/overview").then((response) => setOverview(response.data));
  }
  function loadAudit() {
    const query = new URLSearchParams({ limit: "120" });
    if (search.trim()) query.set("search", search.trim());
    if (method) query.set("method", method);
    if (failedOnly) query.set("failedOnly", "true");
    return apiFetch(`/admin/security/audit?${query.toString()}`).then((response) => setAudit(response.data || []));
  }
  function load() {
    setError("");
    return Promise.all([loadOverview(), loadAudit()]).catch((err) => setError(err.message));
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { if (owner) loadAudit().catch(() => {}); }, 180);
    return () => window.clearTimeout(timer);
  }, [search, method, failedOnly, owner]);

  async function promoteStaff(event) {
    event.preventDefault();
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await apiFetch("/admin/security/staff/promote", { method: "POST", body: JSON.stringify(promote) });
      setPromote({ email: "", adminRole: "SUPPORT" });
      setMessage(response.message || "Admin access granted.");
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function updateStaff(id, patch) {
    const action = patch.removeAdmin ? "remove admin access" : patch.isActive === false ? "deactivate this staff account" : "change this staff access";
    if (!window.confirm(`Are you sure you want to ${action}?`)) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await apiFetch(`/admin/security/staff/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setMessage(response.message || "Staff access updated.");
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function rotateSessions() {
    if (!window.confirm("Sign out every other active session for your admin account and keep only this browser signed in?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiFetch("/admin/security/session/rotate", { method: "POST" });
      replaceToken(response.data.token);
      updateUser({ adminRole: response.data.adminRole || user?.adminRole || "OWNER" });
      setMessage(response.message || "Other sessions signed out.");
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const stats = useMemo(() => [
    ["Active admins", overview?.activeAdmins ?? "—", "user"],
    ["Owners", overview?.ownerCount ?? "—", "shield"],
    ["Changes · 24h", overview?.recentChanges ?? "—", "refresh"],
    ["Failed actions · 24h", overview?.failedChanges ?? "—", "alert"],
  ], [overview]);

  if (!owner) return <div className="admin-page"><div className="admin-page-head"><div><p className="eyebrow">SECURITY</p><h1>Admin security</h1></div></div><p className="alert error">Only an Owner admin can manage staff access and security activity.</p></div>;

  return <div className="admin-page phase31-security-page">
    <div className="admin-page-head phase31-security-head"><div><p className="eyebrow">ACCESS & AUDIT</p><h1>Admin security</h1><p>Control who can access sensitive store tools and review administrative changes.</p></div><button className="button button-secondary" type="button" disabled={busy} onClick={rotateSessions}><Icon name="shield" size={17} /> Sign out other sessions</button></div>

    {message && <p className="alert success">{message}</p>}
    {error && <p className="alert error">{error}</p>}

    <div className="phase31-security-stats">{stats.map(([label, value, icon]) => <article key={label}><span><Icon name={icon} size={18} /></span><div><small>{label}</small><strong>{value}</strong></div></article>)}</div>

    <div className="phase31-security-tabs"><button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Activity log</button><button className={tab === "staff" ? "active" : ""} onClick={() => setTab("staff")}>Staff access</button><button className={tab === "roles" ? "active" : ""} onClick={() => setTab("roles")}>Role guide</button></div>

    {tab === "activity" && <section className="admin-card phase31-audit-card">
      <div className="phase31-audit-toolbar"><div className="admin-search"><Icon name="search" size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search path or admin email" /></div><select value={method} onChange={(e) => setMethod(e.target.value)}><option value="">All actions</option><option>POST</option><option>PATCH</option><option>PUT</option><option>DELETE</option></select><label className="checkbox-row"><input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} /> Failed only</label></div>
      <div className="phase31-audit-table-wrap"><table className="admin-table"><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Status</th><th>Time</th></tr></thead><tbody>{audit.map((row) => <tr key={row.id}><td>{niceDate(row.createdAt)}</td><td><strong>{row.actor ? `${row.actor.firstName}${row.actor.lastName ? ` ${row.actor.lastName}` : ""}` : "Deleted admin"}</strong><small>{row.actor?.email || "—"}</small></td><td><span className={`phase31-method ${row.method.toLowerCase()}`}>{row.method}</span><code>{row.path}</code></td><td><span className={row.statusCode >= 400 ? "phase31-status failed" : "phase31-status ok"}>{row.statusCode}</span></td><td>{row.durationMs == null ? "—" : `${row.durationMs} ms`}</td></tr>)}{audit.length === 0 && <tr><td colSpan="5"><div className="empty-state"><h3>No matching admin activity</h3><p>Administrative changes will appear here automatically.</p></div></td></tr>}</tbody></table></div>
    </section>}

    {tab === "staff" && <div className="phase31-staff-layout">
      <section className="admin-card"><div className="admin-card-head"><div><small>GRANT ACCESS</small><h2>Add existing Riseora account</h2></div></div><form className="phase31-promote-form" onSubmit={promoteStaff}><label>Account email<input required type="email" value={promote.email} onChange={(e) => setPromote((v) => ({ ...v, email: e.target.value }))} placeholder="staff@example.com" /></label><label>Admin role<select value={promote.adminRole} onChange={(e) => setPromote((v) => ({ ...v, adminRole: e.target.value }))}>{roles.map((role) => <option key={role} value={role}>{ADMIN_ROLE_LABELS[role]}</option>)}</select></label><p>{roleHelp[promote.adminRole]}</p><button className="button" disabled={busy}>GRANT ADMIN ACCESS</button><small>The person must already have a Riseora customer account. Their existing sessions are signed out when access changes.</small></form></section>
      <section className="admin-card phase31-staff-list"><div className="admin-card-head"><div><small>AUTHORIZED STAFF</small><h2>{overview?.admins?.length || 0} admin accounts</h2></div></div>{overview?.admins?.map((admin) => <article key={admin.id} className={!admin.isActive ? "inactive" : ""}><div className="phase31-staff-avatar">{admin.firstName?.charAt(0) || "A"}</div><div className="phase31-staff-info"><strong>{admin.firstName} {admin.lastName || ""}{admin.id === user?.id && <em>YOU</em>}</strong><small>{admin.email}</small><span>Added {niceDate(admin.createdAt)}</span></div><div className="phase31-staff-controls"><select disabled={busy} value={admin.adminRole || "OWNER"} onChange={(e) => updateStaff(admin.id, { adminRole: e.target.value })}>{roles.map((role) => <option key={role} value={role}>{ADMIN_ROLE_LABELS[role]}</option>)}</select>{admin.id !== user?.id && <>{admin.isActive ? <button className="link-button danger" disabled={busy} onClick={() => updateStaff(admin.id, { isActive: false })}>Deactivate</button> : <button className="link-button" disabled={busy} onClick={() => updateStaff(admin.id, { isActive: true })}>Reactivate</button>}<button className="link-button danger" disabled={busy} onClick={() => updateStaff(admin.id, { removeAdmin: true })}>Remove admin</button></>}</div></article>)}</section>
    </div>}

    {tab === "roles" && <div className="phase31-role-grid">{roles.map((role) => <article className="admin-card" key={role}><span className="phase31-role-icon"><Icon name={role === "OWNER" ? "shield" : role === "CATALOG" ? "package" : role === "MARKETING" ? "sparkles" : role === "OPERATIONS" ? "orders" : "user"} size={20} /></span><h3>{ADMIN_ROLE_LABELS[role]}</h3><p>{roleHelp[role]}</p><div>{role === "OWNER" ? "Everything" : role === "OPERATIONS" ? "Orders • Returns • Shipping • Customers" : role === "CATALOG" ? "Products • Categories • Inventory • Content" : role === "MARKETING" ? "Offers • Campaigns • Audience • Growth" : "Orders • Returns • Customers • Reviews"}</div></article>)}</div>}
  </div>;
}
