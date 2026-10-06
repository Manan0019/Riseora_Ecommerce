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
  "server/src/services/notification-inbox.service.ts",
  "server/src/routes/notification.routes.ts",
  "server/src/services/system-health.service.ts",
  "client/src/context/NotificationContext.jsx",
  "client/src/components/NotificationBell.jsx",
  "client/src/pages/Notifications.jsx",
  "client/src/pages/admin/AdminSystem.jsx",
  "client/src/styles.css",
  "scripts/phase61-communication-center-audit.mjs",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/notification-inbox.service.ts", [
  "NotificationInboxCategory", "getNotificationCenter", "notificationNeedsAttention", "markNotificationSelectionRead", "clearReadNotifications", "adminNotificationHealth",
]);
requireText("server/src/routes/notification.routes.ts", [
  'router.get("/center"', 'router.patch("/read-filter"', 'router.delete("/read"', "getNotificationCenter",
]);
requireText("client/src/context/NotificationContext.jsx", [
  "/notifications/center?limit=80", "summary", "markFilteredRead", "clearRead",
]);
requireText("client/src/pages/Notifications.jsx", [
  "Updates & communication center", "Needs attention", "Communication choices", "Mark visible read", "Clear read", "/privacy-center",
]);
requireText("client/src/components/NotificationBell.jsx", ["summary.actionRequired", "Open communication center", "requiresAttention"]);
requireText("server/src/services/system-health.service.ts", ["adminNotificationHealth", "communications"]);
requireText("client/src/pages/admin/AdminSystem.jsx", ["PHASE 61 · CUSTOMER COMMUNICATION CONTROL", "Customer communications health", "Customers unread", "Oldest unread"]);
requireText("client/src/styles.css", ["phase61-inbox-summary", "phase61-filter-row", "phase61-communication-health"]);

const inbox = read("server/src/services/notification-inbox.service.ts");
inbox.includes('return item.type === "ORDER" || item.type === "SUPPORT" || item.type === "REFILL"')
  ? pass("attention queue is limited to service/action notification classes") : fail("attention queue classification");
inbox.includes('SHOPPING: ["PRICE_DROP", "STOCK_ALERT"]') && inbox.includes('RISEORA: ["GENERAL", "CAMPAIGN"]')
  ? pass("notification categories separate shopping and Riseora updates") : fail("notification category mapping");

const notifications = read("client/src/pages/Notifications.jsx");
notifications.includes('apiFetch("/privacy/preferences")') && notifications.includes("Essential service updates stay separate from optional marketing")
  ? pass("communication center clearly separates service updates from optional marketing") : fail("communication preference clarity");
notifications.includes('filter === "ATTENTION"') && notifications.includes("markFilteredRead({ actionableOnly: true })")
  ? pass("needs-attention filter supports bounded bulk mark-read") : fail("attention bulk-action contract");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["communication:doctor"] || "").includes("phase61-communication-center-audit.mjs") ? pass("communication:doctor command") : fail("communication:doctor command");
String(scripts["client:doctor"] || "").includes("communication:doctor") ? pass("client:doctor includes Phase 61 communication gate") : fail("client:doctor Phase 61 gate");
String(scripts["verify:phase61"] || "").includes("performance:budget") && String(scripts["verify:phase61"] || "").includes("npm run build") ? pass("verify:phase61 command") : fail("verify:phase61 command");
(String(scripts["prelaunch:check"] || "").includes("verify:phase61") || String(scripts["prelaunch:check"] || "").includes("verify:phase62") || String(scripts["prelaunch:check"] || "").includes("verify:phase63") || String(scripts["prelaunch:check"] || "").includes("verify:phase65") || String(scripts["prelaunch:check"] || "").includes("verify:phase67")) ? pass("prelaunch uses Phase 61+ verification") : fail("prelaunch Phase 61+ verification");
const prepare = read("scripts/phase49-release-prepare.mjs");
(prepare.includes("verify:phase61") || prepare.includes("verify:phase62") || prepare.includes("verify:phase63") || prepare.includes("verify:phase65") || prepare.includes("verify:phase67")) ? pass("production release advances to Phase 61+") : fail("production release Phase 61+ verification");

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
  console.error(`\nPhase 61 communication center audit: FAIL (${failures})`);
  process.exit(1);
}
console.log("\nPhase 61 communication center audit: PASS");
