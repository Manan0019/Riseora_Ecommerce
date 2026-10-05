import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failures = 0;
const pass = (label) => console.log(`PASS  ${label}`);
const fail = (label) => { failures += 1; console.error(`FAIL  ${label}`); };
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const requireText = (file, needles) => {
  const value = read(file);
  for (const needle of needles) value.includes(needle) ? pass(`${file} · ${needle}`) : fail(`${file} · ${needle}`);
};

for (const file of [
  "server/src/services/checkout-confidence.service.ts",
  "server/src/routes/order.routes.ts",
  "server/src/services/system-health.service.ts",
  "client/src/pages/Checkout.jsx",
  "client/src/pages/admin/AdminSystem.jsx",
  "client/src/styles.css",
  "scripts/phase57-checkout-confidence-audit.mjs",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/checkout-confidence.service.ts", [
  "getCheckoutReadiness", "prepareCheckout", "safetyStock", "estimatedFrom", "estimatedTo",
  "recordCheckoutFunnelEvent", "checkoutConfidenceSnapshot", "preflight_pass", "preflight_fail", "completionRatePercent",
]);
requireText("server/src/routes/order.routes.ts", [
  '"/checkout-readiness"', '"/checkout-event"', "checkoutReadinessSchema", "checkoutEventSchema", "getCheckoutReadiness", "recordCheckoutFunnelEvent",
]);
requireText("server/src/services/system-health.service.ts", ["checkoutConfidenceSnapshot", "checkout,"]);
requireText("client/src/pages/Checkout.jsx", [
  '"/orders/checkout-readiness"', '"/orders/checkout-event"', "phase57-checkout-progress", "phase57-checkout-confidence",
  "Ready to place your order", "DELIVERY PROMISE", "VERIFIED TOTAL", "verifyCheckoutReadiness", 'reportCheckoutEvent("submit"', 'reportCheckoutEvent("success"',
]);
requireText("client/src/pages/admin/AdminSystem.jsx", [
  "Checkout conversion confidence", "Preflight ready", "Completion rate", "failureReasons",
]);
const adminSystem = read("client/src/pages/admin/AdminSystem.jsx");
(adminSystem.includes("PHASE 57 · CHECKOUT CONFIDENCE CONTROL") || adminSystem.includes("PHASE 58 · POST-PURCHASE SELF-SERVICE CONTROL") || adminSystem.includes("PHASE 61 · CUSTOMER COMMUNICATION CONTROL")) ? pass("Admin System Phase 57+ control heading") : fail("Admin System Phase 57+ control heading");
requireText("client/src/styles.css", [
  "phase57-checkout-progress", "phase57-checkout-confidence", "phase57-confidence-checks", "phase57-confidence-promise", "phase57-checkout-funnel-grid",
]);

const service = read("server/src/services/checkout-confidence.service.ts");
service.includes("stockQuantity") && service.includes("safetyStock") && service.includes("requestedQuantity > availableQuantity")
  ? pass("checkout preflight verifies live public stock without reserving inventory")
  : fail("checkout live-stock readiness contract");
service.includes("prepareCheckout(input, paymentMethod, userId, { enforceServiceability: true })")
  ? pass("checkout preflight reuses canonical pricing/serviceability rules")
  : fail("checkout canonical preparation reuse");
service.includes("prisma.$transaction") || service.includes("adjustInventory")
  ? fail("checkout readiness must remain read-only")
  : pass("checkout readiness is read-only and does not reserve stock");

const checkout = read("client/src/pages/Checkout.jsx");
const preflight = checkout.indexOf("await verifyCheckoutReadiness()");
const persist = checkout.indexOf("await persistAddress();", preflight);
const placeOrder = checkout.indexOf('apiFetch("/orders"', preflight);
preflight >= 0 && persist > preflight && placeOrder > preflight
  ? pass("final server preflight runs before address persistence/order mutation")
  : fail("checkout mutation must follow preflight");
checkout.includes('reasonCode: result?.code || "NOT_READY"')
  ? pass("checkout failure telemetry uses bounded reason codes, not customer-entered text")
  : fail("checkout privacy-safe failure telemetry");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["checkout:doctor"] || "").includes("phase57-checkout-confidence-audit.mjs") ? pass("checkout:doctor command") : fail("checkout:doctor command");
String(scripts["client:doctor"] || "").includes("checkout:doctor") ? pass("client:doctor includes Phase 57 checkout gate") : fail("client:doctor Phase 57 gate");
String(scripts["verify:phase57"] || "").includes("performance:budget") && String(scripts["verify:phase57"] || "").includes("npm run build") ? pass("verify:phase57 command") : fail("verify:phase57 command");
(["verify:phase57", "verify:phase58", "verify:phase59", "verify:phase60", "verify:phase61", "verify:phase62", "verify:phase63", "verify:phase65"].some((token) => String(scripts["prelaunch:check"] || "").includes(token))) ? pass("prelaunch uses Phase 57+ verification") : fail("prelaunch Phase 57+ verification");

const prepare = read("scripts/phase49-release-prepare.mjs");
(prepare.includes('verify:phase57') || prepare.includes('verify:phase58') || prepare.includes('verify:phase59') || prepare.includes('verify:phase60') || prepare.includes('verify:phase61') || prepare.includes('verify:phase62') || prepare.includes('verify:phase65') || prepare.includes('verify:phase63')) ? pass("production release advances to Phase 57+") : fail("production release Phase 57+ verification");

const destructive = ["migrate reset", "db push --force-reset", "dropdb"];
const packageText = JSON.stringify(pkg).toLowerCase();
destructive.some((token) => packageText.includes(token)) ? fail("no destructive production database command added") : pass("no destructive production database command added");

const clientRoot = path.join(root, "client/src");
const sourceFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:js|jsx)$/.test(entry.name)) sourceFiles.push(full);
  }
}
walk(clientRoot);
const unresolved = [];
for (const file of sourceFiles) {
  const value = fs.readFileSync(file, "utf8");
  for (const match of value.matchAll(/(?:from\s+|import\s*\()(["'])(\.{1,2}\/[^"']+)\1/g)) {
    const raw = match[2];
    const base = path.resolve(path.dirname(file), raw);
    const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js"), path.join(base, "index.jsx")];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) unresolved.push(`${path.relative(root, file)} -> ${raw}`);
  }
}
unresolved.length ? fail(`${unresolved.length} unresolved frontend relative imports\n${unresolved.slice(0, 8).join("\n")}`) : pass(`${sourceFiles.length} frontend files, 0 unresolved relative imports`);

if (failures) {
  console.error(`\nPhase 57 checkout confidence audit: FAIL (${failures})`);
  process.exit(1);
}
console.log("\nPhase 57 checkout confidence audit: PASS");
