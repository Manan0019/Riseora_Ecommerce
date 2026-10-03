import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "../config/env";
import { postgresToolSetupHint, resolvePostgresTool } from "../utils/postgres-tools";

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

async function sha256(file: string) {
  return await new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function postgresBackupTools() {
  const [dump, restore] = await Promise.all([resolvePostgresTool("pg_dump"), resolvePostgresTool("pg_restore")]);
  return { dump, restore, ready: Boolean(dump.command && restore.command), hint: postgresToolSetupHint() };
}

export async function pgDumpAvailable() {
  const tools = await postgresBackupTools();
  return tools.ready;
}

export type BackupRecord = {
  name: string;
  sizeBytes: number;
  createdAt: string;
  checksumSha256: string | null;
  verified: boolean;
};

export async function listDatabaseBackups(): Promise<BackupRecord[]> {
  const dir = backupDirectory();
  await fs.mkdir(dir, { recursive: true });
  const names = (await fs.readdir(dir)).filter((name) => BACKUP_PATTERN.test(name));
  const records = await Promise.all(names.map(async (name) => {
    const fullPath = path.join(dir, name);
    const stat = await fs.stat(fullPath);
    const checksumPath = `${fullPath}.sha256`;
    let checksumSha256: string | null = null;
    try {
      const contents = await fs.readFile(checksumPath, "utf8");
      checksumSha256 = contents.trim().split(/\s+/)[0] || null;
    } catch {}
    return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString(), checksumSha256, verified: Boolean(checksumSha256 && stat.size > 0) };
  }));
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function enforceRetention() {
  const records = await listDatabaseBackups();
  const expired = records.slice(env.BACKUP_RETENTION_COUNT);
  await Promise.all(expired.flatMap((item) => {
    const dump = path.join(backupDirectory(), item.name);
    return [fs.unlink(dump).catch(() => undefined), fs.unlink(`${dump}.sha256`).catch(() => undefined)];
  }));
}

export async function createDatabaseBackup(): Promise<BackupRecord> {
  const tools = await postgresBackupTools();
  if (!tools.dump.command || !tools.restore.command) throw new Error(`PostgreSQL backup tools are unavailable. ${tools.hint}`);

  const dir = backupDirectory();
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\.(\d{3})Z$/, "-$1Z");
  const name = `riseora-${stamp}.dump`;
  const output = path.join(dir, name);

  try {
    await execFileAsync(tools.dump.command, ["--format=custom", "--no-owner", "--no-privileges", "--file", output], {
      env: postgresEnv(), timeout: 5 * 60 * 1000, windowsHide: true, maxBuffer: 2 * 1024 * 1024,
    });
    const stat = await fs.stat(output);
    if (stat.size <= 0) throw new Error("pg_dump created an empty backup file");

    // pg_restore --list validates the custom-format archive structure without changing the database.
    await execFileAsync(tools.restore.command, ["--list", output], { timeout: 60 * 1000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    const checksumSha256 = await sha256(output);
    await fs.writeFile(`${output}.sha256`, `${checksumSha256}  ${name}\n`, "utf8");
  } catch (error) {
    await fs.unlink(output).catch(() => undefined);
    await fs.unlink(`${output}.sha256`).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Unknown backup error";
    throw new Error(`Database backup failed: ${message}`);
  }

  await enforceRetention();
  const stat = await fs.stat(output);
  const checksumSha256 = (await fs.readFile(`${output}.sha256`, "utf8")).trim().split(/\s+/)[0] || null;
  return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString(), checksumSha256, verified: Boolean(checksumSha256) };
}
