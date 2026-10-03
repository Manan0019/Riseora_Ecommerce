import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolvePostgresTool, postgresToolHelp } from "./postgres-tools.mjs";

const root = process.cwd();
const explicit = process.argv.find((arg) => arg.startsWith("--env="))?.slice(6);
const envFile = explicit ? path.resolve(root, explicit) : (fs.existsSync(path.join(root, "server/.env.production")) ? path.join(root, "server/.env.production") : path.join(root, "server/.env"));

function parseEnv(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("="); if (i < 1) continue;
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[line.slice(0, i).trim()] = value;
  }
  return out;
}

if (!fs.existsSync(envFile)) throw new Error(`Environment file not found: ${envFile}`);
const values = parseEnv(envFile);
if (!values.DATABASE_URL) throw new Error(`DATABASE_URL missing in ${envFile}`);
const url = new URL(values.DATABASE_URL);
const db = decodeURIComponent(url.pathname.replace(/^\//, ""));
const backupDir = path.resolve(root, "server", values.BACKUP_DIR || "backups");
fs.mkdirSync(backupDir, { recursive: true });

const dumpTool = resolvePostgresTool("pg_dump", values);
const restoreTool = resolvePostgresTool("pg_restore", values);
if (!dumpTool.command) throw new Error(postgresToolHelp("pg_dump"));
if (!restoreTool.command) throw new Error(postgresToolHelp("pg_restore"));

const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\.(\d{3})Z$/, "-$1Z");
const file = path.join(backupDir, `riseora-${stamp}.dump`);
const pgEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: db };
const sslmode = url.searchParams.get("sslmode"); if (sslmode) pgEnv.PGSSLMODE = sslmode;

console.log(`PostgreSQL backup tool: ${dumpTool.command}`);
console.log(`PostgreSQL restore tool: ${restoreTool.command}`);
console.log(`Backing up ${url.hostname}/${db} -> ${file}`);

const result = spawnSync(dumpTool.command, ["--format=custom", "--no-owner", "--no-privileges", "--file", file], { stdio: "inherit", env: pgEnv, windowsHide: true });
if (result.error) { try { fs.unlinkSync(file); } catch {} throw result.error; }
if (result.status !== 0) { try { fs.unlinkSync(file); } catch {} process.exit(result.status || 1); }

const stat = fs.statSync(file);
if (stat.size <= 0) { try { fs.unlinkSync(file); } catch {} throw new Error("pg_dump created an empty backup file"); }
const verify = spawnSync(restoreTool.command, ["--list", file], { stdio: "ignore", windowsHide: true });
if (verify.error || verify.status !== 0) { try { fs.unlinkSync(file); } catch {} throw verify.error || new Error("pg_restore could not read the generated backup archive"); }

const checksum = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
fs.writeFileSync(`${file}.sha256`, `${checksum}  ${path.basename(file)}\n`, "utf8");
console.log(`Backup verified successfully (${(stat.size / 1024 / 1024).toFixed(2)} MB).`);
console.log(`SHA-256: ${checksum}`);
