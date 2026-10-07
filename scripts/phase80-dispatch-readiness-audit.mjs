import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failures = 0;
const pass = (message) => console.log(`PASS  ${message}`);
const fail = (message) => { failures += 1; console.error(`FAIL  ${message}`); };
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
function requireText(file, tokens) {
  const value = read(file);
  for (const token of tokens) value.includes(token) ? pass(`${file} · ${token}`) : fail(`${file} · missing ${token}`);
}

for (const file of [
  "server/src/services/dispatch-readiness.service.ts",
  "server/src/routes/admin.routes.ts",
  "server/src/routes/admin-ops.routes.ts",
  "client/src/pages/admin/AdminFulfilment.jsx",
  "client/src/pages/admin/AdminOrderDetail.jsx",
  "client/src/styles.css",
  "package.json",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/dispatch-readiness.service.ts", [
  "getDispatchReadiness",
  "assertDispatchReadinessForTransition",
  "fulfilmentDispatchReadinessHealth",
  "DISPATCH_ADDRESS_INCOMPLETE",
  "TRACKING_NUMBER_DUPLICATE",
  "COURIER_COD_UNAVAILABLE",
  "COURIER_WEIGHT_EXCEEDED",
  "PICKUP_EVENT_MISSING",
  "DELIVERED_EVENT_MISSING",
  "DISPATCH_SLA_OVERDUE",
]);
requireText("server/src/routes/admin.routes.ts", [
  "assertDispatchReadinessForTransition",
  "getDispatchReadiness",
  "DISPATCH_READINESS_BLOCKED",
  "DELIVERY_EVIDENCE_BLOCKED",
  "Review the Phase 80 dispatch panel",
]);
requireText("server/src/routes/admin-ops.routes.ts", [
  "fulfilmentDispatchReadinessHealth",
  "dispatchReadinessHealth",
  "dispatchBlocked",
  "dispatchReview",
]);
requireText("client/src/pages/admin/AdminFulfilment.jsx", [
  "PHASE 80 · DISPATCH READINESS",
  "Courier handoff & shipment evidence",
  "DISPATCH HOLD",
  "Dispatch review",
]);
requireText("client/src/pages/admin/AdminOrderDetail.jsx", [
  "PHASE 80 · DISPATCH READINESS",
  "Dispatch evidence hold",
  "duplicate tracking detection",
  "Resolve dispatch hold first",
]);
requireText("client/src/styles.css", [
  "phase80-dispatch-health-grid",
  "phase80-dispatch-badge",
  "phase80-order-dispatch",
  "phase80-dispatch-issues",
]);

const service = read("server/src/services/dispatch-readiness.service.ts");
!/\.create\(|\.update\(|\.delete\(|\.upsert\(/.test(service)
  ? pass("Phase 80 dispatch readiness service remains read-only")
  : fail("dispatch readiness service mutates database state");
service.includes("TRACKING_NUMBER_DUPLICATE") && service.includes("NOT: { orderId: order.id }")
  ? pass("tracking references are checked for cross-order duplication")
  : fail("duplicate tracking guard");
service.includes('order.paymentMethod === "COD"') && service.includes("!partner.supportsCod")
  ? pass("registered courier COD capability is enforced")
  : fail("courier COD capability guard");
service.includes("partner.maxWeightGrams") && service.includes("COURIER_WEIGHT_EXCEEDED")
  ? pass("registered courier parcel-weight cap is enforced")
  : fail("courier weight guard");
service.includes('event.type === "PICKED_UP"') && service.includes('event.type === "DELIVERED"')
  ? pass("persisted shipment and delivery evidence are audited")
  : fail("shipment evidence checks");

const adminRoutes = read("server/src/routes/admin.routes.ts");
adminRoutes.includes('["SHIPPED", "DELIVERED"].includes(payload.status)') && adminRoutes.includes("assertDispatchReadinessForTransition")
  ? pass("SHIPPED / DELIVERED transitions are server-gated")
  : fail("dispatch transition gate");
adminRoutes.includes('payload.status !== "CANCELLED"')
  ? pass("Phase 79 cancellation/refund escape remains intact")
  : fail("cancellation path preservation");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["dispatch-readiness:doctor"] || "").includes("phase80-dispatch-readiness-audit.mjs") ? pass("dispatch-readiness:doctor command") : fail("dispatch-readiness:doctor command");
String(scripts["client:doctor"] || "").includes("dispatch-readiness:doctor") ? pass("client:doctor includes Phase 80 gate") : fail("client:doctor Phase 80 gate");
String(scripts["verify:phase80"] || "").includes("performance:budget") ? pass("verify:phase80 command") : fail("verify:phase80 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase80") ? pass("prelaunch uses Phase 80 verification") : fail("prelaunch Phase 80 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase80") ? pass("production release advances to Phase 80") : fail("production release Phase 80 verification");

const migrationDir = path.join(root, "server/prisma/migrations");
if (fs.existsSync(migrationDir)) {
  const migrations = fs.readdirSync(migrationDir).filter((name) => /^2026/.test(name)).sort();
  migrations.at(-1) === "20261006121500_phase69_account_saved_bag_v2"
    ? pass("Phase 69 remains migration head; Phase 80 adds no migration") : fail(`unexpected migration head ${migrations.at(-1)}`);
} else {
  pass("migration tree not included in overlay package; no Phase 80 migration file is present");
}

const clientRoot = path.join(root, "client/src");
if (fs.existsSync(clientRoot) && fs.existsSync(path.join(clientRoot, "api/http.js"))) {
  const files = [];
  function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (/\.(?:js|jsx)$/.test(entry.name)) files.push(file); } }
  walk(clientRoot);
  const unresolved = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:from\s+|import\s*\()(["'])(\.{1,2}\/[^"']+)\1/g)) {
      const base = path.resolve(path.dirname(file), match[2]);
      const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js"), path.join(base, "index.jsx")];
      if (!candidates.some(fs.existsSync)) unresolved.push(`${path.relative(root, file)} -> ${match[2]}`);
    }
  }
  unresolved.length ? fail(`${unresolved.length} unresolved frontend relative imports`) : pass(`${files.length} frontend files, 0 unresolved relative imports`);
}

if (failures) { console.error(`\nPhase 80 dispatch readiness audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 80 dispatch readiness audit: PASS");
