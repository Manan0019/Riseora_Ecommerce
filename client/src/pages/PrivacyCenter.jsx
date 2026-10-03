import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import { analyticsConsent, setAnalyticsConsent } from "../analytics";
import { useAuth } from "../context/AuthContext";
import { Icon } from "../components/Icons";

const purposeLabels = {
  ANALYTICS: "Optional analytics",
  NEWSLETTER: "Riseora Notes newsletter",
  EMAIL_MARKETING: "Marketing email",
  SMS_MARKETING: "Marketing SMS",
  WHATSAPP_MARKETING: "Marketing WhatsApp",
};
const requestLabels = { ERASURE: "Account erasure", CORRECTION: "Data correction", OTHER: "Other privacy request" };

function niceDate(value) {
  return value ? new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function PrivacyCenter() {
  const { user } = useAuth();
  const [preference, setPreference] = useState({ emailMarketing: false, smsMarketing: false, whatsappMarketing: false });
  const [policyVersion, setPolicyVersion] = useState("");
  const [history, setHistory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [requestForm, setRequestForm] = useState({ type: "CORRECTION", message: "", currentPassword: "" });
  const [analytics, setAnalytics] = useState(() => analyticsConsent() || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [prefs, events, privacyRequests] = await Promise.all([
      apiFetch("/privacy/preferences"),
      apiFetch("/privacy/history"),
      apiFetch("/privacy/requests"),
    ]);
    setPreference({
      emailMarketing: Boolean(prefs.data?.preference?.emailMarketing),
      smsMarketing: Boolean(prefs.data?.preference?.smsMarketing),
      whatsappMarketing: Boolean(prefs.data?.preference?.whatsappMarketing),
    });
    setPolicyVersion(prefs.data?.policyVersion || "");
    setHistory(events.data || []);
    setRequests(privacyRequests.data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  async function savePreferences(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiFetch("/privacy/preferences", { method: "PATCH", body: JSON.stringify(preference) });
      setMessage(response.message || "Communication preferences updated.");
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function chooseAnalytics(choice) {
    setAnalyticsConsent(choice);
    setAnalytics(choice);
    setMessage(choice === "accepted" ? "Optional analytics enabled." : "Optional analytics disabled.");
    setError("");
    apiFetch("/privacy/analytics-consent", { method: "POST", body: JSON.stringify({ choice, source: "account-privacy-center" }) }).catch(() => {});
    await load().catch(() => {});
  }

  async function submitPrivacyRequest(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await apiFetch("/privacy/requests", { method: "POST", body: JSON.stringify(requestForm) });
      setMessage(response.message || "Privacy request received.");
      setRequestForm({ type: "CORRECTION", message: "", currentPassword: "" });
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function cancelRequest(id) {
    if (!window.confirm("Cancel this open privacy request?")) return;
    try { const response = await apiFetch(`/privacy/requests/${id}/cancel`, { method: "PATCH" }); setMessage(response.message); await load(); }
    catch (e) { setError(e.message); }
  }

  const activeRequests = useMemo(() => requests.filter((item) => ["OPEN", "IN_REVIEW"].includes(item.status)).length, [requests]);

  return <div className="container page-space phase46-privacy-page">
    <div className="phase46-privacy-hero">
      <div><p className="eyebrow">PRIVACY CENTER</p><h1>Your data. Your choices.</h1><p>Manage optional communications, analytics consent and privacy requests without affecting essential shopping, order or support messages.</p></div>
      <div className="phase46-policy-version"><Icon name="shield" size={22} /><span><small>Current privacy version</small><strong>{policyVersion || "Loading…"}</strong></span></div>
    </div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

    <div className="phase46-privacy-grid">
      <section className="account-card">
        <div className="account-card-head"><div><p className="eyebrow">COMMUNICATIONS</p><h2>Optional marketing</h2><p className="muted">Transactional emails for orders, payments, security, support, returns and reminders you explicitly request are separate from these marketing choices.</p></div></div>
        <form className="phase46-preference-list" onSubmit={savePreferences}>
          <label><span><strong>Email offers & launches</strong><small>Riseora Notes, product launches, offers and campaign stories.</small></span><input type="checkbox" checked={preference.emailMarketing} onChange={(e) => setPreference({ ...preference, emailMarketing: e.target.checked })} /></label>
          <label className={!user?.phone ? "disabled" : ""}><span><strong>SMS marketing</strong><small>{user?.phone ? `Optional promotions to ${user.phone}.` : "Add a phone number in My Account before enabling SMS marketing."}</small></span><input type="checkbox" disabled={!user?.phone} checked={preference.smsMarketing} onChange={(e) => setPreference({ ...preference, smsMarketing: e.target.checked })} /></label>
          <label className={!user?.phone ? "disabled" : ""}><span><strong>WhatsApp marketing</strong><small>{user?.phone ? "Optional promotional messages on your saved phone number." : "Add a phone number in My Account before enabling WhatsApp marketing."}</small></span><input type="checkbox" disabled={!user?.phone} checked={preference.whatsappMarketing} onChange={(e) => setPreference({ ...preference, whatsappMarketing: e.target.checked })} /></label>
          <button className="button" disabled={busy}>Save communication choices</button>
        </form>
      </section>

      <section className="account-card">
        <div className="account-card-head"><div><p className="eyebrow">ANALYTICS</p><h2>Storefront analytics</h2><p className="muted">Optional analytics is separate from essential cart, account, checkout and security storage.</p></div></div>
        <div className="phase46-analytics-choice"><button type="button" className={analytics === "essential" ? "active" : ""} onClick={() => chooseAnalytics("essential")}>Essential only</button><button type="button" className={analytics === "accepted" ? "active" : ""} onClick={() => chooseAnalytics("accepted")}>Allow analytics</button></div>
        {!analytics && <p className="muted">You have not saved an analytics choice in this browser yet.</p>}
        <Link className="text-link" to="/policies/privacy">Read privacy policy →</Link>
      </section>
    </div>

    <section className="account-card phase46-request-card">
      <div className="account-card-head"><div><p className="eyebrow">PRIVACY REQUESTS</p><h2>Ask Riseora to review your data</h2><p className="muted">For account erasure, Riseora disables optional marketing immediately, then the request is reviewed so order, invoice, fraud-prevention and other records that may need retention are handled safely.</p></div><span>{activeRequests} active</span></div>
      <form className="phase46-request-form" onSubmit={submitPrivacyRequest}>
        <label>Request type<select value={requestForm.type} onChange={(e) => setRequestForm({ ...requestForm, type: e.target.value, currentPassword: "" })}><option value="CORRECTION">Correct my data</option><option value="ERASURE">Request account erasure</option><option value="OTHER">Other privacy request</option></select></label>
        <label>Details<textarea required minLength="5" maxLength="2000" rows="4" value={requestForm.message} onChange={(e) => setRequestForm({ ...requestForm, message: e.target.value })} placeholder="Tell Riseora what you want changed or reviewed." /></label>
        {requestForm.type === "ERASURE" && <label>Current password<input type="password" required value={requestForm.currentPassword} onChange={(e) => setRequestForm({ ...requestForm, currentPassword: e.target.value })} autoComplete="current-password" /><small>Required before an account-erasure request can be opened.</small></label>}
        <div className="phase46-request-actions"><button className={requestForm.type === "ERASURE" ? "button danger" : "button"} disabled={busy}>Submit privacy request</button><Link className="button button-secondary" to="/security">Download my data</Link></div>
      </form>
      <div className="phase46-request-list">{requests.map((item) => <article key={item.id}><div><strong>{requestLabels[item.type] || item.type}</strong><small>{niceDate(item.requestedAt)}</small><p>{item.message}</p></div><div><span className={`phase46-request-status ${item.status.toLowerCase()}`}>{item.status.replaceAll("_", " ")}</span>{item.status === "OPEN" && <button className="link-button" type="button" onClick={() => cancelRequest(item.id)}>Cancel</button>}</div></article>)}{!requests.length && <p className="muted">No privacy requests yet.</p>}</div>
    </section>

    <section className="account-card phase46-history-card">
      <div className="account-card-head"><div><p className="eyebrow">CONSENT HISTORY</p><h2>Recent privacy choices</h2><p className="muted">Riseora records the purpose, decision, source and privacy-policy version—not your raw IP address.</p></div></div>
      <div className="phase46-consent-history">{history.map((item) => <article key={item.id}><span className={item.decision === "GRANTED" ? "granted" : "withdrawn"}><Icon name={item.decision === "GRANTED" ? "shield" : "close"} size={15} /></span><div><strong>{purposeLabels[item.purpose] || item.purpose}</strong><small>{item.decision} · {item.source} · policy {item.policyVersion}</small></div><time>{niceDate(item.createdAt)}</time></article>)}{!history.length && <p className="muted">New privacy choices will appear here.</p>}</div>
    </section>
  </div>;
}
