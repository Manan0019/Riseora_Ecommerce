import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "../config/env";

const execFileAsync = promisify(execFile);
const BACKUP_PATTERN = /^riseora-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.dump$/;

export function backupDirectory() {
  return path.resolve(process.cwd(), env.BACKUP_DIR || "backups");
}

function decode(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function postgresEnv() {
  const url = new URL(env.DATABASE_URL);
  if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("DATABASE_URL must use PostgreSQL");
  const database = decode(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL is missing the database name");
  const sslMode = url.searchParams.get("sslmode");
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decode(url.username),
    PGPASSWORD: decode(url.password),
    PGDATABASE: database,
    ...(sslMode ? { PGSSLMODE: sslMode } : {}),
  };
}

export async function pgDumpAvailable() {
  try {
    await execFileAsync("pg_dump", ["--version"], { timeout: 5000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export type BackupRecord = { name: string; sizeBytes: number; createdAt: string };

export async function listDatabaseBackups(): Promise<BackupRecord[]> {
  const dir = backupDirectory();
  await fs.mkdir(dir, { recursive: true });
  const names = (await fs.readdir(dir)).filter((name) => BACKUP_PATTERN.test(name));
  const records = await Promise.all(names.map(async (name) => {
    const stat = await fs.stat(path.join(dir, name));
    return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
  }));
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function enforceRetention() {
  const records = await listDatabaseBackups();
  const expired = records.slice(env.BACKUP_RETENTION_COUNT);
  await Promise.all(expired.map((item) => fs.unlink(path.join(backupDirectory(), item.name)).catch(() => undefined)));
}

export async function createDatabaseBackup(): Promise<BackupRecord> {
  if (!(await pgDumpAvailable())) {
    throw new Error("pg_dump is not available. Install PostgreSQL client tools on the application host.");
  }

  const dir = backupDirectory();
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\.(\d{3})Z$/, "-$1Z");
  const name = `riseora-${stamp}.dump`;
  const output = path.join(dir, name);

  try {
    await execFileAsync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", output], {
      env: postgresEnv(),
      timeout: 5 * 60 * 1000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch (error) {
    await fs.unlink(output).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Unknown backup error";
    throw new Error(`Database backup failed: ${message}`);
  }

  await enforceRetention();
  const stat = await fs.stat(output);
  return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
}
