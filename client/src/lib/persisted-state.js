const QUARANTINE_PREFIX = "riseora_state_quarantine:";

function storageName(storage) {
  try {
    if (typeof window !== "undefined") {
      if (storage === window.sessionStorage) return "session";
      if (storage === window.localStorage) return "local";
    }
  } catch {}
  return "storage";
}

function quarantine(storage, key, raw, reason) {
  try {
    const payload = JSON.stringify({
      key,
      storage: storageName(storage),
      reason: String(reason || "invalid persisted state").slice(0, 160),
      quarantinedAt: new Date().toISOString(),
      raw: String(raw || "").slice(0, 50000),
    });
    storage.setItem(`${QUARANTINE_PREFIX}${key}`, payload);
    storage.removeItem(key);
  } catch {
    try { storage.removeItem(key); } catch {}
  }
}

export function readPersistedArray(storage, key, { maxItems = 500, itemGuard = null } = {}) {
  if (!storage) return [];
  let raw = null;
  try { raw = storage.getItem(key); } catch { return []; }
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    quarantine(storage, key, raw, "invalid JSON");
    return [];
  }

  if (!Array.isArray(parsed)) {
    quarantine(storage, key, raw, "expected an array");
    return [];
  }

  const limited = parsed.slice(0, Math.max(1, Number(maxItems) || 500));
  if (typeof itemGuard !== "function") return limited;

  const accepted = limited.filter((item) => {
    try { return Boolean(itemGuard(item)); } catch { return false; }
  });

  if (accepted.length !== limited.length) {
    try { storage.setItem(key, JSON.stringify(accepted)); } catch {}
  }
  return accepted;
}

export function writePersistedArray(storage, key, value, { maxItems = 500 } = {}) {
  const safe = Array.isArray(value) ? value.slice(0, Math.max(1, Number(maxItems) || 500)) : [];
  try { storage?.setItem(key, JSON.stringify(safe)); } catch {}
  return safe;
}

export function quarantineKey(storage, key, reason = "manual runtime repair") {
  if (!storage) return false;
  try {
    const raw = storage.getItem(key);
    if (raw == null) return false;
    quarantine(storage, key, raw, reason);
    return true;
  } catch {
    return false;
  }
}

export function quarantinePrefix() {
  return QUARANTINE_PREFIX;
}
