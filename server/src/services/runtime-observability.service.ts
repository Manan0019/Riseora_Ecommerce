import { env } from "../config/env";

type RequestSample = {
  at: number;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  requestId: string;
};

type ClientErrorSample = {
  at: number;
  message: string;
  route: string;
  source: string;
  referenceId: string | null;
};

type ClientPerformanceSample = {
  at: number;
  route: string;
  lcpMs: number;
  cls: number;
  interactionMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  resourceCount: number;
  connectionType: string | null;
  saveData: boolean;
  reason: string | null;
};

const samples: RequestSample[] = [];
const clientErrors: ClientErrorSample[] = [];
const clientPerformance: ClientPerformanceSample[] = [];
const MAX_CLIENT_ERRORS = 100;
const MAX_CLIENT_PERFORMANCE = 300;
const MAX_SAMPLES = 2000;
const WINDOW_MS = 15 * 60 * 1000;
let activeRequests = 0;
let draining = false;
let eventLoopLagMs = 0;
let eventLoopExpectedAt = Date.now() + 1000;

const eventLoopTimer = setInterval(() => {
  const now = Date.now();
  eventLoopLagMs = Math.max(0, now - eventLoopExpectedAt);
  eventLoopExpectedAt = now + 1000;
}, 1000);
eventLoopTimer.unref();

export function normalizeObservedPath(value: string) {
  return String(value || "/")
    .split("?")[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/[0-9]{2,}(?=\/|$)/g, "/:id")
    .slice(0, 240);
}

export function beginObservedRequest() {
  activeRequests += 1;
}

export function recordObservedRequest(sample: Omit<RequestSample, "at">) {
  activeRequests = Math.max(0, activeRequests - 1);
  samples.push({ ...sample, at: Date.now() });
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
}

export function setRuntimeDraining(value: boolean) {
  draining = value;
}

function sanitizeClientErrorMessage(value: string) {
  return String(value || "Client error")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, ":id")
    .slice(0, 500);
}

export function recordClientError(input: { message: string; route?: string; source?: string; referenceId?: string }) {
  const sample: ClientErrorSample = {
    at: Date.now(),
    message: sanitizeClientErrorMessage(input.message),
    route: String(input.route || "/").split("?")[0].slice(0, 240),
    source: String(input.source || "client").slice(0, 80),
    referenceId: String(input.referenceId || "").slice(0, 80) || null,
  };
  clientErrors.push(sample);
  if (clientErrors.length > MAX_CLIENT_ERRORS) clientErrors.splice(0, clientErrors.length - MAX_CLIENT_ERRORS);
  logRuntimeEvent("warn", "client_error_reported", {
    referenceId: sample.referenceId,
    route: sample.route,
    source: sample.source,
    message: sample.message,
  });
}

function boundedMetric(value: unknown, max: number, decimals = 0) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  const bounded = Math.max(0, Math.min(max, number));
  const factor = 10 ** decimals;
  return Math.round(bounded * factor) / factor;
}

export function recordClientPerformance(input: {
  route?: string;
  lcpMs?: number;
  cls?: number;
  interactionMs?: number;
  domContentLoadedMs?: number;
  loadMs?: number;
  longTaskCount?: number;
  longTaskTotalMs?: number;
  resourceCount?: number;
  connectionType?: string;
  saveData?: boolean;
  reason?: string;
}) {
  const sample: ClientPerformanceSample = {
    at: Date.now(),
    route: String(input.route || "/").split("?")[0].slice(0, 240),
    lcpMs: boundedMetric(input.lcpMs, 120000),
    cls: boundedMetric(input.cls, 10, 4),
    interactionMs: boundedMetric(input.interactionMs, 120000),
    domContentLoadedMs: boundedMetric(input.domContentLoadedMs, 120000),
    loadMs: boundedMetric(input.loadMs, 120000),
    longTaskCount: Math.round(boundedMetric(input.longTaskCount, 10000)),
    longTaskTotalMs: boundedMetric(input.longTaskTotalMs, 600000),
    resourceCount: Math.round(boundedMetric(input.resourceCount, 10000)),
    connectionType: String(input.connectionType || "").slice(0, 20) || null,
    saveData: Boolean(input.saveData),
    reason: String(input.reason || "").slice(0, 20) || null,
  };
  clientPerformance.push(sample);
  if (clientPerformance.length > MAX_CLIENT_PERFORMANCE) clientPerformance.splice(0, clientPerformance.length - MAX_CLIENT_PERFORMANCE);
}

export function isRuntimeDraining() {
  return draining;
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[index]);
}

function percentileDecimal(values: number[], p: number, decimals = 2) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(decimals));
}

