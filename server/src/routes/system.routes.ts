import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { adminSystemHealth, readinessStatus } from "../services/system-health.service";
import { createDatabaseBackup, listDatabaseBackups } from "../services/database-backup.service";

export const publicSystemRoutes = Router();

publicSystemRoutes.get("/health/live", (_req, res) => {
  res.json({ success: true, status: "live", uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

publicSystemRoutes.get(
  "/health/ready",
  asyncHandler(async (_req, res) => {
    const status = await readinessStatus();
    res.status(status.ok ? 200 : 503).json({ success: status.ok, status: status.ok ? "ready" : "not-ready", ...status });
  }),
);

// Backwards-compatible health endpoint used by existing deployment checks.
publicSystemRoutes.get(
  "/health",
  asyncHandler(async (_req, res) => {
    const status = await readinessStatus();
    res.status(status.ok ? 200 : 503).json({ success: status.ok, message: status.ok ? "Riseora E-Commerce API is running" : "Database connection failed", database: status.database.ok ? "connected" : "disconnected", uptimeSeconds: status.uptimeSeconds });
  }),
);

const router = Router();
router.use(requireAuth, requireAdmin);

router.get(
  "/system/health",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await adminSystemHealth() });
  }),
);

router.get(
  "/system/backups",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await listDatabaseBackups() });
  }),
);

router.post(
  "/system/backups",
  rateLimit({ windowMs: 60 * 60 * 1000, limit: 6, standardHeaders: "draft-8", legacyHeaders: false }),
  asyncHandler(async (_req, res) => {
    const backup = await createDatabaseBackup();
    res.status(201).json({ success: true, data: backup, message: "Database backup created" });
  }),
);

export default router;
