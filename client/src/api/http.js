const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");
const DEFAULT_TIMEOUT_MS = 20000;

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, requestId = null, payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.payload = payload;
  }
}

export function mediaUrl(url) {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith("/uploads/")) return `${API_ORIGIN}${url}`;
  return url;
}

export function reportClientError({ message, route, source } = {}) {
  const payload = JSON.stringify({
    message: String(message || "Client error").slice(0, 500),
    route: String(route || window.location.pathname).split("?")[0].slice(0, 300),
    source: String(source || "client").slice(0, 80),
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${API_URL}/client-errors`, new Blob([payload], { type: "application/json" }));
      return;
    }
    fetch(`${API_URL}/client-errors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
  } catch {}
}

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("riseora_token");
  const headers = new Headers(options.headers || {});
  const timeoutMs = Number(options.timeoutMs || (options.body instanceof FormData ? 60000 : DEFAULT_TIMEOUT_MS));
  const controller = options.signal ? null : new AbortController();
  const signal = options.signal || controller?.signal;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    const response = await fetch(`${API_URL}${path}`, { ...options, headers, signal });
    const payload = await response.json().catch(() => ({}));
    const requestId = response.headers.get("x-request-id") || payload.requestId || null;

    if (!response.ok) {
      if (response.status === 401 && token) {
        localStorage.removeItem("riseora_token");
        window.dispatchEvent(new Event("riseora-auth-expired"));
      }
      throw new ApiError(payload.message || `Request failed with HTTP ${response.status}`, {
        status: response.status,
        code: payload.code || null,
        requestId,
        payload,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === "AbortError") throw new ApiError("The request took too long. Please try again.", { code: "REQUEST_TIMEOUT" });
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new ApiError("You're offline. Reconnect to the internet and try again.", { code: "OFFLINE" });
    throw new ApiError(error?.message || "Unable to reach Riseora right now. Please try again.", { code: "NETWORK_ERROR" });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
