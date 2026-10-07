import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
let failed = false;
const pass = (label) => console.log(`PASS  ${label}`);
const fail = (label, detail = "") => { failed = true; console.error(`FAIL  ${label}${detail ? ` · ${detail}` : ""}`); };
const exists = (rel) => fs.existsSync(path.join(root, rel));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const required = [
  "server/src/config/env.ts",
  "server/src/services/database-readiness.service.ts",
  "server/src/services/production-readiness.service.ts",
  "server/src/services/system-health.service.ts",
  "server/src/services/system-job.service.ts",
  "server/src/routes/system.routes.ts",
  "server/src/index.ts",
  "client/src/api/http.js",
  "client/src/pages/admin/AdminSystem.jsx",
  "scripts/phase49-release-doctor.mjs",
  "scripts/phase49-release-prepare.mjs",
  "scripts/phase49-release-smoke.mjs",
  "scripts/phase49-production-release-audit.mjs",
];
for (const rel of required) exists(rel) ? pass(rel) : fail(rel, "missing");

const databaseReadiness = read("server/src/services/database-readiness.service.ts");
databaseReadiness.includes("const missing: string[]") ? pass("Phase 48 TypeScript missing-list widening repaired") : fail("Phase 48 TypeScript missing-list widening repaired");
databaseReadiness.includes("EXPECTED_MIGRATION_HEAD") ? pass("Phase 48 migration-head guard preserved") : fail("Phase 48 migration-head guard preserved");

const env = read("server/src/config/env.ts");
for (const token of ["RELEASE_BUILD_TIME", "PUBLIC_SITE_URL is required in production", "Wildcard ALLOWED_ORIGINS", "JWT_SECRET must be a real unique production secret"]) {
  env.includes(token) ? pass(`production env contract · ${token}`) : fail(`production env contract · ${token}`);
}

const production = read("server/src/services/production-readiness.service.ts");
production.includes("releaseMetadata") && production.includes("productionConfigurationStatus") ? pass("centralized runtime production readiness") : fail("centralized runtime production readiness");

const routes = read("server/src/routes/system.routes.ts");
routes.includes('"/health/live"') && routes.includes('"/health/ready"') ? pass("liveness/readiness split preserved") : fail("liveness/readiness split preserved");
routes.includes('"/release"') && routes.includes("databaseMigrationHead") ? pass("safe release metadata endpoint") : fail("safe release metadata endpoint");

const index = read("server/src/index.ts");
index.includes("assertProductionConfigurationReady") ? pass("production startup configuration guard") : fail("production startup configuration guard");
index.includes('req.path.startsWith("/api")') ? pass("SPA fallback explicitly excludes API") : fail("SPA fallback explicitly excludes API");
index.includes("max-age=31536000, immutable") && index.includes('Cache-Control", "no-store"') ? pass("production static cache strategy") : fail("production static cache strategy");
index.includes("releaseOwnedSystemJobLeases") ? pass("graceful shutdown releases owned job leases") : fail("graceful shutdown releases owned job leases");

const jobs = read("server/src/services/system-job.service.ts");
jobs.includes("releaseOwnedSystemJobLeases") && jobs.includes('"lease-held"') && jobs.includes('"delayed"') ? pass("background-job production state and lease cleanup") : fail("background-job production state and lease cleanup");

const clientHttp = read("client/src/api/http.js");
clientHttp.includes('import.meta.env.PROD ? "/api"') ? pass("production client defaults to same-origin /api") : fail("production client defaults to same-origin /api");

const admin = read("client/src/pages/admin/AdminSystem.jsx");
admin.includes("Deployment & runtime identity") && admin.includes("Production config") ? pass("Admin System release-health UI") : fail("Admin System release-health UI");

const pkg = JSON.parse(read("package.json"));
for (const command of ["release:doctor", "release:build", "release:prepare", "release:smoke", "verify:phase49"]) {
  pkg.scripts?.[command] ? pass(`${command} command`) : fail(`${command} command`);
}
pkg.scripts?.["deploy:production"]?.includes("release:prepare") ? pass("legacy deploy:production routes through Phase 49 safety") : fail("legacy deploy:production routes through Phase 49 safety");
pkg.scripts?.["preflight:production"]?.includes("release:doctor") ? pass("legacy preflight routes through Phase 49 doctor") : fail("legacy preflight routes through Phase 49 doctor");
pkg.scripts?.["smoke:local"]?.includes("release:smoke") ? pass("legacy smoke:local routes through Phase 49 smoke") : fail("legacy smoke:local routes through Phase 49 smoke");
for (const command of ["db:backup:production", "db:doctor:production", "db:status:production"]) {
  pkg.scripts?.[command] ? pass(`${command} explicit production database command`) : fail(`${command} explicit production database command`);
}

const backupScript = read("scripts/db-backup.mjs");
const doctorScript = read("scripts/db-doctor.mjs");
const restoreScript = read("scripts/db-restore.mjs");
for (const [label, content] of [["backup", backupScript], ["doctor", doctorScript], ["restore", restoreScript]]) {
  content.includes('process.argv.includes("--production")') && content.includes('production ? "server/.env.production" : "server/.env"')
    ? pass(`explicit ${label} database environment targeting`) : fail(`explicit ${label} database environment targeting`);
}

const prepare = read("scripts/phase49-release-prepare.mjs");
const finalVerifyToken = ["verify:phase89", "verify:phase88", "verify:phase87", "verify:phase86", "verify:phase85", "verify:phase84", "verify:phase83", "verify:phase82", "verify:phase81", "verify:phase80", "verify:phase79", "verify:phase78", "verify:phase77", "verify:phase76", "verify:phase75", "verify:phase74", "verify:phase73", "verify:phase72", "verify:phase71", "verify:phase70", "verify:phase69", "verify:phase68", "verify:phase65", "verify:phase63", "verify:phase62", "verify:phase61", "verify:phase60", "verify:phase59", "verify:phase58", "verify:phase57", "verify:phase56", "verify:phase55", "verify:phase54", "verify:phase53", "verify:phase52", "verify:phase51"].find((token) => prepare.includes(token)) || "verify:phase49";
const order = ["phase49-release-doctor", "db:backup", "db:deploy", "db:generate", "db-schema-status", finalVerifyToken].map((token) => prepare.indexOf(token));
order.every((value) => value >= 0) && order.every((value, index) => index === 0 || value > order[index - 1])
  ? pass(`release order backup-before-migrate-before-build · ${finalVerifyToken}`) : fail("release order backup-before-migrate-before-build");
!/migrate\s+dev|migrate:dev|migrate\s+reset|db\s+push/i.test(prepare) ? pass("production release has no destructive/dev migration command") : fail("production release has no destructive/dev migration command");

for (const script of ["scripts/phase49-release-doctor.mjs", "scripts/phase49-release-prepare.mjs", "scripts/phase49-release-smoke.mjs"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, script)], { encoding: "utf8" });
  result.status === 0 ? pass(`${script} syntax`) : fail(`${script} syntax`, (result.stderr || result.stdout || "syntax error").trim());
}

const extensions = [".js", ".jsx", ".ts", ".tsx"];
const sourceRoot = path.join(root, "client", "src");
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full); else if (extensions.includes(path.extname(entry.name))) files.push(full);
  }
}
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

console.log(`\nPhase 49 production release audit: ${failed ? "FAIL" : "PASS"}`);
if (failed) process.exit(1);
