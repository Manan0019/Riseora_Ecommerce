const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "/api" : "http://localhost:5000/api");
const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");
const DEFAULT_TIMEOUT_MS = 20000;
const inFlightGets = new Map();
const responseCache = new Map();

function authCacheKey(token, path) {
  return `${token || "anon"}|${path}`;
}

function canDedupe(options) {
  const method = String(options.method || "GET").toUpperCase();
  return method === "GET" && !options.body && !options.signal && !options.headers && options.dedupe !== false;
}

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

export function reportClientError({ message, route, source, referenceId } = {}) {
  const payload = JSON.stringify({
    message: String(message || "Client error").slice(0, 500),
    route: String(route || window.location.pathname).split("?")[0].slice(0, 300),
    source: String(source || "client").slice(0, 80),
    referenceId: String(referenceId || "").slice(0, 80) || undefined,
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${API_URL}/client-errors`, new Blob([payload], { type: "application/json" }));
      return;
    }
    fetch(`${API_URL}/client-errors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
  } catch {}
}

export function reportClientPerformance(sample = {}) {
  const payload = JSON.stringify({
    route: String(sample.route || window.location.pathname).split("?")[0].slice(0, 300),
    lcpMs: Number(sample.lcpMs || 0),
    cls: Number(sample.cls || 0),
    interactionMs: Number(sample.interactionMs || 0),
    domContentLoadedMs: Number(sample.domContentLoadedMs || 0),
    loadMs: Number(sample.loadMs || 0),
    longTaskCount: Number(sample.longTaskCount || 0),
    longTaskTotalMs: Number(sample.longTaskTotalMs || 0),
    resourceCount: Number(sample.resourceCount || 0),
    connectionType: sample.connectionType ? String(sample.connectionType).slice(0, 20) : undefined,
    saveData: Boolean(sample.saveData),
    reason: sample.reason ? String(sample.reason).slice(0, 20) : undefined,
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${API_URL}/client-performance`, new Blob([payload], { type: "application/json" }));
      return;
    }
    fetch(`${API_URL}/client-performance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
  } catch {}
}

async function performApiFetch(path, options, token) {
  const { dedupe: _dedupe, ttlMs: _ttlMs, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});
  const timeoutMs = Number(fetchOptions.timeoutMs || (fetchOptions.body instanceof FormData ? 60000 : DEFAULT_TIMEOUT_MS));
  delete fetchOptions.timeoutMs;
  const controller = fetchOptions.signal ? null : new AbortController();
  const signal = fetchOptions.signal || controller?.signal;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    const response = await fetch(`${API_URL}${path}`, { ...fetchOptions, headers, signal });
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

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("riseora_token");
  if (!canDedupe(options)) return performApiFetch(path, options, token);

  const key = authCacheKey(token, path);
  const existing = inFlightGets.get(key);
  if (existing) return existing;

  const request = performApiFetch(path, options, token).finally(() => inFlightGets.delete(key));
  inFlightGets.set(key, request);
  return request;
}

export async function apiFetchCached(path, options = {}) {
  const token = localStorage.getItem("riseora_token");
  const ttlMs = Math.max(0, Number(options.ttlMs ?? 15000));
  const key = authCacheKey(token, path);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  const payload = await apiFetch(path, { ...options, method: options.method || "GET" });
  responseCache.set(key, { payload, expiresAt: Date.now() + ttlMs });
  return payload;
}

export function invalidateApiCache(pathPrefix = "") {
  for (const key of responseCache.keys()) {
    const separator = key.indexOf("|");
    const path = separator >= 0 ? key.slice(separator + 1) : key;
    if (!pathPrefix || path.startsWith(pathPrefix)) responseCache.delete(key);
  }
}
