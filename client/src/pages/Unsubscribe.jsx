import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import Seo from "../components/Seo";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = String(params.get("token") || "");
  const [state, setState] = useState({ loading: Boolean(token), error: "", message: "" });
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/privacy/newsletter/unsubscribe", { method: "POST", body: JSON.stringify({ token }) })
      .then((response) => setState({ loading: false, error: "", message: response.message || "Your marketing email preference has been updated." }))
      .catch((error) => setState({ loading: false, error: error.message, message: "" }));
  }, [token]);

  async function sendManageLink(event) {
    event.preventDefault(); setSending(true); setState({ loading: false, error: "", message: "" });
    try { const response = await apiFetch("/privacy/newsletter/manage-link", { method: "POST", body: JSON.stringify({ email }) }); setState({ loading: false, error: "", message: response.message }); setEmail(""); }
    catch (error) { setState({ loading: false, error: error.message, message: "" }); }
    finally { setSending(false); }
  }

  return <><Seo title="Email preferences" noindex /><div className="container page-space phase46-unsubscribe"><p className="eyebrow">RISEORA PRIVACY</p><h1>Email preferences</h1>{state.loading && <p>Updating your preference…</p>}{state.message && <p className="alert success">{state.message}</p>}{state.error && <p className="alert error">{state.error}</p>}
    {!token && <form className="phase46-unsubscribe-form" onSubmit={sendManageLink}><p>Enter the email address you used for Riseora Notes. If it is subscribed, Riseora will email a secure unsubscribe link.</p><label>Email address<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label><button className="button" disabled={sending}>{sending ? "Sending…" : "Send preference link"}</button></form>}
    <div className="phase46-unsubscribe-actions"><Link className="button button-secondary" to="/">Return to Riseora</Link><Link className="button button-secondary" to="/policies/privacy">Privacy policy</Link></div></div></>;
}
