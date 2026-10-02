import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { adminHasPermission, normalizedAdminRole, permissionForAdminPath } from "../security/admin-permissions";

function normalizeActionPath(originalUrl: string) {
  return String(originalUrl || "")
    .split("?")[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ":id")
    .slice(0, 300);
}

export function enforceAdminPermission(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "ADMIN") return res.status(403).json({ success: false, message: "Admin access required" });
  const required = permissionForAdminPath(req.originalUrl);
  const role = normalizedAdminRole(req.user.adminRole);
  if (!adminHasPermission(role, required)) {
    return res.status(403).json({ success: false, message: `Your admin role does not allow ${required.toLowerCase()} access.` });
  }
  if (role === "SUPPORT" && ["OPERATIONS", "CUSTOMERS"].includes(required) && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase())) {
    return res.status(403).json({ success: false, message: "Support access is read-only for orders, returns and customer records." });
  }
  next();
}

export function adminAuditTrail(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method) || !req.user || req.user.role !== "ADMIN") return next();
  const started = Date.now();
  const actorUserId = req.user.id;
  const path = normalizeActionPath(req.originalUrl);
  const action = `${method} ${path}`.slice(0, 350);
  res.on("finish", () => {
    prisma.adminAuditLog.create({
      data: {
        actorUserId,
        method,
        path,
        action,
        statusCode: res.statusCode,
        durationMs: Math.max(0, Date.now() - started),
        userAgent: String(req.get("user-agent") || "").slice(0, 500) || null,
        metadata: { success: res.statusCode < 400 },
      },
    }).catch((error: unknown) => console.error("Admin audit log write failed", error));
  });
  next();
}
