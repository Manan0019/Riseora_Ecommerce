import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  async function submit(event) {
    event.preventDefault(); setLoading(true); setError("");
    try { await register(form); navigate("/"); } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  return <div className="auth-wrap"><form className="auth-card" onSubmit={submit}><p className="eyebrow">JOIN RISEORA</p><h1>Create account</h1>{error && <p className="alert error">{error}</p>}<div className="form-grid two"><label>First name<input required name="firstName" value={form.firstName} onChange={update} /></label><label>Last name<input name="lastName" value={form.lastName} onChange={update} /></label></div><label>Email<input type="email" required name="email" value={form.email} onChange={update} /></label><label>Phone<input name="phone" value={form.phone} onChange={update} /></label><label>Password<input type="password" required minLength="8" name="password" value={form.password} onChange={update} /></label><button className="button wide" disabled={loading}>{loading ? "Creating..." : "Create account"}</button><p>Already registered? <Link to="/login">Login</Link></p></form></div>;
}
