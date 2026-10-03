import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/http";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const expire = () => setUser(null);
    window.addEventListener("riseora-auth-expired", expire);

    const token = localStorage.getItem("riseora_token");
    if (!token) {
      setLoading(false);
      return () => window.removeEventListener("riseora-auth-expired", expire);
    }

    apiFetch("/auth/me")
      .then((response) => setUser(response.data))
      .catch(() => localStorage.removeItem("riseora_token"))
      .finally(() => setLoading(false));

    return () => window.removeEventListener("riseora-auth-expired", expire);
  }, []);

  async function login(email, password) {
    const response = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem("riseora_token", response.data.token);
    setUser(response.data.user);
    return response.data.user;
  }

  async function register(values) {
    const response = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify(values),
    });
    localStorage.setItem("riseora_token", response.data.token);
    setUser(response.data.user);
    return response.data.user;
  }

  function updateUser(nextUser) {
    setUser((current) => ({ ...(current || {}), ...nextUser }));
  }

  function replaceToken(token) {
    localStorage.setItem("riseora_token", token);
  }

  function logout() {
    const request = apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("riseora_token");
    setUser(null);
    return request;
  }

  const value = useMemo(() => ({ user, loading, login, register, updateUser, replaceToken, logout }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
