import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { beginObservedRequest, logRuntimeEvent, normalizeObservedPath, recordObservedRequest } from "../services/runtime-observability.service";

function requestIdFromHeader(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9._:-]{8,96}$/.test(text) ? text : randomUUID();
}

export function requestObservability(req: Request, res: Response, next: NextFunction) {
  const started = performance.now();
  const requestId = requestIdFromHeader(req.header("x-request-id"));
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  beginObservedRequest();

  let finalized = false;
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    const durationMs = Math.max(0, Math.round((performance.now() - started) * 10) / 10);
    const path = normalizeObservedPath(req.originalUrl || req.url);
    recordObservedRequest({ method: req.method, path, statusCode: res.statusCode, durationMs, requestId });

    const level = res.statusCode >= 500 ? "error" : durationMs >= env.SLOW_REQUEST_MS ? "warn" : "info";
    if (env.NODE_ENV === "production") {
      logRuntimeEvent(level, "http_request", { requestId, method: req.method, path, statusCode: res.statusCode, durationMs });
    } else {
      const colorless = `${req.method} ${path} ${res.statusCode} ${durationMs}ms ${requestId.slice(0, 8)}`;
      if (level === "error") console.error(colorless);
      else if (level === "warn") console.warn(colorless);
      else console.log(colorless);
    }
  };
  res.once("finish", finalize);
  res.once("close", finalize);

  next();
}
