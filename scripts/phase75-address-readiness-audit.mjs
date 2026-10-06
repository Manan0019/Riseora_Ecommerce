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
  "server/src/services/address-readiness.service.ts",
  "server/src/routes/order.routes.ts",
  "server/src/routes/account.routes.ts",
  "server/src/routes/admin-ops.routes.ts",
  "client/src/pages/Checkout.jsx",
  "client/src/pages/Account.jsx",
  "client/src/pages/admin/AdminFulfilment.jsx",
  "client/src/styles.css",
  "package.json",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/address-readiness.service.ts", [
  "getAddressReadiness", "addressReadinessHealth", "resolveShippingZone", "CITY_ZONE_REVIEW", "STATE_ZONE_REVIEW",
  "PHONE_REVIEW", "ADDRESS_DETAIL_REVIEW", "Use verified city/state",
  "Address readiness checks format and configured delivery-area consistency only",
  "Customer identity, phone numbers, PIN codes and address text are not retained in telemetry",
]);
requireText("server/src/routes/order.routes.ts", [
  '"/address-readiness"', "addressReadinessSchema", "getAddressReadiness", "optionalAuth",
]);
requireText("server/src/routes/account.routes.ts", [
  'regex(/^\\d{6}$/, "Enter a valid 6-digit PIN code")', '"/addresses/from-checkout"',
]);
requireText("server/src/routes/admin-ops.routes.ts", [
  "addressReadinessHealth", "addressReadinessHealth: addressHealth", '"/fulfilment/overview"',
]);
requireText("client/src/pages/Checkout.jsx", [
  "PHASE 75 · ADDRESS READINESS", "Delivery details quality check", "/orders/address-readiness",
  "USE VERIFIED CITY/STATE", "addressReadinessBlocking", "verifyAddressReadiness",
  "Final Checkout validation will still run before order or payment creation",
]);
requireText("client/src/pages/Account.jsx", [
  'pattern="[0-9]{6}"', 'maxLength="6"', 'postalCode: e.target.value.replace(/\\D/g, "").slice(0, 6)',
]);
requireText("client/src/pages/admin/AdminFulfilment.jsx", [
  "PHASE 75 · ADDRESS QUALITY", "Saved-address & checkout readiness", "6-DIGIT PIN READY",
  "CONTACT READY", "AREA MISMATCH · 60M",
]);
requireText("client/src/styles.css", [
  "phase75-address-readiness", "phase75-address-checks", "phase75-area-suggestion",
  "phase75-address-health", "phase75-address-health-grid",
]);

const service = read("server/src/services/address-readiness.service.ts");
!/prisma\.[a-zA-Z0-9_]+\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/.test(service)
  ? pass("Phase 75 address readiness service remains read-only") : fail("Phase 75 address readiness service must not mutate customer/commerce data");
service.includes("resolveShippingZone(postalCode)") && service.includes("suggestedCity") && service.includes("suggestedState")
  ? pass("PIN locality guidance reuses configured shipping-zone data") : fail("address locality guidance must reuse shipping zones");
service.includes('severity: "REVIEW"') && service.includes("ready = blockers.length === 0")
  ? pass("quality warnings stay non-blocking unless canonical required fields fail") : fail("address review/blocking separation");
service.includes("readinessEvents.push") && !/readinessEvents\.push\([^\n]*(customer|phone|postal|line1)/i.test(service)
  ? pass("address readiness telemetry stores no customer/address payload") : fail("address readiness telemetry privacy");

const checkout = read("client/src/pages/Checkout.jsx");
checkout.includes("addressReadiness?.ready === false") && checkout.includes("!contactReady") && checkout.includes("!addressReady")
  ? pass("Checkout blocks structurally incomplete delivery details") : fail("Checkout address blocking contract");
checkout.includes("/orders/checkout-readiness") && checkout.includes("verifyCheckoutReadiness")
  ? pass("Phase 57 final checkout readiness remains authoritative") : fail("Phase 57 final readiness must remain");
checkout.includes("addressReadiness.suggestion") && checkout.includes("setForm((current) => ({ ...current, city: suggestion.city || current.city, state: suggestion.state || current.state }))")
  ? pass("verified city/state correction remains explicit customer action") : fail("verified locality correction contract");

const schema = read("server/prisma/schema.prisma");
schema.includes("model AccountCart") && schema.includes("revision Int @default(1)")
  ? pass("Phase 75 leaves persistence schema unchanged") : fail("Phase 75 schema contract");
const migrationRoot = path.join(root, "server/prisma/migrations");
const migrationDirs = fs.readdirSync(migrationRoot).filter((name) => /^2026/.test(name)).sort();
migrationDirs.at(-1) === "20261006121500_phase69_account_saved_bag_v2"
  ? pass("Phase 69 migration remains schema head; Phase 75 adds no migration") : fail(`unexpected migration head: ${migrationDirs.at(-1)}`);

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["address:doctor"] || "").includes("phase75-address-readiness-audit.mjs") ? pass("address:doctor command") : fail("address:doctor command");
String(scripts["client:doctor"] || "").includes("address:doctor") ? pass("client:doctor includes Phase 75 gate") : fail("client:doctor Phase 75 gate");
String(scripts["verify:phase75"] || "").includes("performance:budget") && String(scripts["verify:phase75"] || "").includes("npm run build") ? pass("verify:phase75 command") : fail("verify:phase75 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase75") ? pass("prelaunch uses Phase 75 verification") : fail("prelaunch Phase 75 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase75") ? pass("production release advances to Phase 75") : fail("production release Phase 75 verification");

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

if (failures) { console.error(`\nPhase 75 address readiness audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 75 address readiness audit: PASS");
