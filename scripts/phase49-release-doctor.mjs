import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolvePostgresTool } from "./postgres-tools.mjs";

const root = process.cwd();
const serverRoot = path.join(root, "server");
const envFile = path.join(serverRoot, ".env.production");
let failed = false;
let warnings = 0;
const pass = (label, detail = "") => console.log(`PASS  ${label}${detail ? ` · ${detail}` : ""}`);
const warn = (label, detail = "") => { warnings += 1; console.log(`WARN  ${label}${detail ? ` · ${detail}` : ""}`); };
const fail = (label, detail = "") => { failed = true; console.error(`FAIL  ${label}${detail ? ` · ${detail}` : ""}`); };

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[line.slice(0, index).trim()] = value;
  }
  return out;
}

function prismaCliPath() {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve("prisma/package.json", { paths: [root] });
  return path.join(path.dirname(packageJson), "build", "index.js");
}

console.log("Riseora Phase 49 production release doctor\n");
const [major, minor] = process.versions.node.split(".").map(Number);
const nodeSupported = (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22;
nodeSupported ? pass(`Node ${process.version}`) : fail(`Node ${process.version}`, "Node 20.19+ or 22.12+ is required by the verified Vite toolchain");

if (!fs.existsSync(envFile)) {
  fail("Production environment", "server/.env.production is missing; copy server/.env.production.example and fill real values");
} else {
  const values = parseEnv(envFile);
  const productionEnv = { ...process.env, ...values };
  pass("Production environment", envFile);

  values.NODE_ENV === "production" ? pass("NODE_ENV=production") : fail("NODE_ENV", "must be production");
  if (!values.DATABASE_URL) fail("DATABASE_URL", "missing");
  else {
    try {
      const url = new URL(values.DATABASE_URL);
      /^postgres(ql)?:$/.test(url.protocol) ? pass("PostgreSQL DATABASE_URL") : fail("DATABASE_URL", "must use postgres/postgresql protocol");
      pass("Database target", `${url.hostname}:${url.port || "5432"}/${decodeURIComponent(url.pathname.replace(/^\//, ""))}`);
    } catch (error) { fail("DATABASE_URL", error.message); }
  }

  for (const key of ["CLIENT_URL", "PUBLIC_SITE_URL"]) {
    const value = values[key] || "";
    value.startsWith("https://") ? pass(`${key} uses HTTPS`) : fail(key, "must use HTTPS in production");
  }

  const jwt = values.JWT_SECRET || "";
  jwt.length >= 48 && !/replace|example|change[-_ ]?me|your[-_ ]?secret/i.test(jwt)
    ? pass("JWT_SECRET production strength") : fail("JWT_SECRET", "use a real unique secret of at least 48 characters");

  String(values.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).includes("*")
    ? fail("ALLOWED_ORIGINS", "wildcard origin is not allowed") : pass("ALLOWED_ORIGINS has no wildcard");

  const allOrNone = (keys, label) => {
    const count = keys.filter((key) => Boolean(values[key])).length;
    if (count === 0) return warn(label, "not configured");
    if (count === keys.length) return pass(label);
    fail(label, "configuration is partial");
  };
  allOrNone(["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"], "Razorpay configuration");
  allOrNone(["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"], "Cloudinary configuration");
  allOrNone(["RESEND_API_KEY", "EMAIL_FROM"], "Transactional email configuration");

  String(values.SERVE_CLIENT || "").toLowerCase() === "true" ? pass("Same-origin production client enabled") : warn("SERVE_CLIENT is disabled", "confirm frontend is deployed separately");
  values.RELEASE_NAME ? pass("RELEASE_NAME configured") : warn("RELEASE_NAME", "not configured");
  values.RELEASE_SHA ? pass("RELEASE_SHA configured") : warn("RELEASE_SHA", "not configured");
  values.RELEASE_BUILD_TIME ? pass("RELEASE_BUILD_TIME configured") : warn("RELEASE_BUILD_TIME", "not configured");

  const dump = resolvePostgresTool("pg_dump", values);
  const restore = resolvePostgresTool("pg_restore", values);
  dump.command ? pass("pg_dump", `${dump.version} · ${dump.command}`) : fail("pg_dump", "set PG_BIN or PG_DUMP_PATH");
  restore.command ? pass("pg_restore", `${restore.version} · ${restore.command}`) : fail("pg_restore", "set PG_BIN or PG_RESTORE_PATH");

  const backupDir = path.resolve(serverRoot, values.BACKUP_DIR || "backups");
  try { fs.mkdirSync(backupDir, { recursive: true }); fs.accessSync(backupDir, fs.constants.R_OK | fs.constants.W_OK); pass("Backup directory", backupDir); }
  catch (error) { fail("Backup directory", error.message); }

  try {
    const serverRequire = createRequire(path.join(serverRoot, "package.json"));
    const { Client } = serverRequire("pg");
    const client = new Client({ connectionString: values.DATABASE_URL });
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    pass("Production database connectivity");
  } catch (error) {
    fail("Production database connectivity", error.message);
  }

  try {
    const validate = spawnSync(process.execPath, [prismaCliPath(), "validate"], { cwd: serverRoot, env: productionEnv, encoding: "utf8", windowsHide: true });
    if (validate.status === 0) pass("Prisma schema validation"); else fail("Prisma schema validation", (validate.stderr || validate.stdout || `exit ${validate.status}`).trim().slice(0, 500));
  } catch (error) { fail("Prisma schema validation", error.message); }

  const contract = spawnSync(process.execPath, [path.join(root, "scripts", "db-schema-status.mjs"), "--production"], { cwd: root, env: productionEnv, encoding: "utf8", windowsHide: true });
  if (contract.status === 0) pass("Database migration/schema status", (contract.stdout || "").trim().replace(/^PASS\s+/, ""));
  else warn("Database migration/schema status", "not current; release:prepare will back up first and then deploy committed migrations");
}

for (const relative of ["package-lock.json", "server/prisma/schema.prisma", "client/package.json", "server/package.json"]) {
  fs.existsSync(path.join(root, relative)) ? pass(relative) : fail(relative, "missing");
}

console.log(`\nPhase 49 release doctor: ${failed ? "FAIL" : "PASS"} · ${warnings} warning(s)`);
if (failed) process.exit(1);
