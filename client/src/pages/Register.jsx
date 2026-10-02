import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthBrand from "../components/AuthBrand";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", referralCode: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { const ref = String(searchParams.get("ref") || "").trim().toUpperCase(); if (ref) setForm((current) => ({ ...current, referralCode: ref })); }, [searchParams]);
  function update(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.name === "referralCode" ? event.target.value.toUpperCase() : event.target.value })); }
  async function submit(event) {
    event.preventDefault(); setLoading(true); setError("");
    try { await register(form); navigate(form.referralCode ? "/rewards" : "/"); } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  return <div className="auth-wrap"><form className="auth-card phase36-register-card" onSubmit={submit}><AuthBrand /><p className="eyebrow">JOIN RISEORA</p><h1>Create account</h1>{error && <p className="alert error">{error}</p>}<div className="form-grid two"><label>First name<input required name="firstName" value={form.firstName} onChange={update} /></label><label>Last name<input name="lastName" value={form.lastName} onChange={update} /></label></div><label>Email<input type="email" required name="email" value={form.email} onChange={update} /></label><label>Phone<input name="phone" value={form.phone} onChange={update} /></label><label>Password<input type="password" required minLength="8" name="password" value={form.password} onChange={update} /></label><label>Referral code <span className="muted">(optional)</span><input name="referralCode" value={form.referralCode} onChange={update} placeholder="RISE-XXXXXXXX" autoComplete="off" /><small>Referral rewards unlock after your first delivered order.</small></label><button className="button wide" disabled={loading}>{loading ? "Creating..." : "Create account"}</button><p>Already registered? <Link to="/login">Login</Link></p></form></div>;
}
