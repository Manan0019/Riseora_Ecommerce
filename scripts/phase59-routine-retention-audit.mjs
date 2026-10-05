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
  "server/src/services/routine-intelligence.service.ts",
  "server/src/routes/refill.routes.ts",
  "server/src/routes/retention.routes.ts",
  "client/src/pages/Refills.jsx",
  "client/src/pages/Rewards.jsx",
  "client/src/pages/admin/AdminRetention.jsx",
  "client/src/styles.css",
  "scripts/phase59-routine-retention-audit.mjs",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/routine-intelligence.service.ts", [
  "getRoutineForecast", "getRoutineRetentionSummary", 'status: "DELIVERED"', "replenishmentEnabled", "suggestedIntervalDays",
  "nextSuggestedAt", "availableToSell", "reminderAligned", "nearRewardCustomers",
]);
requireText("server/src/routes/refill.routes.ts", ['"/intelligence"', "getRoutineForecast"]);
requireText("server/src/routes/retention.routes.ts", ['"/routine-intelligence"', "getRoutineRetentionSummary"]);
requireText("client/src/pages/Refills.jsx", [
  "ROUTINE FORECAST", "Your likely next refills", "SET SMART REMINDER", "USE SUGGESTED TIMING", "SMART TIMING ACTIVE",
  "Nothing is ordered automatically", "/refills/intelligence",
]);
requireText("client/src/pages/Rewards.jsx", ["LOYALTY MOMENTUM", "rewardProgress", "estimatedSpendToVoucher"]);
requireText("client/src/pages/admin/AdminRetention.jsx", [
  "PHASE 59 · ROUTINE INTELLIGENCE", "Retention opportunities", "ACTIVE REMINDERS", "NEAR REWARD", "/admin/retention/routine-intelligence",
]);
requireText("client/src/styles.css", ["phase59-routine-forecast", "phase59-loyalty-momentum", "phase59-retention-metrics"]);

const routine = read("server/src/services/routine-intelligence.service.ts");
routine.includes("median(intervals)") && routine.includes("product.replenishmentDays")
  ? pass("routine timing learns from delivered history with product-cadence fallback") : fail("routine timing contract");
routine.includes('where: { userId, status: "DELIVERED" }') && routine.includes("isComplimentary: false")
  ? pass("routine forecast uses delivered non-complimentary purchases") : fail("routine delivered-order contract");
routine.includes("status: { not: \"CANCELLED\" }") && routine.includes("reminderByVariant")
  ? pass("existing reminder state is merged into forecast") : fail("routine reminder-merge contract");

const refills = read("client/src/pages/Refills.jsx");
refills.includes('apiFetch("/refills", { method: "POST"') || refills.includes('apiFetch("/refills", { method: "POST",')
  ? pass("smart timing reuses existing reminder API") : fail("smart timing reminder API reuse");
refills.includes("addItems([{ product: item.product, variant: item.variant")
  ? pass("routine refill stays customer-confirmed through cart") : fail("routine customer-control contract");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["routine:doctor"] || "").includes("phase59-routine-retention-audit.mjs") ? pass("routine:doctor command") : fail("routine:doctor command");
String(scripts["client:doctor"] || "").includes("routine:doctor") ? pass("client:doctor includes Phase 59 routine gate") : fail("client:doctor Phase 59 gate");
(["verify:phase59", "verify:phase60", "verify:phase61", "verify:phase62", "verify:phase63"].some((key) => String(scripts[key] || "").includes("performance:budget") && String(scripts[key] || "").includes("npm run build"))) ? pass("verify:phase59 command") : fail("verify:phase59 command");
["verify:phase59", "verify:phase60", "verify:phase61", "verify:phase62", "verify:phase63"].some((token) => String(scripts["prelaunch:check"] || "").includes(token)) ? pass("prelaunch includes Phase 59+ verification") : fail("prelaunch Phase 59+ verification");
const prepare = read("scripts/phase49-release-prepare.mjs");
prepare.includes('verify:phase63') || prepare.includes('verify:phase62') || prepare.includes('verify:phase61') || prepare.includes('verify:phase60') || prepare.includes('verify:phase59') ? pass("production release includes Phase 59+ verification") : fail("production release Phase 59+ verification");

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
  console.error(`\nPhase 59 routine retention audit: FAIL (${failures})`);
  process.exit(1);
}
console.log("\nPhase 59 routine retention audit: PASS");
