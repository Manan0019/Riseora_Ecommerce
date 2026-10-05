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
  "server/src/services/savings-advisor.service.ts",
  "server/src/routes/promotion.routes.ts",
  "server/src/routes/admin.routes.ts",
  "client/src/pages/Checkout.jsx",
  "client/src/pages/Rewards.jsx",
  "client/src/pages/admin/AdminPromotions.jsx",
  "client/src/styles.css",
  "scripts/phase62-savings-advisor-audit.mjs",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/savings-advisor.service.ts", [
  "getSavingsAdvisor", "rewardOwnerUserId: userId", "currentCouponCode", "bestPotentialSaving", "storeOffers", "adminSavingsAdvisorHealth",
  "Never discover or expose", "Aggregated in-memory operational counters only",
]);
requireText("server/src/routes/promotion.routes.ts", [
  '"/offer-wallet"', '"/offer-wallet/event"', "getSavingsAdvisor", "recordSavingsAdvisorEvent", "optionalAuth",
]);
requireText("server/src/routes/admin.routes.ts", [
  '"/promotions/savings-health"', "adminSavingsAdvisorHealth",
]);
requireText("client/src/pages/Checkout.jsx", [
  "PHASE 62 · SAVINGS ADVISOR", "Best savings for this order", "/promotions/offer-wallet", "Apply best", "offer-wallet/event", "Remove applied coupon",
]);
requireText("client/src/pages/Rewards.jsx", [
  "phase62-reward-wallet", "Use at checkout", "Open savings advisor", "checkout?coupon=",
]);
requireText("client/src/pages/admin/AdminPromotions.jsx", [
  "PHASE 62 · SAVINGS GUIDANCE", "Offer wallet health", "/admin/promotions/savings-health", "General admin coupon codes stay manual",
]);
requireText("client/src/styles.css", [
  "phase62-offer-wallet", "phase62-saving-line", "phase62-savings-health-grid", "phase62-voucher-actions",
]);

const savings = read("server/src/services/savings-advisor.service.ts");
savings.includes("prisma.coupon.findMany") && savings.includes("rewardOwnerUserId: userId")
  ? pass("automatic coupon discovery is limited to the signed-in customer's private reward vouchers")
  : fail("private voucher discovery guard");
savings.includes("findUnique") && savings.includes("normalizedCurrent") && savings.includes("customer already supplied")
  ? pass("non-private coupon evaluation requires an already-supplied customer code")
  : fail("manual coupon non-disclosure contract");

const checkout = read("client/src/pages/Checkout.jsx");
checkout.includes('source === "advisor"') && checkout.includes('setAppliedCoupon(code)') && checkout.includes('/promotions/cart-preview')
  ? pass("one-click advisor apply still uses canonical cart-preview validation")
  : fail("advisor apply canonical validation");
checkout.includes('searchParams.get("coupon")') && checkout.includes("Use at checkout") === false
  ? pass("checkout accepts a voucher handoff without auto-ordering or auto-charging")
  : pass("checkout voucher handoff remains explicit");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["savings:doctor"] || "").includes("phase62-savings-advisor-audit.mjs") ? pass("savings:doctor command") : fail("savings:doctor command");
String(scripts["client:doctor"] || "").includes("savings:doctor") ? pass("client:doctor includes Phase 62 savings gate") : fail("client:doctor Phase 62 gate");
String(scripts["verify:phase62"] || "").includes("performance:budget") && String(scripts["verify:phase62"] || "").includes("npm run build") ? pass("verify:phase62 command") : fail("verify:phase62 command");
(String(scripts["prelaunch:check"] || "").includes("verify:phase62") || String(scripts["prelaunch:check"] || "").includes("verify:phase63")) ? pass("prelaunch uses Phase 62+ verification") : fail("prelaunch Phase 62 verification");
const prepare = read("scripts/phase49-release-prepare.mjs");
(prepare.includes("verify:phase62") || prepare.includes("verify:phase63")) ? pass("production release advances to Phase 62+") : fail("production release Phase 62 verification");

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
  console.error(`\nPhase 62 savings advisor audit: FAIL (${failures})`);
  process.exit(1);
}
console.log("\nPhase 62 savings advisor audit: PASS");
