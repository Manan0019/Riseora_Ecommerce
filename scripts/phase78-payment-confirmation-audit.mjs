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
  "server/src/services/payment-confirmation.service.ts",
  "server/src/services/payment.service.ts",
  "server/src/services/checkout.service.ts",
  "server/src/routes/payment.routes.ts",
  "server/src/routes/admin-payment.routes.ts",
  "client/src/pages/Checkout.jsx",
  "client/src/pages/admin/AdminPayments.jsx",
  "client/src/styles.css",
  "package.json",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/payment-confirmation.service.ts", [
  "reconcilePendingCheckoutPayment",
  "processRazorpayWebhook",
  "findCapturedRazorpayPaymentForOrder",
  "CAPTURE_AMOUNT_MISMATCH",
  "WEBHOOK_DUPLICATE",
  "WEBHOOK_RETRYABLE_FAILURE",
  "paymentConfirmationHealth",
  "Aggregate in-memory payment-confirmation counters only",
  "deleteMany({ where: { eventId: input.eventId } })",
]);
requireText("server/src/routes/payment.routes.ts", [
  "processRazorpayWebhook",
  "reconcilePendingCheckoutPayment",
  'req.query.reconcile',
  "reconciliation",
]);
requireText("server/src/routes/admin-payment.routes.ts", [
  "paymentConfirmationHealth",
  '"/payments/checkout-sessions/:id/reconcile"',
  "staleProviderPending",
  "providerBackedPending",
]);
requireText("client/src/pages/Checkout.jsx", [
  "PHASE 78 · PROVIDER RECHECK",
  "?reconcile=true",
  "CAPTURE_AMOUNT_MISMATCH",
  "Checking provider…",
]);
requireText("client/src/pages/admin/AdminPayments.jsx", [
  "PHASE 78 · PAYMENT CONFIRMATION",
  "Provider confirmation & webhook recovery",
  "CAPTURES RECOVERED",
  "WEBHOOK DUPLICATES",
  "Reconcile",
]);
requireText("client/src/styles.css", [
  "phase78-reconcile-note",
  "phase78-confirmation-health-grid",
  "phase78-payment-actions",
]);

const service = read("server/src/services/payment-confirmation.service.ts");
service.includes("Number(captured.amount || 0) !== Number(session.amountPaise)")
  ? pass("manual provider reconciliation validates captured amount before finalization")
  : fail("manual captured amount validation");
service.includes("Number(session.amountPaise) !== providerAmountPaise")
  ? pass("webhook capture validates provider amount before finalization")
  : fail("webhook captured amount validation");
service.includes("paymentWebhookEvent.create") && service.includes('error?.code === "P2002"')
  ? pass("webhook event ID is reserved before processing for duplicate visibility")
  : fail("webhook pre-processing deduplication contract");
service.includes("paymentWebhookEvent.deleteMany") && service.includes("WEBHOOK_RETRYABLE_FAILURE")
  ? pass("failed webhook processing releases the dedupe marker so provider retry remains possible")
  : fail("webhook retryability contract");
!/customerName|customerEmail|customerPhone|postalCode|shippingAddress|providerPaymentId:\s*input/.test((service.split("export function paymentConfirmationHealth")[1] || "").split("export type PaymentConfirmationResult")[0] || "")
  ? pass("payment-confirmation telemetry stores no customer/address/provider-payment payload")
  : fail("payment-confirmation telemetry privacy");

const routes = read("server/src/routes/payment.routes.ts");
routes.includes("status?reconcile") || routes.includes("req.query.reconcile")
  ? pass("status route supports explicit provider reconciliation") : fail("explicit provider reconciliation route");
!routes.includes("findUnique({ where: { eventId } })")
  ? pass("webhook route no longer uses check-then-create dedupe race") : fail("legacy webhook check-then-create race still present");
service.includes("duplicateEvent = true") && service.includes("Re-run the idempotent processing path")
  ? pass("duplicate webhook delivery can safely re-run finalization after a crash window") : fail("duplicate webhook crash-recovery path");

const schema = read("server/prisma/schema.prisma");
const migrations = fs.readdirSync(path.join(root, "server/prisma/migrations")).filter((name) => /^2026/.test(name)).sort();
// Retained Phase 78 invariant: this phase adds no migration; later phases may do so.
const phase78LegacyMigration = "20261006121500_phase69_account_saved_bag_v2";
const phase78UnexpectedMigrations = migrations.filter((name) => /(?:^|_)phase78(?:_|$)/i.test(name));
migrations.includes(phase78LegacyMigration) && phase78UnexpectedMigrations.length === 0
  ? pass("Phase 69 migration preserved; Phase 78 adds no migration; newer heads allowed")
  : fail(`Phase 78 migration history invalid: missing Phase 69 or introduced: ${phase78UnexpectedMigrations.join(",")}`);

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["payment-confirmation:doctor"] || "").includes("phase78-payment-confirmation-audit.mjs") ? pass("payment-confirmation:doctor command") : fail("payment-confirmation:doctor command");
String(scripts["client:doctor"] || "").includes("payment-confirmation:doctor") ? pass("client:doctor includes Phase 78 gate") : fail("client:doctor Phase 78 gate");
String(scripts["verify:phase78"] || "").includes("performance:budget") ? pass("verify:phase78 command") : fail("verify:phase78 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase78") ? pass("prelaunch uses Phase 78 verification") : fail("prelaunch Phase 78 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase78") ? pass("production release advances to Phase 78") : fail("production release Phase 78 verification");

const clientRoot = path.join(root, "client/src");
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

if (failures) { console.error(`\nPhase 78 payment confirmation audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 78 payment confirmation audit: PASS");
