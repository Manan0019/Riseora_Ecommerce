import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolvePostgresTool, postgresToolHelp } from "./postgres-tools.mjs";

const root = process.cwd();
const fileArg = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--"));
const explicitEnv = process.argv.find((arg) => arg.startsWith("--env="))?.slice(6);
if (!fileArg) {
  console.error("Usage: npm run db:restore -- <backup.dump> [--env=server/.env.production]");
  process.exit(2);
}
const backup = path.resolve(root, fileArg);
if (!fs.existsSync(backup)) throw new Error(`Backup not found: ${backup}`);
const envFile = explicitEnv ? path.resolve(root, explicitEnv) : (fs.existsSync(path.join(root, "server/.env.production")) ? path.join(root, "server/.env.production") : path.join(root, "server/.env"));
function parseEnv(file) { const out = {}; for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) { const line = raw.trim(); if (!line || line.startsWith("#")) continue; const i = line.indexOf("="); if (i < 1) continue; let value = line.slice(i + 1).trim(); if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1); out[line.slice(0,i).trim()] = value; } return out; }
const values = parseEnv(envFile); if (!values.DATABASE_URL) throw new Error(`DATABASE_URL missing in ${envFile}`);
const restoreTool = resolvePostgresTool("pg_restore", values);
if (!restoreTool.command) throw new Error(postgresToolHelp("pg_restore"));

const checksumFile = `${backup}.sha256`;
if (fs.existsSync(checksumFile)) {
  const expected = fs.readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(fs.readFileSync(backup)).digest("hex");
  if (!expected || expected.toLowerCase() !== actual.toLowerCase()) throw new Error("Backup checksum verification failed. Restore aborted.");
  console.log(`Checksum verified: ${actual}`);
} else {
  console.warn("WARNING: No .sha256 sidecar found. Archive structure will still be validated before restore.");
}
const listCheck = spawnSync(restoreTool.command, ["--list", backup], { stdio: "ignore", windowsHide: true });
if (listCheck.error || listCheck.status !== 0) throw listCheck.error || new Error("Backup archive validation failed. Restore aborted.");

const url = new URL(values.DATABASE_URL); const db = decodeURIComponent(url.pathname.replace(/^\//, ""));
console.log(`\nDANGER: this will replace objects in PostgreSQL database ${url.hostname}/${db}`);
console.log(`Backup: ${backup}`);
console.log(`Restore tool: ${restoreTool.command}`);
const rl = readline.createInterface({ input, output });
const answer = await rl.question('Type RESTORE exactly to continue: '); rl.close();
if (answer !== "RESTORE") { console.log("Restore cancelled."); process.exit(0); }
const pgEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: db };
const sslmode = url.searchParams.get("sslmode"); if (sslmode) pgEnv.PGSSLMODE = sslmode;
const result = spawnSync(restoreTool.command, ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error", "--dbname", db, backup], { stdio: "inherit", env: pgEnv, windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
console.log("Restore completed. Run migrations and application verification before serving traffic.");
