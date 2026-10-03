import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function existsFile(value) {
  try { return Boolean(value) && fs.statSync(value).isFile(); } catch { return false; }
}

function addCandidate(list, value, source) {
  if (!value) return;
  const resolved = path.resolve(value);
  if (!list.some((item) => item.path.toLowerCase() === resolved.toLowerCase())) list.push({ path: resolved, source });
}

function registryPostgresBases() {
  if (process.platform !== "win32") return [];
  const locations = [
    String.raw`HKLM\SOFTWARE\PostgreSQL\Installations`,
    String.raw`HKLM\SOFTWARE\WOW6432Node\PostgreSQL\Installations`,
  ];
  const bases = [];
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

function defaultWindowsBases() {
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    String.raw`C:\Program Files`,
    String.raw`D:\Program Files`,
    "C:\\",
    "D:\\",
  ].filter(Boolean);
  const versions = ["19", "18", "17", "16", "15", "14", "13", "12"];
  const bases = [];
  for (const root of roots) {
    for (const version of versions) {
      if (/Program Files/i.test(root)) bases.push(path.join(root, "PostgreSQL", version));
      else bases.push(path.join(root, "PostgreSQL", version));
    }
  }
  return bases;
}

export function resolvePostgresTool(tool, values = {}) {
  const executable = process.platform === "win32" ? `${tool}.exe` : tool;
  const explicitKey = tool === "pg_dump" ? "PG_DUMP_PATH" : tool === "pg_restore" ? "PG_RESTORE_PATH" : tool === "pg_isready" ? "PG_ISREADY_PATH" : "";
  const candidates = [];

  const explicit = (explicitKey && (values[explicitKey] || process.env[explicitKey])) || "";
  if (explicit) addCandidate(candidates, explicit, explicitKey);

  for (const dir of [values.PG_BIN, process.env.PG_BIN, process.env.PGHOME && path.join(process.env.PGHOME, "bin"), process.env.POSTGRES_HOME && path.join(process.env.POSTGRES_HOME, "bin")].filter(Boolean)) {
    addCandidate(candidates, path.join(dir, executable), "PG_BIN/PGHOME");
  }

  if (process.platform === "win32") {
    for (const base of registryPostgresBases()) addCandidate(candidates, path.join(base, "bin", executable), "Windows registry");
    for (const base of defaultWindowsBases()) addCandidate(candidates, path.join(base, "bin", executable), "Common Windows path");
  } else {
    for (const dir of ["/usr/bin", "/usr/local/bin", "/opt/homebrew/bin", "/opt/local/bin"]) addCandidate(candidates, path.join(dir, executable), "Common system path");
  }

  // PATH lookup first if it is already configured.
  const pathProbe = spawnSync(tool, ["--version"], { encoding: "utf8", windowsHide: true });
  if (!pathProbe.error && pathProbe.status === 0) {
    return { command: tool, source: "PATH", version: String(pathProbe.stdout || pathProbe.stderr || "").trim(), attempted: candidates.map((item) => item.path) };
  }

  for (const candidate of candidates) {
    if (!existsFile(candidate.path)) continue;
    const probe = spawnSync(candidate.path, ["--version"], { encoding: "utf8", windowsHide: true });
    if (!probe.error && probe.status === 0) {
      return { command: candidate.path, source: candidate.source, version: String(probe.stdout || probe.stderr || "").trim(), attempted: candidates.map((item) => item.path) };
    }
  }

  return { command: null, source: null, version: null, attempted: candidates.map((item) => item.path) };
}

export function postgresToolHelp(tool) {
  const key = tool === "pg_dump" ? "PG_DUMP_PATH" : tool === "pg_restore" ? "PG_RESTORE_PATH" : "PG_BIN";
  return `${tool} was not found. Set PG_BIN to your PostgreSQL bin folder (for example C:\\Program Files\\PostgreSQL\\18\\bin) or set ${key} to the full executable path.`;
}
