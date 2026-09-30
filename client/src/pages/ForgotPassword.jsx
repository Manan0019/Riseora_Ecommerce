import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import AuthBrand from "../components/AuthBrand";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setMessage(response.message);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return <div className="auth-wrap"><form className="auth-card" onSubmit={submit}><AuthBrand />
    <p className="eyebrow">ACCOUNT RECOVERY</p><h1>Forgot password?</h1>
    <p className="auth-copy">Enter the email used for your Riseora account. If it is registered, we’ll prepare a secure reset link.</p>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
    <button className="button wide" disabled={loading}>{loading ? "Preparing link…" : "Send reset link"}</button>
    <p><Link to="/login">Back to login</Link></p>
  </form></div>;
}
