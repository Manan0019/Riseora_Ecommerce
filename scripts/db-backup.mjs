import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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
const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\.(\d{3})Z$/, "-$1Z");
const file = path.join(backupDir, `riseora-${stamp}.dump`);
const pgEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: db };
const sslmode = url.searchParams.get("sslmode"); if (sslmode) pgEnv.PGSSLMODE = sslmode;
console.log(`Backing up ${url.hostname}/${db} -> ${file}`);
const result = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", file], { stdio: "inherit", env: pgEnv, windowsHide: true });
if (result.error) { try { fs.unlinkSync(file); } catch {} throw result.error; }
if (result.status !== 0) { try { fs.unlinkSync(file); } catch {} process.exit(result.status || 1); }
console.log("Backup completed successfully.");
