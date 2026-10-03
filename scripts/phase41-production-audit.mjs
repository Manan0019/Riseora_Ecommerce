import fs from "node:fs";

const checks = [
  ["server/src/middleware/request-observability.ts", "request observability middleware"],
  ["server/src/services/runtime-observability.service.ts", "rolling runtime metrics"],
  ["server/src/services/system-health.service.ts", "system health service"],
  ["client/src/pages/admin/AdminSystem.jsx", "Admin System observability UI"],
  ["scripts/db-doctor.mjs", "database doctor"],
];
let failed = false;
const pass = (m) => console.log(`PASS  ${m}`);
const fail = (m) => { failed = true; console.log(`FAIL  ${m}`); };
for (const [file, label] of checks) fs.existsSync(file) ? pass(label) : fail(`${label} missing: ${file}`);

const index = fs.readFileSync("server/src/index.ts", "utf8");
index.includes("app.use(requestObservability)") ? pass("request tracing mounted before API routes") : fail("request tracing middleware not mounted");
index.includes("setRuntimeDraining(true)") ? pass("graceful shutdown marks readiness draining") : fail("graceful shutdown draining state missing");
index.includes("uncaught_exception") ? pass("fatal runtime event handling present") : fail("uncaught exception handling missing");

const doctor = fs.readFileSync("scripts/db-doctor.mjs", "utf8");
doctor.includes('["run", "prisma:validate", "--workspace", "server"]') ? pass("db:doctor uses workspace Prisma validation script") : fail("db:doctor still uses fragile npm exec validation");

const serverPkg = JSON.parse(fs.readFileSync("server/package.json", "utf8"));
String(serverPkg.scripts?.build || "").includes("esbuild src/index.ts") ? pass("server production build uses direct esbuild") : fail("server build is not using direct esbuild");

const clientPkg = JSON.parse(fs.readFileSync("client/package.json", "utf8"));
clientPkg.dependencies?.["react-router-dom"] === "6.30.6" ? pass("React Router security patch pinned") : fail("React Router 6.30.6 not pinned");

console.log(`\nPhase 41 production audit: ${failed ? "FAIL" : "PASS"}`);
process.exitCode = failed ? 1 : 0;
