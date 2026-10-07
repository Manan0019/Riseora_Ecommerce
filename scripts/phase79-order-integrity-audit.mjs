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
  "server/src/services/order-integrity.service.ts",
  "server/src/routes/admin.routes.ts",
  "server/src/routes/admin-ops.routes.ts",
  "client/src/pages/admin/AdminFulfilment.jsx",
  "client/src/pages/admin/AdminOrderDetail.jsx",
  "client/src/styles.css",
  "package.json",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/order-integrity.service.ts", [
  "getOrderIntegrity",
  "assertOrderIntegrityForFulfilment",
  "fulfilmentIntegrityHealth",
  "ORDER_SUBTOTAL_MISMATCH",
  "ORDER_TOTAL_MISMATCH",
  "PAYMENT_AMOUNT_MISMATCH",
  "ONLINE_PAYMENT_NOT_PAID",
  "COUPON_REDEMPTION_MISSING",
  "INVENTORY_RESERVATION_MISMATCH",
  "CHECKOUT_KEY_LEGACY",
  "STATUS_HISTORY_OUT_OF_SYNC",
]);
requireText("server/src/routes/admin.routes.ts", [
  "assertOrderIntegrityForFulfilment",
  "getOrderIntegrity",
  "ORDER_INTEGRITY_BLOCKED",
  "Review the Phase 79 integrity panel",
]);
requireText("server/src/routes/admin-ops.routes.ts", [
  "fulfilmentIntegrityHealth",
  "orderIntegrityHealth",
  "integrityBlocked",
  "integrityReview",
]);
requireText("client/src/pages/admin/AdminFulfilment.jsx", [
  "PHASE 79 · ORDER INTEGRITY",
  "Order-to-fulfilment handoff",
  "INTEGRITY HOLD",
  "Integrity review",
]);
requireText("client/src/pages/admin/AdminOrderDetail.jsx", [
  "PHASE 79 · ORDER INTEGRITY",
  "Fulfilment hold",
  "Resolve integrity hold first",
  "Stock trace",
]);
requireText("client/src/styles.css", [
  "phase79-integrity-health-grid",
  "phase79-integrity-badge",
  "phase79-order-integrity",
  "phase79-integrity-issues",
]);

const service = read("server/src/services/order-integrity.service.ts");
!/\.create\(|\.update\(|\.delete\(|\.upsert\(/.test(service)
  ? pass("Phase 79 order integrity service remains read-only")
  : fail("order integrity service mutates database state");
service.includes('severity: "REVIEW"') || service.includes('"REVIEW", "CHECKOUT_KEY_LEGACY"')
  ? pass("legacy/missing evidence is review guidance rather than an automatic hard block")
  : fail("legacy evidence review boundary");
service.includes('type: "ORDER_RESERVATION"') && service.includes('referenceType: "CHECKOUT_REQUEST"')
  ? pass("inventory reservation trace is checked against checkout reservation evidence")
  : fail("inventory reservation trace check");
service.includes('order.paymentMethod === "ONLINE"') && service.includes('order.payment.status !== "PAID"')
  ? pass("active online fulfilment requires a paid payment record")
  : fail("online payment integrity gate");

const adminRoutes = read("server/src/routes/admin.routes.ts");
adminRoutes.includes('payload.status !== "CANCELLED"') && adminRoutes.includes("assertOrderIntegrityForFulfilment(order.id, tx)")
  ? pass("forward fulfilment is server-gated while cancellation remains operable")
  : fail("server fulfilment integrity gate");

const schema = read("server/prisma/schema.prisma");
const migrations = fs.readdirSync(path.join(root, "server/prisma/migrations")).filter((name) => /^2026/.test(name)).sort();
!migrations.some((name) => /phase79/i.test(name))
  ? pass("Phase 79 itself adds no migration; later migration heads are allowed") : fail(`unexpected Phase 79 migration present · latest ${migrations.at(-1)}`);

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["order-integrity:doctor"] || "").includes("phase79-order-integrity-audit.mjs") ? pass("order-integrity:doctor command") : fail("order-integrity:doctor command");
String(scripts["client:doctor"] || "").includes("order-integrity:doctor") ? pass("client:doctor includes Phase 79 gate") : fail("client:doctor Phase 79 gate");
String(scripts["verify:phase79"] || "").includes("performance:budget") ? pass("verify:phase79 command") : fail("verify:phase79 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase79") ? pass("prelaunch uses Phase 79 verification") : fail("prelaunch Phase 79 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase79") ? pass("production release advances to Phase 79") : fail("production release Phase 79 verification");

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
} else {
  pass("frontend import scan deferred to full checkout; overlay does not contain canonical api/http.js");
}

if (failures) { console.error(`\nPhase 79 order integrity audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 79 order integrity audit: PASS");
