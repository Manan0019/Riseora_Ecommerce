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
  "server/src/services/payment-readiness.service.ts",
  "server/src/routes/order.routes.ts",
  "server/src/routes/admin-payment.routes.ts",
  "client/src/pages/Checkout.jsx",
  "client/src/pages/admin/AdminPayments.jsx",
  "client/src/styles.css",
  "package.json",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/payment-readiness.service.ts", [
  "getPaymentMethodReadiness", "paymentReadinessHealth", "prepareCheckout", "onlinePaymentsEnabled",
  "recommendedMethod", "recommendationReason", "prepaidOnly", "codOnly", "noMethod",
  "Provider availability is confirmed only when the payment session is created",
  "Customer identity, PIN codes, cart contents and payment credentials are not retained",
]);
requireText("server/src/routes/order.routes.ts", [
  '"/payment-readiness"', "paymentReadinessSchema", "getPaymentMethodReadiness", "blockCommerceDuringMaintenance", "optionalAuth",
]);
requireText("server/src/routes/admin-payment.routes.ts", [
  "paymentReadinessHealth", "paymentReadiness: paymentReadinessHealth()", '"/payments/operations"',
]);
requireText("client/src/pages/Checkout.jsx", [
  "PHASE 74 · PAYMENT READINESS", "Know your payment options before submitting", "/orders/payment-readiness",
  "SECURE ONLINE", "CASH ON DELIVERY", "Lower current total", "Payment guidance",
  "Final Checkout verification will still run before order or payment creation",
  "onlineMethodAvailable", "codMethodAvailable",
]);
requireText("client/src/pages/admin/AdminPayments.jsx", [
  "PHASE 74 · PAYMENT CLARITY", "Checkout payment readiness", "READINESS CHECKS · 60M",
  "BOTH READY", "PREPAID-ONLY", "COD-ONLY", "NO METHOD", "COD BLOCKED",
]);
requireText("client/src/styles.css", [
  "phase74-payment-readiness", "phase74-payment-method-grid", "phase74-payment-guidance",
  "phase74-payment-health", "phase74-payment-health-grid", "phase74-provider-state",
]);

const service = read("server/src/services/payment-readiness.service.ts");
!/prisma\.[a-zA-Z0-9_]+\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/.test(service)
  ? pass("Phase 74 payment readiness service remains read-only") : fail("Phase 74 payment readiness service must not mutate commerce data");
service.includes('prepareCheckout(input, "ONLINE"') && service.includes('prepareCheckout(input, "COD"')
  ? pass("both payment methods reuse canonical checkout preparation") : fail("payment method preparation must remain canonical");
service.includes("onlinePaymentsEnabled") && !service.includes("createRazorpayOrder")
  ? pass("readiness reports configured online capability without creating provider orders") : fail("payment readiness must not create provider sessions/orders");
service.includes("codEligibility") && service.includes("prepaidOnlyProducts") && service.includes("openCodOrderLimit")
  ? pass("COD restrictions stay transparent") : fail("COD restriction transparency");

const checkout = read("client/src/pages/Checkout.jsx");
checkout.includes("paymentReadiness?.ready === false") && checkout.includes("!paymentReady")
  ? pass("Checkout blocks submission when no selected payment method is ready") : fail("Checkout payment readiness block");
checkout.includes("paymentRecovery?.status") && checkout.includes("codMethodAvailable")
  ? pass("existing online payment recovery still protects COD switching") : fail("payment recovery compatibility");
checkout.includes("/orders/checkout-readiness")
  ? pass("Phase 57 final checkout readiness remains authoritative") : fail("Phase 57 checkout readiness must remain");

const adminRoute = read("server/src/routes/admin-payment.routes.ts");
adminRoute.includes("pending") && adminRoute.includes("failedWebhook24h") && adminRoute.includes("paymentReadiness")
  ? pass("Phase 74 extends rather than replaces payment operations health") : fail("payment operations compatibility");

const schema = read("server/prisma/schema.prisma");
schema.includes("model AccountCart") && schema.includes("revision Int @default(1)")
  ? pass("Phase 74 leaves commerce persistence schema unchanged") : fail("Phase 74 schema contract");
const migrationRoot = path.join(root, "server/prisma/migrations");
const migrationDirs = fs.readdirSync(migrationRoot).filter((name) => /^2026/.test(name)).sort();
migrationDirs.at(-1) === "20261006121500_phase69_account_saved_bag_v2"
  ? pass("Phase 69 migration remains schema head; Phase 74 adds no migration") : fail(`unexpected migration head: ${migrationDirs.at(-1)}`);

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["payment-readiness:doctor"] || "").includes("phase74-payment-readiness-audit.mjs") ? pass("payment-readiness:doctor command") : fail("payment-readiness:doctor command");
String(scripts["client:doctor"] || "").includes("payment-readiness:doctor") ? pass("client:doctor includes Phase 74 gate") : fail("client:doctor Phase 74 gate");
String(scripts["verify:phase74"] || "").includes("performance:budget") && String(scripts["verify:phase74"] || "").includes("npm run build") ? pass("verify:phase74 command") : fail("verify:phase74 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase74") ? pass("prelaunch uses Phase 74 verification") : fail("prelaunch Phase 74 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase74") ? pass("production release advances to Phase 74") : fail("production release Phase 74 verification");

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
    const raw = match[2]; const base = path.resolve(path.dirname(file), raw);
    const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js"), path.join(base, "index.jsx")];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) unresolved.push(`${path.relative(root, file)} -> ${raw}`);
  }
}
unresolved.length ? fail(`${unresolved.length} unresolved frontend relative imports\n${unresolved.slice(0, 8).join("\n")}`) : pass(`${sourceFiles.length} frontend files, 0 unresolved relative imports`);

if (failures) { console.error(`\nPhase 74 payment readiness audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 74 payment readiness audit: PASS");
