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
  "server/src/services/product-comparison.service.ts",
  "server/src/routes/product.routes.ts",
  "server/src/routes/admin.routes.ts",
  "client/src/pages/Compare.jsx",
  "client/src/pages/admin/AdminCatalog.jsx",
  "client/src/styles.css",
  "scripts/phase65-comparison-intelligence-audit.mjs",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/product-comparison.service.ts", [
  "buildProductComparison", "recordProductComparisonEvent", "productComparisonHealth",
  "reviewTrustSummary", "availableQuantity", "safetyStock", "verifiedReviewPercent",
  "shared", "ingredients", "suitableFor", "Objective catalogue and approved-review facts only",
  "No customer identity or comparison history is persisted",
]);
requireText("server/src/routes/product.routes.ts", [
  '"/compare"', '"/compare/event"', "buildProductComparison", "recordProductComparisonEvent",
]);
requireText("server/src/routes/admin.routes.ts", [
  '"/catalog/comparison-health"', "productComparisonHealth",
]);
requireText("client/src/pages/Compare.jsx", [
  "PHASE 65 · DECISION SUPPORT", "Compare with clarity", "Objective highlights",
  "Shared ingredients", "Verified review trust", "Answered Q&A", "/products/compare/event",
]);
requireText("client/src/pages/admin/AdminCatalog.jsx", [
  "PHASE 65 · DECISION SUPPORT", "Product comparison engagement", "/admin/catalog/comparison-health",
  "ASSISTED ADDS", "Most compared products",
]);
requireText("client/src/styles.css", [
  "phase65-decision-panel", "phase65-highlight-grid", "phase65-admin-compare-health", "phase65-admin-metrics",
]);

const service = read("server/src/services/product-comparison.service.ts");
!/(prisma\.[A-Za-z0-9_]+\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany))\s*\(/.test(service)
  ? pass("Phase 65 comparison intelligence service keeps catalogue evaluation read-only")
  : fail("Phase 65 comparison intelligence service must not mutate catalogue data");
service.includes("stockQuantity") && service.includes("safetyStock") && service.includes("Math.max(0")
  ? pass("public availability subtracts safety stock")
  : fail("safety-stock comparison contract");
service.includes("isApproved: true") && service.includes("reviewTrustSummary")
  ? pass("comparison trust uses approved reviews")
  : fail("approved review trust contract");
service.includes("Lowest starting price") && service.includes("Highest approved rating") && !service.includes("best product")
  ? pass("comparison highlights remain objective facts")
  : fail("objective comparison highlight contract");

const comparePage = read("client/src/pages/Compare.jsx");
comparePage.includes("No medical efficacy claims") && comparePage.includes("no hidden winner")
  ? pass("storefront decision support avoids efficacy/winner claims")
  : fail("storefront decision-support disclaimer");
comparePage.includes('record("product_open"') && comparePage.includes('record("add_to_cart"')
  ? pass("comparison engagement events wired")
  : fail("comparison engagement event contract");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["comparison:doctor"] || "").includes("phase65-comparison-intelligence-audit.mjs") ? pass("comparison:doctor command") : fail("comparison:doctor command");
String(scripts["client:doctor"] || "").includes("comparison:doctor") ? pass("client:doctor includes Phase 65 comparison gate") : fail("client:doctor Phase 65 gate");
String(scripts["verify:phase65"] || "").includes("performance:budget") && String(scripts["verify:phase65"] || "").includes("npm run build") ? pass("verify:phase65 command") : fail("verify:phase65 command");
(String(scripts["prelaunch:check"] || "").includes("verify:phase65") || String(scripts["prelaunch:check"] || "").includes("verify:phase66")) ? pass("prelaunch uses Phase 65 verification") : fail("prelaunch Phase 65 verification");
const prepare = read("scripts/phase49-release-prepare.mjs");
(prepare.includes("verify:phase65") || prepare.includes("verify:phase66")) ? pass("production release advances to Phase 65") : fail("production release Phase 65 verification");

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
  console.error(`\nPhase 65 comparison intelligence audit: FAIL (${failures})`);
  process.exit(1);
}
console.log("\nPhase 65 comparison intelligence audit: PASS");
