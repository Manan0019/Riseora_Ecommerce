import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { adminSystemHealth, readinessStatus } from "../services/system-health.service";
import { createDatabaseBackup, listDatabaseBackups } from "../services/database-backup.service";
import { recordClientError } from "../services/runtime-observability.service";
import { launchReadinessSnapshot } from "../services/launch-readiness.service";
import { runBackgroundJob } from "../services/background-jobs.service";
import { SYSTEM_JOB_KEYS } from "../services/system-job.service";
import { releaseMetadata } from "../services/production-readiness.service";
import { EXPECTED_MIGRATION_HEAD } from "../services/database-readiness.service";

export const publicSystemRoutes = Router();

publicSystemRoutes.post(
  "/client-errors",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }),
  (req, res) => {
    const parsed = z.object({
      message: z.string().trim().min(1).max(500),
      route: z.string().trim().max(300).optional(),
      source: z.string().trim().max(80).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid client error report" });
    recordClientError(parsed.data);
    return res.status(202).json({ success: true });
  },
);

publicSystemRoutes.get("/health/live", (_req, res) => {
  res.json({ success: true, status: "live", uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

publicSystemRoutes.get("/release", (_req, res) => {
  res.json({
    success: true,
    data: { ...releaseMetadata(), databaseMigrationHead: EXPECTED_MIGRATION_HEAD },
  });
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
  "/system/launch-readiness",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await launchReadinessSnapshot() });
  }),
);

router.post(
  "/system/jobs/:key/run",
  rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false }),
  asyncHandler(async (req, res) => {
    const parsed = z.enum(SYSTEM_JOB_KEYS).safeParse(String(req.params.key || ""));
    if (!parsed.success) return res.status(400).json({ success: false, message: "Unknown background job" });
    const result = await runBackgroundJob(parsed.data);
    res.json({ success: true, data: result, message: result.ran ? "Background job completed" : "Background job is already running" });
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
