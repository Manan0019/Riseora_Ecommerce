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
  "server/src/services/checkout-review-signature.ts",
  "server/src/services/checkout-final-review.service.ts",
  "server/src/services/checkout.service.ts",
  "server/src/routes/order.routes.ts",
  "server/src/routes/payment.routes.ts",
  "server/src/services/system-health.service.ts",
  "client/src/pages/Checkout.jsx",
  "client/src/pages/admin/AdminSystem.jsx",
  "client/src/styles.css",
  "package.json",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/checkout-review-signature.ts", [
  "buildCheckoutReviewDigest", "createHash", 'digest("hex")', "paymentMethod", "automaticPromotionName", "totalWeightGrams",
]);
requireText("server/src/services/checkout-final-review.service.ts", [
  "getCheckoutFinalReview", "recordCheckoutFinalReviewEvent", "checkoutFinalReviewHealth", "prepareCheckout",
  "buildCheckoutReviewDigest", "This final review is a read-only server snapshot",
  "Customer identity, address, cart contents and review digests are not retained in telemetry",
]);
requireText("server/src/services/checkout.service.ts", [
  "expectedReviewDigest?: string", "buildCheckoutReviewDigest", 'throw new Error("CHECKOUT_REVIEW_CHANGED")',
]);
requireText("server/src/routes/order.routes.ts", [
  '"/final-review"', '"/final-review/event"', "getCheckoutFinalReview", "recordCheckoutFinalReviewEvent",
  "expectedReviewDigest", "CHECKOUT_REVIEW_CHANGED",
]);
requireText("server/src/routes/payment.routes.ts", [
  "expectedReviewDigest", "CHECKOUT_REVIEW_CHANGED",
]);
requireText("server/src/services/system-health.service.ts", [
  "checkoutFinalReviewHealth", "checkoutFinalReview",
]);
requireText("client/src/pages/Checkout.jsx", [
  "PHASE 76 · FINAL ORDER REVIEW", "Confirm exactly what Riseora will submit", "/orders/final-review",
  "CONFIRM FINAL REVIEW", "expectedReviewDigest", "verifyFinalOrderReview", "finalReviewConfirmed",
  "Riseora will reject the order/payment start if this server snapshot changes before mutation",
]);
requireText("client/src/pages/admin/AdminSystem.jsx", [
  "Phase 76 · Final order review integrity", "REVIEW SNAPSHOTS", "CHANGED AFTER REVIEW", "checkoutFinalReview",
]);
requireText("client/src/styles.css", [
  "phase76-final-review", "phase76-review-grid", "phase76-confirmed-note", "phase76-review-health-grid",
]);

const signature = read("server/src/services/checkout-review-signature.ts");
signature.includes("customer:") && signature.includes("address:") && signature.includes("items:") && signature.includes("pricing:") && signature.includes("delivery:")
  ? pass("final review digest covers customer, address, items, pricing and delivery") : fail("final review digest coverage");
signature.includes(".sort(") ? pass("final review digest uses deterministic item ordering") : fail("final review item ordering");

const checkoutService = read("server/src/services/checkout.service.ts");
const digestChecks = (checkoutService.match(/CHECKOUT_REVIEW_CHANGED/g) || []).length;
digestChecks >= 2 ? pass("COD and online reservation both enforce the confirmed review digest") : fail("review digest must be enforced for COD and online checkout");

const finalService = read("server/src/services/checkout-final-review.service.ts");
!/prisma\.[a-zA-Z0-9_]+\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/.test(finalService)
  ? pass("Phase 76 final review service remains read-only") : fail("Phase 76 final review service must not mutate commerce data");
!/(customerName|customerPhone|postalCode|digest):\s*input\./.test(finalService.split("export function checkoutFinalReviewHealth")[1] || "")
  ? pass("final review telemetry retains no customer/address/digest payload") : fail("final review telemetry privacy");

const checkout = read("client/src/pages/Checkout.jsx");
checkout.includes("setConfirmedReviewDigest(\"\")") && checkout.includes("confirmedReviewDigest !== latest?.digest")
  ? pass("customer confirmation resets when the final server review changes") : fail("final review change reset contract");
checkout.includes("verifyCheckoutReadiness()") && checkout.includes("verifyFinalOrderReview()")
  ? pass("Phase 57 preflight remains before Phase 76 mutation handoff") : fail("Phase 57 final preflight must remain authoritative");
checkout.includes("!finalReviewConfirmed") && checkout.includes("checkoutDisabled")
  ? pass("order/payment controls require explicit final review confirmation") : fail("explicit final review confirmation gate");

const schema = read("server/prisma/schema.prisma");
schema.includes("model AccountCart") && schema.includes("revision Int @default(1)")
  ? pass("Phase 76 leaves persistence schema unchanged") : fail("Phase 76 schema contract");
const migrationRoot = path.join(root, "server/prisma/migrations");
const migrationDirs = fs.readdirSync(migrationRoot).filter((name) => /^2026/.test(name)).sort();
migrationDirs.at(-1) === "20261006121500_phase69_account_saved_bag_v2"
  ? pass("Phase 69 migration remains schema head; Phase 76 adds no migration") : fail(`unexpected migration head: ${migrationDirs.at(-1)}`);

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["final-review:doctor"] || "").includes("phase76-checkout-final-review-audit.mjs") ? pass("final-review:doctor command") : fail("final-review:doctor command");
String(scripts["client:doctor"] || "").includes("final-review:doctor") ? pass("client:doctor includes Phase 76 gate") : fail("client:doctor Phase 76 gate");
String(scripts["verify:phase76"] || "").includes("performance:budget") && String(scripts["verify:phase76"] || "").includes("npm run build") ? pass("verify:phase76 command") : fail("verify:phase76 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase76") ? pass("prelaunch uses Phase 76 verification") : fail("prelaunch Phase 76 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase76") ? pass("production release advances to Phase 76") : fail("production release Phase 76 verification");

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

if (failures) { console.error(`\nPhase 76 final order review audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 76 final order review audit: PASS");
