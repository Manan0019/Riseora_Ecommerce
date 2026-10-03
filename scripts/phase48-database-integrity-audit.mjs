import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failed = false;
const pass = (label) => console.log(`PASS  ${label}`);
const fail = (label, detail = "") => { failed = true; console.error(`FAIL  ${label}${detail ? ` · ${detail}` : ""}`); };
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

const required = [
  "server/prisma/migrations/20261003024500_phase38_refill_replenishment_v2/migration.sql",
  "server/prisma/migrations/20261004160000_phase48_schema_integrity_job_orchestration/migration.sql",
  "server/src/services/database-readiness.service.ts",
  "server/src/services/system-job.service.ts",
  "server/src/services/background-jobs.service.ts",
  "scripts/phase48-dev-prepare.mjs",
  "scripts/db-schema-status.mjs",
];
for (const rel of required) exists(rel) ? pass(rel) : fail(rel, "missing");

const schema = read("server/prisma/schema.prisma");
for (const token of ["model RefillReminder", "replenishmentEnabled", "model SystemJobState"]) schema.includes(token) ? pass(`Prisma ${token}`) : fail(`Prisma ${token}`);

const repair = read("server/prisma/migrations/20261004160000_phase48_schema_integrity_job_orchestration/migration.sql");
repair.includes('CREATE TABLE IF NOT EXISTS "RefillReminder"') && repair.includes('ADD COLUMN IF NOT EXISTS "replenishmentEnabled"')
  ? pass("idempotent Phase 38 schema repair") : fail("idempotent Phase 38 schema repair");
repair.includes('CREATE TABLE IF NOT EXISTS "SystemJobState"') ? pass("durable background-job state migration") : fail("durable background-job state migration");

const pkg = JSON.parse(read("package.json"));
pkg.scripts?.predev?.includes("phase48-dev-prepare") ? pass("npm run dev has pre-start migration gate") : fail("npm run dev has pre-start migration gate");
pkg.scripts?.["db:status"] ? pass("db:status command") : fail("db:status command");
pkg.scripts?.["db:repair"] ? pass("db:repair command") : fail("db:repair command");
pkg.scripts?.["verify:phase48"] ? pass("verify:phase48 command") : fail("verify:phase48 command");

const index = read("server/src/index.ts");
index.includes("assertDatabaseSchemaReady") ? pass("API startup schema guard") : fail("API startup schema guard");
index.includes('runBackgroundJob("CHECKOUT_CLEANUP")') && index.includes("runLifecycleJobs") ? pass("background jobs use durable orchestrator") : fail("background jobs use durable orchestrator");

const job = read("server/src/services/system-job.service.ts");
job.includes("leaseUntil") && job.includes("already-running") ? pass("cross-instance job lease") : fail("cross-instance job lease");

const system = read("client/src/pages/admin/AdminSystem.jsx");
system.includes("Schema & migration integrity") && system.includes("Lifecycle job reliability") ? pass("Admin System database/job health UI") : fail("Admin System database/job health UI");

const extensions = [".js", ".jsx", ".ts", ".tsx"];
const sourceRoot = path.join(root, "client", "src");
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (extensions.includes(path.extname(entry.name))) files.push(full); } }
walk(sourceRoot);
const importRx = /(?:from\s+|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g;
const unresolved = [];
for (const file of files) {
  const content = fs.readFileSync(file, "utf8"); let match;
  while ((match = importRx.exec(content))) {
    const base = path.resolve(path.dirname(file), match[1]);
    const candidates = [base, ...extensions.map((ext) => base + ext), ...extensions.map((ext) => path.join(base, `index${ext}`))];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) unresolved.push(`${path.relative(root, file)} -> ${match[1]}`);
  }
}
unresolved.length ? fail(`${files.length} frontend files, unresolved relative imports`, unresolved.join("; ")) : pass(`${files.length} frontend files, 0 unresolved relative imports`);

console.log(`\nPhase 48 database integrity audit: ${failed ? "FAIL" : "PASS"}`);
if (failed) process.exit(1);
