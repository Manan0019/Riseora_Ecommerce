import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { backupDirectory, listDatabaseBackups, postgresBackupTools } from "./database-backup.service";

async function checkDatabase() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, latencyMs: Date.now() - started };
  }
}

async function checkWritableDirectory(directory: string) {
  try {
    await mkdir(directory, { recursive: true });
    await access(directory, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readinessStatus() {
  const database = await checkDatabase();
  return {
    ok: database.ok,
    database,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

export async function adminSystemHealth() {
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  const [database, uploadsWritable, backupsWritable, backupTool, backups] = await Promise.all([
    checkDatabase(),
    checkWritableDirectory(uploadsDir),
    checkWritableDirectory(backupDirectory()),
    postgresBackupTools(),
    listDatabaseBackups().catch(() => []),
  ]);

  const integrations = {
    razorpay: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET),
    cloudinary: Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET),
    email: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    publicSiteUrl: Boolean(env.PUBLIC_SITE_URL),
  };

  return {
    status: database.ok && uploadsWritable ? "healthy" : "degraded",
    environment: env.NODE_ENV,
    nodeVersion: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    database,
    storage: { uploadsWritable, backupsWritable },
    backup: {
      pgDumpAvailable: backupTool.ready,
      pgRestoreAvailable: Boolean(backupTool.restore.command),
      dumpPath: backupTool.dump.command,
      dumpVersion: backupTool.dump.version,
      restorePath: backupTool.restore.command,
      restoreVersion: backupTool.restore.version,
      setupHint: backupTool.hint,
      retentionCount: env.BACKUP_RETENTION_COUNT,
      count: backups.length,
      latest: backups[0] || null,
    },
    integrations,
    timestamp: new Date().toISOString(),
  };
}
