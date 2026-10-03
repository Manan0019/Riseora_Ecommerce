import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../config/env";

const execFileAsync = promisify(execFile);

export type PostgresToolResolution = {
  command: string | null;
  source: string | null;
  version: string | null;
};

function isFile(value: string | undefined | null) {
  try { return Boolean(value) && statSync(value as string).isFile(); } catch { return false; }
}

function registryBases() {
  if (process.platform !== "win32") return [] as string[];
  const locations = [
    String.raw`HKLM\SOFTWARE\PostgreSQL\Installations`,
    String.raw`HKLM\SOFTWARE\WOW6432Node\PostgreSQL\Installations`,
  ];
  const bases: string[] = [];
  for (const location of locations) {
    const result = spawnSync("reg.exe", ["query", location, "/s", "/v", "Base Directory"], { encoding: "utf8", windowsHide: true });
    if (result.status !== 0 || !result.stdout) continue;
    for (const line of result.stdout.split(/\r?\n/)) {
      const match = line.match(/Base Directory\s+REG_\w+\s+(.+)$/i);
      if (match?.[1]) bases.push(match[1].trim());
    }
  }
  return [...new Set(bases)];
}

function candidatePaths(tool: string) {
  const executable = process.platform === "win32" ? `${tool}.exe` : tool;
  const explicit = tool === "pg_dump" ? env.PG_DUMP_PATH : tool === "pg_restore" ? env.PG_RESTORE_PATH : undefined;
  const candidates: string[] = [];
  const add = (value?: string | null) => {
    if (!value) return;
    const resolved = path.resolve(value);
    if (!candidates.some((item) => item.toLowerCase() === resolved.toLowerCase())) candidates.push(resolved);
  };
  add(explicit);
  if (env.PG_BIN) add(path.join(env.PG_BIN, executable));
  if (process.env.PG_BIN) add(path.join(process.env.PG_BIN, executable));
  if (process.env.PGHOME) add(path.join(process.env.PGHOME, "bin", executable));
  if (process.env.POSTGRES_HOME) add(path.join(process.env.POSTGRES_HOME, "bin", executable));

  if (process.platform === "win32") {
    for (const base of registryBases()) add(path.join(base, "bin", executable));
    const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], String.raw`C:\Program Files`, String.raw`D:\Program Files`, "C:\\", "D:\\"].filter(Boolean) as string[];
    for (const root of roots) {
      for (const version of ["19", "18", "17", "16", "15", "14", "13", "12"]) add(path.join(root, "PostgreSQL", version, "bin", executable));
    }
  } else {
    for (const dir of ["/usr/bin", "/usr/local/bin", "/opt/homebrew/bin", "/opt/local/bin"]) add(path.join(dir, executable));
  }
  return candidates;
}

export async function resolvePostgresTool(tool: "pg_dump" | "pg_restore"): Promise<PostgresToolResolution> {
  try {
    const { stdout, stderr } = await execFileAsync(tool, ["--version"], { timeout: 5000, windowsHide: true });
    return { command: tool, source: "PATH", version: String(stdout || stderr || "").trim() };
  } catch {}

  for (const candidate of candidatePaths(tool)) {
    if (!existsSync(candidate) || !isFile(candidate)) continue;
    try {
      const { stdout, stderr } = await execFileAsync(candidate, ["--version"], { timeout: 5000, windowsHide: true });
      return { command: candidate, source: "auto-detected", version: String(stdout || stderr || "").trim() };
    } catch {}
  }
  return { command: null, source: null, version: null };
}

export function postgresToolSetupHint() {
  return "Set PG_BIN to the PostgreSQL bin folder (for example C:\\Program Files\\PostgreSQL\\18\\bin) if automatic discovery cannot locate the client tools.";
}
