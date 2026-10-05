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
  "server/src/services/account-lifecycle.service.ts",
  "server/src/routes/account.routes.ts",
  "server/src/routes/retention.routes.ts",
  "client/src/pages/Account.jsx",
  "client/src/pages/admin/AdminRetention.jsx",
  "client/src/styles.css",
  "scripts/phase60-customer-lifecycle-hub-audit.mjs",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/account-lifecycle.service.ts", [
  "getAccountLifecycleHub", "getCustomerLifecyclePulse", "ACTIVE_ORDER_STATUSES", "OPEN_RETURN_STATUSES", "OPEN_SUPPORT_STATUSES",
  "getRoutineForecast", "rewardVoucherPoints", "unreadNotifications", "wishlistCount", "activeAlerts", "actions.slice(0, 6)",
]);
requireText("server/src/routes/account.routes.ts", ['"/lifecycle"', "getAccountLifecycleHub"]);
requireText("server/src/routes/retention.routes.ts", ['"/customer-lifecycle-pulse"', "getCustomerLifecyclePulse"]);
requireText("client/src/pages/Account.jsx", [
  "/account/lifecycle", "YOUR RISEORA TODAY", "What needs your attention", "phase60-lifecycle-stats", "phase60-next-actions",
]);
requireText("client/src/pages/admin/AdminRetention.jsx", [
  "/admin/retention/customer-lifecycle-pulse", "PHASE 60 · CUSTOMER LIFECYCLE HUB", "Customer attention pulse", "ACTIVE ORDERS", "OPEN SUPPORT",
]);
requireText("client/src/styles.css", ["phase60-lifecycle-hub", "phase60-next-actions", "phase60-retention-metrics"]);

const lifecycle = read("server/src/services/account-lifecycle.service.ts");
lifecycle.includes('status: { in: [...ACTIVE_ORDER_STATUSES] }') && lifecycle.includes('status: { in: [...OPEN_RETURN_STATUSES] }')
  ? pass("next-best-action engine uses live order and aftercare state") : fail("live lifecycle-state contract");
lifecycle.includes('status === "WAITING_CUSTOMER"') && lifecycle.includes('priority: 97')
  ? pass("support waiting-for-customer receives high attention priority") : fail("support attention priority");
lifecycle.includes('routine.products?.find') && lifecycle.includes('ctaUrl: "/refills"')
  ? pass("routine forecast is reused for refill next-best actions") : fail("routine next-best-action reuse");
lifecycle.includes('rewardBalance >= voucherPoints') && lifecycle.includes('ctaUrl: "/rewards"')
  ? pass("reward readiness is surfaced without duplicating rewards logic") : fail("reward next-best-action contract");
lifecycle.includes('if (!actions.length)') && lifecycle.includes('YOU\'RE ALL CAUGHT UP')
  ? pass("lifecycle hub has a safe no-urgent-action state") : fail("lifecycle empty-state contract");

const account = read("client/src/pages/Account.jsx");
account.includes('apiFetch("/account/lifecycle")') && account.includes('.catch(() => setLifecycle(null))')
  ? pass("lifecycle hub fails soft without breaking My Riseora") : fail("account lifecycle soft-failure contract");
account.includes('id="profile"') && account.includes('id="delivery"')
  ? pass("next-best-action anchors target account setup sections") : fail("account action-anchor contract");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["lifecycle:doctor"] || "").includes("phase60-customer-lifecycle-hub-audit.mjs") ? pass("lifecycle:doctor command") : fail("lifecycle:doctor command");
String(scripts["client:doctor"] || "").includes("lifecycle:doctor") ? pass("client:doctor includes Phase 60 lifecycle gate") : fail("client:doctor Phase 60 gate");
(["verify:phase60", "verify:phase61", "verify:phase62", "verify:phase63"].some((key) => String(scripts[key] || "").includes("performance:budget") && String(scripts[key] || "").includes("npm run build"))) ? pass("verify:phase60+ command") : fail("verify:phase60+ command");
(["verify:phase60", "verify:phase61", "verify:phase62", "verify:phase63"].some((token) => String(scripts["prelaunch:check"] || "").includes(token))) ? pass("prelaunch uses Phase 60+ verification") : fail("prelaunch Phase 60+ verification");
const prepare = read("scripts/phase49-release-prepare.mjs");
(prepare.includes("verify:phase63") || prepare.includes("verify:phase62") || prepare.includes("verify:phase61") || prepare.includes("verify:phase60")) ? pass("production release advances to Phase 60+") : fail("production release Phase 60+ verification");

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
  console.error(`\nPhase 60 customer lifecycle hub audit: FAIL (${failures})`);
  process.exit(1);
}
console.log("\nPhase 60 customer lifecycle hub audit: PASS");
