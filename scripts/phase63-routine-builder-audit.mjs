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
  "server/src/services/routine-builder.service.ts",
  "server/src/routes/product.routes.ts",
  "server/src/routes/deal.routes.ts",
  "client/src/pages/RoutineBuilder.jsx",
  "client/src/pages/ProductDetails.jsx",
  "client/src/pages/admin/AdminMerchandising.jsx",
  "client/src/styles.css",
  "scripts/phase63-routine-builder-audit.mjs",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/routine-builder.service.ts", [
  "getRoutineGuidance", "previewRoutineSelections", "routineBuilderEngagementSnapshot", "safetyStock", "maxPurchaseQuantity",
  "Routine guidance is catalogue relevance only and is not medical advice", "Aggregated in-memory routine-builder counters only",
]);
requireText("server/src/routes/product.routes.ts", [
  '"/routine/intelligence"', '"/routine/preview"', '"/routine/event"', "getRoutineGuidance", "previewRoutineSelections",
]);
requireText("server/src/routes/deal.routes.ts", [
  '"/merchandising/routine-health"', "routineBuilderEngagementSnapshot",
]);
requireText("client/src/pages/RoutineBuilder.jsx", [
  "PHASE 63 · SMART ROUTINE BUILDER", "GUIDED COMPANIONS", "/products/routine/intelligence", "/products/routine/preview",
  "ADD ROUTINE TO CART", "below current MRP", "Additional coupons or automatic deals are calculated later by Checkout",
]);
requireText("client/src/pages/ProductDetails.jsx", [
  "routine-builder?seed=", "BUILD A ROUTINE",
]);
requireText("client/src/pages/admin/AdminMerchandising.jsx", [
  "PHASE 63 · ROUTINE MERCHANDISING", "Routine builder engagement", "/admin/merchandising/routine-health", "ROUTINE ADDS",
]);
requireText("client/src/styles.css", [
  "phase63-guided-panel", "phase63-guided-grid", "phase63-price-review", "phase63-routine-health-grid",
]);

const service = read("server/src/services/routine-builder.service.ts");
service.includes("stockQuantity") && service.includes("safetyStock") && service.includes("publicStock")
  ? pass("routine preview uses public stock after safety stock")
  : fail("routine preview public-stock contract");
service.includes("catalogSavings") && service.includes("mrpTotal") && service.includes("merchandiseTotal")
  ? pass("routine savings are transparent MRP-vs-selling-price values")
  : fail("routine price transparency contract");
!/(prisma\.[A-Za-z0-9_]+\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany))\s*\(/.test(service)
  ? pass("routine intelligence service has no database mutation")
  : fail("routine intelligence service must stay read-only");

const page = read("client/src/pages/RoutineBuilder.jsx");
page.includes("apiFetch(\"/products/routine/preview\"") && page.indexOf("/products/routine/preview") < page.indexOf("addItems(entries)")
  ? pass("routine cart add is preceded by live server preview")
  : fail("live preview must run before routine cart add");
page.includes("guide.seedProduct") && page.includes("useSearchParams")
  ? pass("product-detail seed handoff is consumed by Routine Builder")
  : fail("seed handoff contract");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["routine-builder:doctor"] || "").includes("phase63-routine-builder-audit.mjs") ? pass("routine-builder:doctor command") : fail("routine-builder:doctor command");
String(scripts["client:doctor"] || "").includes("routine-builder:doctor") ? pass("client:doctor includes Phase 63 routine gate") : fail("client:doctor Phase 63 gate");
(["verify:phase63", "verify:phase64"].some((key) => String(scripts[key] || "").includes("performance:budget") && String(scripts[key] || "").includes("npm run build"))) ? pass("verify:phase63 command") : fail("verify:phase63 command");
(["verify:phase63", "verify:phase64"].some((token) => String(scripts["prelaunch:check"] || "").includes(token))) ? pass("prelaunch uses Phase 63 verification") : fail("prelaunch Phase 63 verification");
const prepare = read("scripts/phase49-release-prepare.mjs");
(prepare.includes("verify:phase63") || prepare.includes("verify:phase64")) ? pass("production release advances to Phase 63") : fail("production release Phase 63 verification");

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
  console.error(`\nPhase 63 smart routine builder audit: FAIL (${failures})`);
  process.exit(1);
}
console.log("\nPhase 63 smart routine builder audit: PASS");
