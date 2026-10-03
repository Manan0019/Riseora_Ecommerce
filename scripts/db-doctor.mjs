import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolvePostgresTool } from "./postgres-tools.mjs";

const root = process.cwd();
const explicit = process.argv.find((arg) => arg.startsWith("--env="))?.slice(6);
const envFile = explicit ? path.resolve(root, explicit) : (fs.existsSync(path.join(root, "server/.env.production")) ? path.join(root, "server/.env.production") : path.join(root, "server/.env"));
function parseEnv(file) { const out = {}; for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) { const line = raw.trim(); if (!line || line.startsWith("#")) continue; const i = line.indexOf("="); if (i < 1) continue; let value = line.slice(i + 1).trim(); if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1); out[line.slice(0,i).trim()] = value; } return out; }

let failed = false;
const pass = (label, detail="") => console.log(`PASS  ${label}${detail ? ` · ${detail}` : ""}`);
const fail = (label, detail="") => { failed = true; console.log(`FAIL  ${label}${detail ? ` · ${detail}` : ""}`); };
if (!fs.existsSync(envFile)) { fail("Environment file", envFile); process.exitCode = 1; }
else {
  const values = parseEnv(envFile);
  pass("Environment file", envFile);
  if (!values.DATABASE_URL) fail("DATABASE_URL", "missing");
  else {
    const u = new URL(values.DATABASE_URL);
    pass("Database target", `${u.hostname}:${u.port || "5432"}/${decodeURIComponent(u.pathname.replace(/^\//, ""))}`);
  }
  const dump = resolvePostgresTool("pg_dump", values);
  const restore = resolvePostgresTool("pg_restore", values);
  dump.command ? pass("pg_dump", `${dump.version} · ${dump.command}`) : fail("pg_dump", "set PG_BIN or PG_DUMP_PATH");
  restore.command ? pass("pg_restore", `${restore.version} · ${restore.command}`) : fail("pg_restore", "set PG_BIN or PG_RESTORE_PATH");
  const backupDir = path.resolve(root, "server", values.BACKUP_DIR || "backups");
  try { fs.mkdirSync(backupDir, { recursive: true }); fs.accessSync(backupDir, fs.constants.R_OK | fs.constants.W_OK); pass("Backup directory", backupDir); } catch (e) { fail("Backup directory", e.message); }
  const validate = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["exec", "--workspace", "server", "--", "prisma", "validate"], { cwd: root, stdio: "inherit", windowsHide: true });
  validate.status === 0 ? pass("Prisma schema validation") : fail("Prisma schema validation", `exit ${validate.status ?? "unknown"}`);
}
console.log(`\nDatabase doctor: ${failed ? "FAIL" : "PASS"}`);
process.exitCode = failed ? 1 : 0;
