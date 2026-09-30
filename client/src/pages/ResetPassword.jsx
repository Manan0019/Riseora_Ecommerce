import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import AuthBrand from "../components/AuthBrand";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") || "", [params]);
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError("");
    if (!token) return setError("This reset link is missing its token.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      await apiFetch("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      navigate("/login", { replace: true, state: { passwordReset: true } });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return <div className="auth-wrap"><form className="auth-card" onSubmit={submit}><AuthBrand />
    <p className="eyebrow">SECURE ACCOUNT</p><h1>Set a new password</h1>
    {error && <p className="alert error">{error}</p>}
    <label>New password<input type="password" required minLength="8" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
    <label>Confirm password<input type="password" required minLength="8" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label>
    <button className="button wide" disabled={loading}>{loading ? "Updating…" : "Update password"}</button>
    <p><Link to="/login">Back to login</Link></p>
  </form></div>;
}
