import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolvePostgresTool } from "./postgres-tools.mjs";

const root = process.cwd();
const explicit = process.argv.find((arg) => arg.startsWith("--env="))?.slice(6);
const envFile = explicit ? path.resolve(root, explicit) : (fs.existsSync(path.join(root, "server/.env.production")) ? path.join(root, "server/.env.production") : path.join(root, "server/.env"));
function parseEnv(file) { const out = {}; for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) { const line = raw.trim(); if (!line || line.startsWith("#")) continue; const i = line.indexOf("="); if (i < 1) continue; let value = line.slice(i + 1).trim(); if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1); out[line.slice(0,i).trim()] = value; } return out; }

function prismaCliPath() {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve("prisma/package.json", { paths: [root] });
  return path.join(path.dirname(packageJson), "build", "index.js");
}

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

  try {
    const cli = prismaCliPath();
    const validate = spawnSync(process.execPath, [cli, "validate"], {
      cwd: path.join(root, "server"),
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, ...values },
    });
    if (validate.error) fail("Prisma schema validation", validate.error.message);
    else if (validate.status === 0) pass("Prisma schema validation");
    else fail("Prisma schema validation", `exit ${validate.status ?? "unknown"}${validate.signal ? ` signal ${validate.signal}` : ""}`);

    if (!failed) {
      const contract = spawnSync(process.execPath, [path.join(root, "scripts/db-schema-status.mjs")], { cwd: root, stdio: "inherit", windowsHide: true, env: { ...process.env, ...values } });
      if (contract.error) fail("Database schema contract", contract.error.message);
      else if (contract.status === 0) pass("Database migration/schema status");
      else fail("Database migration/schema status", "pending migration or schema drift detected");
    }
  } catch (error) {
    fail("Prisma schema validation", error instanceof Error ? error.message : String(error));
  }
}
console.log(`\nDatabase doctor: ${failed ? "FAIL" : "PASS"}`);
process.exitCode = failed ? 1 : 0;
