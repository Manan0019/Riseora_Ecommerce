import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failed = false;
function pass(label){ console.log(`PASS  ${label}`); }
function fail(label, detail=""){ failed = true; console.error(`FAIL  ${label}${detail ? ` · ${detail}` : ""}`); }
function read(rel){ return fs.readFileSync(path.join(root, rel), "utf8"); }
function exists(rel){ return fs.existsSync(path.join(root, rel)); }

const required = [
  "client/src/components/AppErrorBoundary.jsx",
  "client/src/components/MaintenancePage.jsx",
  "client/src/components/NetworkStatus.jsx",
  "server/src/services/maintenance.service.ts",
  "server/src/middleware/maintenance.ts",
  "server/src/services/launch-readiness.service.ts",
  "server/prisma/migrations/20261004123000_phase47_launch_readiness_v2/migration.sql",
];
for (const rel of required) exists(rel) ? pass(rel) : fail(rel, "missing");

const schema = read("server/prisma/schema.prisma");
for (const token of ["maintenanceEnabled", "maintenanceMessage", "maintenanceStartsAt", "maintenanceEndsAt"]) schema.includes(token) ? pass(`Prisma ${token}`) : fail(`Prisma ${token}`);

const app = read("client/src/main.jsx");
app.includes("AppErrorBoundary") ? pass("global React error boundary") : fail("global React error boundary");
const layout = read("client/src/components/Layout.jsx");
layout.includes("maintenanceActive") && layout.includes("NetworkStatus") ? pass("storefront maintenance/offline gate") : fail("storefront maintenance/offline gate");
const orders = read("server/src/routes/order.routes.ts");
const payment = read("server/src/routes/payment.routes.ts");
orders.includes("blockCommerceDuringMaintenance") && payment.includes("currentMaintenance") && payment.includes("STORE_MAINTENANCE") ? pass("server-side checkout maintenance guard") : fail("server-side checkout maintenance guard");
const sw = read("client/public/sw.js");
sw.includes('riseora-shell-v2') && sw.includes('cache: "no-store"') ? pass("deployment-safe service worker") : fail("deployment-safe service worker");
const system = read("client/src/pages/admin/AdminSystem.jsx");
system.includes("launch-readiness") && system.includes("recentClientErrors") ? pass("Admin launch gate and client error telemetry") : fail("Admin launch gate and client error telemetry");

const extensions = [".js", ".jsx", ".ts", ".tsx"];
const sourceRoot = path.join(root, "client", "src");
const files = [];
function walk(dir){ for (const entry of fs.readdirSync(dir,{withFileTypes:true})) { const full=path.join(dir,entry.name); if(entry.isDirectory()) walk(full); else if(extensions.includes(path.extname(entry.name))) files.push(full); } }
walk(sourceRoot);
const importRx = /(?:from\s+|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g;
const unresolved = [];
for (const file of files) {
  const content = fs.readFileSync(file,"utf8");
  let match;
  while ((match = importRx.exec(content))) {
    const base = path.resolve(path.dirname(file), match[1]);
    const candidates = [base, ...extensions.map((ext)=>base+ext), ...extensions.map((ext)=>path.join(base,`index${ext}`))];
    if (!candidates.some((candidate)=>fs.existsSync(candidate))) unresolved.push(`${path.relative(root,file)} -> ${match[1]}`);
  }
}
if (unresolved.length) fail(`${files.length} frontend modules, unresolved relative imports`, unresolved.join("; "));
else pass(`${files.length} frontend modules, 0 unresolved relative imports`);

const pkg = JSON.parse(read("package.json"));
pkg.scripts?.["verify:phase47"] ? pass("verify:phase47 command") : fail("verify:phase47 command");
pkg.scripts?.["smoke:local"] ? pass("smoke:local command") : fail("smoke:local command");
pkg.scripts?.["prelaunch:check"] ? pass("prelaunch:check command") : fail("prelaunch:check command");

console.log(`\nPhase 47 launch-readiness audit: ${failed ? "FAIL" : "PASS"}`);
if (failed) process.exit(1);
