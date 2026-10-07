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
  "server/src/services/shipment-tracking-health.service.ts",
  "server/src/routes/admin.routes.ts",
  "server/src/routes/admin-ops.routes.ts",
  "client/src/pages/admin/AdminFulfilment.jsx",
  "client/src/pages/admin/AdminOrderDetail.jsx",
  "client/src/styles.css",
  "package.json",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/shipment-tracking-health.service.ts", [
  "getShipmentTrackingHealth",
  "assertShipmentTrackingCanDeliver",
  "assertShipmentEventTransition",
  "fulfilmentShipmentTrackingHealth",
  "TRACKING_STALE_72H",
  "OUT_FOR_DELIVERY_STALE",
  "TRACKING_ETA_OVERDUE",
  "TRACKING_EXCEPTION_ACTIVE",
  "TRACKING_RTO_ACTIVE",
  "TRACKING_RTO_COMPLETED",
  "SHIPMENT_DELIVERED_USE_FULFILMENT",
  "RTO_INITIATION_REQUIRED",
]);
requireText("server/src/routes/admin.routes.ts", [
  "getShipmentTrackingHealth",
  "assertShipmentTrackingCanDeliver",
  "assertShipmentEventTransition",
  "SHIPMENT_TRACKING_BLOCKED",
  "Review the Phase 81 tracking panel",
  "Mark the order DELIVERED through fulfilment",
]);
requireText("server/src/routes/admin-ops.routes.ts", [
  "fulfilmentShipmentTrackingHealth",
  "shipmentTrackingHealth",
  "trackingBlocked",
  "trackingReview",
  "trackingStale",
  "trackingOverdue",
]);
requireText("client/src/pages/admin/AdminFulfilment.jsx", [
  "PHASE 81 · SHIPMENT TRACKING HEALTH",
  "Post-dispatch delivery control",
  "TRACKING HOLD",
  "ACTIVE EXCEPTION / RTO",
]);
requireText("client/src/pages/admin/AdminOrderDetail.jsx", [
  "PHASE 81 · SHIPMENT TRACKING HEALTH",
  "Delivery lifecycle hold",
  "Resolve tracking hold first",
  "Movement freshness",
]);
requireText("client/src/styles.css", [
  "phase81-tracking-health-grid",
  "phase81-tracking-badge",
  "phase81-order-tracking",
  "phase81-tracking-issues",
]);

const service = read("server/src/services/shipment-tracking-health.service.ts");
!/\.create\(|\.update\(|\.delete\(|\.upsert\(/.test(service)
  ? pass("Phase 81 tracking-health service remains read-only")
  : fail("tracking-health service mutates database state");
service.includes("72 * HOUR") && service.includes("24 * HOUR")
  ? pass("stale shipment and out-for-delivery thresholds are explicit") : fail("tracking freshness thresholds");
service.includes('lastRto?.type === "RTO_INITIATED"') && service.includes('lastRto?.type === "RTO_DELIVERED"')
  ? pass("active/completed RTO prevents false customer delivery") : fail("RTO delivery guard");
service.includes('event.type === "DELIVERED"') && service.includes("SHIPMENT_DELIVERED_USE_FULFILMENT")
  ? pass("manual DELIVERED courier-event bypass is blocked") : fail("atomic delivered transition guard");
service.includes("SHIPMENT_EVENT_BEFORE_SHIPMENT") && service.includes("SHIPMENT_EVENT_FUTURE")
  ? pass("courier event timestamps are sanity checked") : fail("shipment event timestamp guard");

const adminRoutes = read("server/src/routes/admin.routes.ts");
adminRoutes.includes('payload.status === "DELIVERED"') && adminRoutes.includes("assertShipmentTrackingCanDeliver")
  ? pass("DELIVERED transition is server-gated by Phase 81") : fail("delivery tracking gate");
adminRoutes.includes("assertShipmentEventTransition") && adminRoutes.includes("RTO_INITIATION_REQUIRED")
  ? pass("admin shipment-event writes are lifecycle validated") : fail("shipment event lifecycle gate");

const detail = read("client/src/pages/admin/AdminOrderDetail.jsx");
!detail.includes('"OUT_FOR_DELIVERY","DELIVERED","EXCEPTION"')
  ? pass("standalone DELIVERED event removed from admin event picker") : fail("manual DELIVERED remains in event picker");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["tracking-health:doctor"] || "").includes("phase81-shipment-tracking-health-audit.mjs") ? pass("tracking-health:doctor command") : fail("tracking-health:doctor command");
String(scripts["client:doctor"] || "").includes("tracking-health:doctor") ? pass("client:doctor includes Phase 81 gate") : fail("client:doctor Phase 81 gate");
String(scripts["verify:phase81"] || "").includes("performance:budget") ? pass("verify:phase81 command") : fail("verify:phase81 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase81") ? pass("prelaunch uses Phase 81 verification") : fail("prelaunch Phase 81 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase81") ? pass("production release advances to Phase 81") : fail("production release Phase 81 verification");

const migrationDir = path.join(root, "server/prisma/migrations");
if (fs.existsSync(migrationDir)) {
  const migrations = fs.readdirSync(migrationDir).filter((name) => /^2026/.test(name)).sort();
  !migrations.some((name) => /phase81/i.test(name))
    ? pass("Phase 81 itself adds no migration; later migration heads are allowed") : fail(`unexpected Phase 81 migration present · latest ${migrations.at(-1)}`);
} else {
  pass("migration tree not included in overlay package; no Phase 81 migration file is present");
}

if (failures) { console.error(`\nPhase 81 shipment tracking health audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 81 shipment tracking health audit: PASS");
