import { reportClientPerformance } from "../api/http";

let started = false;
let sent = false;
let latestLcp = 0;
let cls = 0;
let longestInteraction = 0;
let longTaskCount = 0;
let longTaskTotalMs = 0;
const observers = [];

function observe(type, handler, options = {}) {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver((list) => handler(list.getEntries()));
    observer.observe({ type, buffered: true, ...options });
    observers.push(observer);
  } catch {}
}

function connectionSnapshot() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    connectionType: String(connection?.effectiveType || "").slice(0, 20) || undefined,
    saveData: Boolean(connection?.saveData),
  };
}

function navigationSnapshot() {
  const navigation = performance.getEntriesByType?.("navigation")?.[0];
  if (!navigation) return {};
  return {
    domContentLoadedMs: Math.max(0, Math.round(navigation.domContentLoadedEventEnd || 0)),
    loadMs: Math.max(0, Math.round(navigation.loadEventEnd || 0)),
  };
}

function send(reason = "timer") {
  if (sent || typeof window === "undefined") return;
  sent = true;
  observers.forEach((observer) => observer.disconnect());
  reportClientPerformance({
    route: window.location.pathname,
    lcpMs: Math.round(latestLcp || 0),
    cls: Number(cls.toFixed(4)),
    interactionMs: Math.round(longestInteraction || 0),
    longTaskCount,
    longTaskTotalMs: Math.round(longTaskTotalMs),
    resourceCount: performance.getEntriesByType?.("resource")?.length || 0,
    reason,
    ...navigationSnapshot(),
    ...connectionSnapshot(),
  });
}

export function startBrowserPerformanceTelemetry() {
  if (started || typeof window === "undefined" || typeof performance === "undefined") return () => {};
  started = true;
  sent = false;
  latestLcp = 0;
  cls = 0;
  longestInteraction = 0;
  longTaskCount = 0;
  longTaskTotalMs = 0;
  observers.splice(0).forEach((observer) => observer.disconnect());

  observe("largest-contentful-paint", (entries) => {
    const last = entries.at(-1);
    if (last) latestLcp = Math.max(latestLcp, Number(last.startTime || 0));
  });
  observe("layout-shift", (entries) => {
    for (const entry of entries) if (!entry.hadRecentInput) cls += Number(entry.value || 0);
  });
  observe("longtask", (entries) => {
    for (const entry of entries) {
      longTaskCount += 1;
      longTaskTotalMs += Number(entry.duration || 0);
    }
  });
  observe("event", (entries) => {
    for (const entry of entries) longestInteraction = Math.max(longestInteraction, Number(entry.duration || 0));
  }, { durationThreshold: 40 });

  const timer = window.setTimeout(() => send("timer"), 8000);
  const onHidden = () => { if (document.visibilityState === "hidden") send("hidden"); };
  const onPageHide = () => send("pagehide");
  document.addEventListener("visibilitychange", onHidden, { once: true });
  window.addEventListener("pagehide", onPageHide, { once: true });

  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("pagehide", onPageHide);
    observers.splice(0).forEach((observer) => observer.disconnect());
    started = false;
  };
}
