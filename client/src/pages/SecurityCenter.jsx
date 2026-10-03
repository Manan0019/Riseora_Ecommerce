import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { Icon } from "../components/Icons";

function niceDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const eventLabels = {
  ACCOUNT_CREATED: "Account created",
  LOGIN_SUCCESS: "Signed in",
  LOGIN_FAILED: "Unsuccessful sign-in",
  LOGIN_BLOCKED: "Sign-in temporarily blocked",
  LOGOUT: "Signed out",
  PASSWORD_CHANGED: "Password changed",
  PASSWORD_RESET: "Password reset",
  SESSION_REVOKED: "Session signed out",
  SESSIONS_REVOKED: "Other sessions signed out",
  DATA_EXPORT: "Account data downloaded",
};

export default function SecurityCenter() {
  const { replaceToken, logout } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [exportPassword, setExportPassword] = useState("");

  async function load() {
    setError("");
    try {
      const response = await apiFetch("/account/security/overview");
      setData(response.data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function revokeSession(id) {
    if (!window.confirm("Sign out this Riseora session?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiFetch(`/account/security/sessions/${id}`, { method: "DELETE" });
      setMessage(response.message || "Session signed out.");
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function revokeOthers(event) {
    event.preventDefault();
    if (!window.confirm("Sign out every other Riseora session and keep only this browser signed in?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiFetch("/account/security/revoke-others", { method: "POST", body: JSON.stringify({ currentPassword: password }) });
      replaceToken(response.data.token);
      setPassword("");
      setMessage(response.message || "Other sessions signed out.");
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function exportData(event) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiFetch("/account/security/export", { method: "POST", body: JSON.stringify({ currentPassword: exportPassword }) });
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `riseora-account-data-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportPassword("");
      setMessage("Your Riseora account data export is ready.");
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const sessions = data?.sessions || [];
  const events = data?.events || [];
  const currentSession = sessions.find((item) => item.current);
  const stats = useMemo(() => [
    ["Active sessions", sessions.length || (data?.legacySession ? 1 : 0), "shield"],
    ["Last sign-in", data?.account?.lastLoginAt ? niceDate(data.account.lastLoginAt) : "First session", "clock"],
    ["Password updated", data?.account?.lastPasswordChangedAt ? niceDate(data.account.lastPasswordChangedAt) : "Not recorded", "refresh"],
  ], [data, sessions]);

  return <div className="container page-space phase42-security-center">
    <div className="phase42-security-hero">
      <div><p className="eyebrow">ACCOUNT SECURITY</p><h1>Security & privacy</h1><p>Review signed-in devices, recent security activity and your downloadable Riseora account data.</p></div>
      <Link className="button button-secondary" to="/account">← My Account</Link>
    </div>

    {message && <p className="alert success">{message}</p>}
    {error && <p className="alert error">{error}</p>}

    <div className="phase42-security-stats">{stats.map(([label, value, icon]) => <article key={label}><span><Icon name={icon} size={20} /></span><div><small>{label}</small><strong>{value}</strong></div></article>)}</div>

    {data?.legacySession && <div className="phase42-security-notice"><Icon name="shield" size={20} /><div><strong>This browser is using a pre-Phase-42 session.</strong><p>It remains valid until expiry for a smooth upgrade. The next time you sign in, it will appear as a fully managed device session.</p></div></div>}

    <section className="account-card phase42-session-card">
      <div className="account-card-head"><div><p className="eyebrow">SIGNED-IN DEVICES</p><h2>Active sessions</h2><p className="muted">If you do not recognize a device, sign it out immediately and change your password.</p></div></div>
      <div className="phase42-session-list">
        {sessions.map((session) => <article key={session.id} className={session.current ? "current" : ""}>
          <span className="phase42-session-icon"><Icon name="user" size={20} /></span>
          <div><strong>{session.deviceLabel || "Browser session"}{session.current && <em>CURRENT</em>}</strong><small>Last active {niceDate(session.lastSeenAt)}</small><small>Created {niceDate(session.createdAt)} · expires {niceDate(session.expiresAt)}</small></div>
          {!session.current && <button type="button" className="link-button danger" disabled={busy} onClick={() => revokeSession(session.id)}>Sign out</button>}
        </article>)}
        {!sessions.length && <div className="empty-state"><h3>No managed sessions yet</h3><p>Your next sign-in will create a managed session here.</p></div>}
      </div>
      <form className="phase42-revoke-all" onSubmit={revokeOthers}><label>Current password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Required to sign out other sessions" /></label><button className="button button-secondary" disabled={busy || !password}>Sign out other sessions</button></form>
    </section>

    <div className="phase42-security-grid">
      <section className="account-card">
        <div className="account-card-head"><div><p className="eyebrow">PRIVACY</p><h2>Download your data</h2></div></div>
        <p>Export the account data Riseora currently associates with your signed-in customer profile. Password hashes, internal support notes and payment secrets are never included.</p>
        <form className="phase42-export-form" onSubmit={exportData}><label>Current password<input type="password" required value={exportPassword} onChange={(e) => setExportPassword(e.target.value)} autoComplete="current-password" /></label><button className="button" disabled={busy || !exportPassword}><Icon name="share" size={17} /> Download JSON export</button></form>
      </section>
      <section className="account-card">
        <div className="account-card-head"><div><p className="eyebrow">PASSWORD</p><h2>Password security</h2></div></div>
        <p>Changing your password signs out other sessions and invalidates older login tokens automatically.</p>
        <Link className="button button-secondary" to="/account#security">Change password in My Account</Link>
        <button className="account-logout phase42-security-logout" type="button" onClick={logout}><Icon name="logout" size={18} /> Sign out this browser</button>
      </section>
    </div>

    <section className="account-card phase42-activity-card">
      <div className="account-card-head"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Security history</h2><p className="muted">Riseora stores privacy-preserving IP fingerprints rather than showing your raw network address here.</p></div></div>
      <div className="phase42-security-events">
        {events.map((event) => <article key={event.id}><span className={event.type.includes("FAILED") || event.type.includes("BLOCKED") ? "warn" : "ok"}><Icon name={event.type.includes("FAILED") || event.type.includes("BLOCKED") ? "alert" : "shield"} size={17} /></span><div><strong>{eventLabels[event.type] || event.type}</strong><small>{event.deviceLabel || "Browser"} · {niceDate(event.createdAt)}</small></div></article>)}
        {!events.length && <p className="muted">Security activity will appear here after your next sign-in.</p>}
      </div>
    </section>
  </div>;
}
