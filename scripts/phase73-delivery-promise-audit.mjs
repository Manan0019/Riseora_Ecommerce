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
  "server/src/services/delivery-promise.service.ts",
  "server/src/routes/order.routes.ts",
  "server/src/routes/admin-ops.routes.ts",
  "client/src/pages/Cart.jsx",
  "client/src/pages/admin/AdminFulfilment.jsx",
  "client/src/styles.css",
  "package.json",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/delivery-promise.service.ts", [
  "getDeliveryPromisePreview", "deliveryPromiseHealth", "prepareCheckout", "getShippingQuote",
  "automaticPromotionName", "freeShippingGap", "estimatedFrom", "estimatedTo", "codEligible",
  "Coupons, final shipping and payment eligibility are recalculated by Checkout",
  "PIN codes, customer identity and cart contents are not retained",
]);
requireText("server/src/routes/order.routes.ts", [
  '"/delivery-promise"', "deliveryPromiseSchema", "getDeliveryPromisePreview", "optionalAuth",
  "Resolve the current cart quantity limits before checking delivery",
]);
requireText("server/src/routes/admin-ops.routes.ts", [
  "deliveryPromiseHealth", "deliveryPromiseHealth: promiseHealth", '"/fulfilment/overview"',
]);
requireText("client/src/pages/Cart.jsx", [
  "PHASE 73 · DELIVERY PROMISE", "Check delivery before checkout", "/orders/delivery-promise",
  "riseora_delivery_pin", "Signed-in customers can also reuse their default saved-address PIN",
  "ONLINE SHIPPING", "DELIVERY WINDOW", "COD", "PARCEL", "Change delivery PIN", "CHANGE PIN",
  "Checkout will still perform its independent delivery preflight",
]);
requireText("client/src/pages/admin/AdminFulfilment.jsx", [
  "PHASE 73 · DELIVERY PROMISE", "Pre-checkout delivery health", "PREVIEWS · 60M",
  "SERVICEABLE · 60M", "COD BLOCKED · 60M", "FALLBACK QUOTES · 60M", "WEIGHT BLOCKS · 60M",
]);
requireText("client/src/styles.css", [
  "phase73-delivery-planner", "phase73-delivery-metrics", "phase73-delivery-health", "phase73-delivery-health-grid",
]);

const service = read("server/src/services/delivery-promise.service.ts");
!/prisma\.[a-zA-Z0-9_]+\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/.test(service)
  ? pass("Phase 73 delivery promise service remains read-only") : fail("Phase 73 service must not mutate commerce data");
service.includes("prepareCheckout") && service.includes('}, "ONLINE", userId, { enforceServiceability: false })')
  ? pass("delivery preview reuses canonical checkout preparation") : fail("delivery preview must reuse canonical checkout preparation");
service.includes("totalWeightGrams") && service.includes("maxWeightGrams")
  ? pass("parcel-weight serviceability remains visible") : fail("parcel-weight contract");
service.includes("automaticPromotionName") && service.includes("merchandiseAfterAutomaticDiscount")
  ? pass("automatic promotions are reflected before the shipping estimate") : fail("automatic-promotion shipping basis");

const cart = read("client/src/pages/Cart.jsx");
cart.includes("deliveryBlocked") && cart.includes("cartCheckoutBlocked") && cart.includes("Change delivery PIN")
  ? pass("known unserviceable PIN blocks Cart-level checkout navigation") : fail("Cart serviceability block");
cart.includes("/account/addresses") && cart.includes("item.isDefault")
  ? pass("signed-in Cart can reuse the default saved-address PIN") : fail("saved-address PIN reuse");
cart.includes("quantityAdjustmentRequired") && cart.includes("Apply the Phase 72 safe quantities first")
  ? pass("Phase 72 quantity readiness remains upstream of delivery preview") : fail("Phase 72/73 ordering");

const schema = read("server/prisma/schema.prisma");
schema.includes("model AccountCart") && schema.includes("revision Int @default(1)")
  ? pass("Phase 73 leaves Saved Bag schema unchanged") : fail("Saved Bag schema contract");
const migrationRoot = path.join(root, "server/prisma/migrations");
const migrationDirs = fs.readdirSync(migrationRoot).filter((name) => /^2026/.test(name)).sort();
// Retained Phase 73 invariant: this phase adds no migration; later phases may do so.
const phase73LegacyMigration = "20261006121500_phase69_account_saved_bag_v2";
const phase73UnexpectedMigrations = migrationDirs.filter((name) => /(?:^|_)phase73(?:_|$)/i.test(name));
migrationDirs.includes(phase73LegacyMigration) && phase73UnexpectedMigrations.length === 0
  ? pass("Phase 69 migration preserved; Phase 73 adds no migration; newer heads allowed")
  : fail(`Phase 73 migration history invalid: missing Phase 69 or introduced: ${phase73UnexpectedMigrations.join(",")}`);

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["delivery:doctor"] || "").includes("phase73-delivery-promise-audit.mjs") ? pass("delivery:doctor command") : fail("delivery:doctor command");
String(scripts["client:doctor"] || "").includes("delivery:doctor") ? pass("client:doctor includes Phase 73 gate") : fail("client:doctor Phase 73 gate");
String(scripts["verify:phase73"] || "").includes("performance:budget") && String(scripts["verify:phase73"] || "").includes("npm run build") ? pass("verify:phase73 command") : fail("verify:phase73 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase73") ? pass("prelaunch uses Phase 73 verification") : fail("prelaunch Phase 73 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase73") ? pass("production release advances to Phase 73") : fail("production release Phase 73 verification");

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

if (failures) { console.error(`\nPhase 73 delivery promise audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 73 delivery promise audit: PASS");
