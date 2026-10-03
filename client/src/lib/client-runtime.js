import { readPersistedArray } from "./persisted-state.js";

const LOCAL_ARRAY_STATE = [
  ["riseora_cart", 250],
  ["riseora_wishlist", 250],
  ["riseora_compare_products", 10],
  ["riseora_recent_searches", 20],
  ["riseora_recent_products", 20],
];
const SESSION_ARRAY_STATE = [["riseora_buy_now", 20]];
const TRANSIENT_KEYS = ["riseora_compare_products", "riseora_recent_searches", "riseora_recent_products"];

export function createClientErrorReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  let random = Math.random().toString(36).slice(2, 7).toUpperCase();
  try {
    const bytes = new Uint8Array(3);
    crypto.getRandomValues(bytes);
    random = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
  } catch {}
  return `R52-${stamp}-${random}`;
}

export function prepareClientRuntime() {
  const repaired = [];
  if (typeof window === "undefined") return { repaired };

  for (const [key, maxItems] of LOCAL_ARRAY_STATE) {
    let before = null;
    try { before = window.localStorage.getItem(key); } catch {}
    readPersistedArray(window.localStorage, key, { maxItems });
    let after = null;
    try { after = window.localStorage.getItem(key); } catch {}
    if (before != null && after == null) repaired.push({ storage: "local", key });
  }

  for (const [key, maxItems] of SESSION_ARRAY_STATE) {
    let before = null;
    try { before = window.sessionStorage.getItem(key); } catch {}
    readPersistedArray(window.sessionStorage, key, { maxItems });
    let after = null;
    try { after = window.sessionStorage.getItem(key); } catch {}
    if (before != null && after == null) repaired.push({ storage: "session", key });
  }

  if (repaired.length) {
    try { window.sessionStorage.setItem("riseora_runtime_repair", JSON.stringify({ at: new Date().toISOString(), repaired })); } catch {}
  }
  return { repaired };
}

export function repairTransientClientState() {
  if (typeof window === "undefined") return;
  for (const key of TRANSIENT_KEYS) {
    try { window.localStorage.removeItem(key); } catch {}
  }
  try { window.sessionStorage.removeItem("riseora_buy_now"); } catch {}
}

export async function cleanupDevelopmentServiceWorkers() {
  if (typeof window === "undefined" || !import.meta.env.DEV) return false;
  try {
    const hadController = Boolean(navigator.serviceWorker?.controller);
    let registrationCount = 0;
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      registrationCount = registrations.length;
      await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
    }
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => /riseora|vite|workbox/i.test(name)).map((name) => caches.delete(name)));
    }

    const resetKey = "riseora_dev_service_worker_reset";
    if (hadController && registrationCount > 0 && window.sessionStorage.getItem(resetKey) !== "1") {
      window.sessionStorage.setItem(resetKey, "1");
      window.location.reload();
      return true;
    }
    if (!hadController) window.sessionStorage.removeItem(resetKey);
  } catch {
    // Dev cache cleanup is best effort and must never block the storefront.
  }
  return false;
}