export function runtimeObservabilitySnapshot() {
  const cutoff = Date.now() - WINDOW_MS;
  while (samples.length && samples[0].at < cutoff) samples.shift();

  const recent = samples.filter((sample) => sample.at >= cutoff);
  const durations = recent.map((sample) => sample.durationMs);
  const error5xx = recent.filter((sample) => sample.statusCode >= 500).length;
  const error4xx = recent.filter((sample) => sample.statusCode >= 400 && sample.statusCode < 500).length;
  const slow = recent.filter((sample) => sample.durationMs >= env.SLOW_REQUEST_MS);
  const routeMap = new Map<string, { requests: number; errors: number; durations: number[] }>();

  for (const sample of recent) {
    const key = `${sample.method} ${sample.path}`;
    const current = routeMap.get(key) || { requests: 0, errors: 0, durations: [] };
    current.requests += 1;
    if (sample.statusCode >= 500) current.errors += 1;
    current.durations.push(sample.durationMs);
    routeMap.set(key, current);
  }

  const routes = [...routeMap.entries()]
    .map(([route, value]) => ({
      route,
      requests: value.requests,
      errors: value.errors,
      p95Ms: percentile(value.durations, 95),
      maxMs: Math.max(0, ...value.durations),
    }))
    .sort((a, b) => b.p95Ms - a.p95Ms || b.requests - a.requests)
    .slice(0, 8);

  const clientCutoff = Date.now() - WINDOW_MS;
  while (clientErrors.length && clientErrors[0].at < clientCutoff) clientErrors.shift();
  const recentClientErrors = clientErrors.filter((item) => item.at >= clientCutoff);
  while (clientPerformance.length && clientPerformance[0].at < clientCutoff) clientPerformance.shift();
  const recentClientPerformance = clientPerformance.filter((item) => item.at >= clientCutoff);
  const perfRouteMap = new Map<string, ClientPerformanceSample[]>();
  for (const item of recentClientPerformance) {
    const rows = perfRouteMap.get(item.route) || [];
    rows.push(item);
    perfRouteMap.set(item.route, rows);
  }
  const webExperience = {
    sampleCount: recentClientPerformance.length,
    lcpP75Ms: percentile(recentClientPerformance.map((item) => item.lcpMs).filter((value) => value > 0), 75),
    clsP75: percentileDecimal(recentClientPerformance.map((item) => item.cls), 75, 3),
    interactionP75Ms: percentile(recentClientPerformance.map((item) => item.interactionMs).filter((value) => value > 0), 75),
    loadP75Ms: percentile(recentClientPerformance.map((item) => item.loadMs).filter((value) => value > 0), 75),
    longTaskP75Ms: percentile(recentClientPerformance.map((item) => item.longTaskTotalMs), 75),
    saveDataSamples: recentClientPerformance.filter((item) => item.saveData).length,
    routes: [...perfRouteMap.entries()].map(([route, rows]) => ({
      route,
      samples: rows.length,
      lcpP75Ms: percentile(rows.map((item) => item.lcpMs).filter((value) => value > 0), 75),
      clsP75: percentileDecimal(rows.map((item) => item.cls), 75, 3),
      loadP75Ms: percentile(rows.map((item) => item.loadMs).filter((value) => value > 0), 75),
    })).sort((a, b) => b.lcpP75Ms - a.lcpP75Ms || b.loadP75Ms - a.loadP75Ms).slice(0, 6),
  };
  const memory = process.memoryUsage();
  return {
    windowMinutes: WINDOW_MS / 60000,
    activeRequests,
    draining,
    requestCount: recent.length,
    error5xx,
    error4xx,
    errorRatePercent: recent.length ? Number(((error5xx / recent.length) * 100).toFixed(2)) : 0,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    maxMs: durations.length ? Math.max(...durations) : 0,
    slowThresholdMs: env.SLOW_REQUEST_MS,
    slowRequestCount: slow.length,
    clientErrorCount: recentClientErrors.length,
    recentClientErrors: recentClientErrors.slice(-8).reverse().map((item) => ({ ...item, at: new Date(item.at).toISOString() })),
    webExperience,
    eventLoopLagMs: Math.round(eventLoopLagMs),
    memory: {
      rssMb: Number((memory.rss / 1024 / 1024).toFixed(1)),
      heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(1)),
      heapTotalMb: Number((memory.heapTotal / 1024 / 1024).toFixed(1)),
    },
    routes,
  };
}

export function logRuntimeEvent(level: "info" | "warn" | "error", event: string, data: Record<string, unknown> = {}) {
  if (env.NODE_ENV === "production") {
    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...data,
    });
    if (level === "error") console.error(payload);
    else if (level === "warn") console.warn(payload);
    else console.log(payload);
    return;
  }

  const prefix = `[${level.toUpperCase()}] ${event}`;
  if (level === "error") console.error(prefix, data);
  else if (level === "warn") console.warn(prefix, data);
  else console.log(prefix, data);
}
