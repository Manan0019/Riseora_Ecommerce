import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const user = await login(email, password);
      navigate(location.state?.from || (user.role === "ADMIN" ? "/admin" : "/"), { replace: true });
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  return <div className="auth-wrap"><form className="auth-card" onSubmit={submit}><p className="eyebrow">WELCOME BACK</p><h1>Login</h1>{error && <p className="alert error">{error}</p>}<label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label><button className="button wide" disabled={loading}>{loading ? "Signing in..." : "Login"}</button><p>New to Riseora? <Link to="/register">Create an account</Link></p></form></div>;
}
