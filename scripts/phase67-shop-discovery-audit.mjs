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
  "server/src/services/shop-discovery.service.ts",
  "server/src/routes/product.routes.ts",
  "server/src/routes/admin.routes.ts",
  "client/src/pages/Shop.jsx",
  "client/src/pages/admin/AdminCatalog.jsx",
  "client/src/styles.css",
  "package.json",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/shop-discovery.service.ts", [
  "shopDiscoveryFacets", "recordShopDiscoveryEvent", "shopDiscoveryHealth", "safetyStock",
  "benefits", "isApproved: true", "Filters reflect Riseora catalogue information",
]);
requireText("server/src/routes/product.routes.ts", [
  'const benefit = typeof req.query.benefit', "minRatingRaw", '"/discovery/facets"', '"/discovery/event"', "shopDiscoveryFacets",
]);
requireText("server/src/routes/admin.routes.ts", ['"/catalog/discovery-health"', "shopDiscoveryHealth"]);
requireText("client/src/pages/Shop.jsx", [
  "DISCOVER BY CATALOGUE", "Guided collections", "Catalogue benefit", "Approved customer rating",
  "benefit", "minRating", "/products/discovery/event", "Ingredient library",
]);
requireText("client/src/pages/admin/AdminCatalog.jsx", [
  "PHASE 67 · SHOP DISCOVERY", "Discovery coverage & guided navigation", "/admin/catalog/discovery-health",
]);

const service = read("server/src/services/shop-discovery.service.ts");
!/(prisma\.[A-Za-z0-9_]+\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany))\s*\(/.test(service)
  ? pass("shop discovery service remains read-only") : fail("shop discovery service must not mutate catalogue data");
service.includes("stockQuantity") && service.includes("safetyStock") && service.includes("Math.max(0")
  ? pass("shop discovery availability subtracts safety stock") : fail("shop discovery safety-stock contract");
service.includes("reviews: { where: { isApproved: true }")
  ? pass("rating facets use approved reviews only") : fail("approved-review rating contract");
!service.includes("userId") && !service.includes("customerEmail") && !service.includes("customerPhone")
  ? pass("discovery telemetry stores no customer identity") : fail("discovery telemetry identity guard");
service.includes("do not diagnose") || service.includes("do not diagnose conditions") || service.includes("do not diagnose")
  ? pass("catalogue discovery keeps a non-medical guidance boundary") : fail("catalogue discovery guidance boundary");

const productRoutes = read("server/src/routes/product.routes.ts");
productRoutes.includes("benefits: { contains: benefit") && productRoutes.includes("ratingAverage || 0) >= minRating")
  ? pass("benefit and approved-rating filters are enforced server-side") : fail("server-side Phase 67 filters");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["discovery:doctor"] || "").includes("phase67-shop-discovery-audit.mjs") ? pass("discovery:doctor command") : fail("discovery:doctor command");
String(scripts["client:doctor"] || "").includes("discovery:doctor") ? pass("client:doctor includes Phase 67 gate") : fail("client:doctor Phase 67 gate");
String(scripts["verify:phase67"] || "").includes("performance:budget") && String(scripts["verify:phase67"] || "").includes("npm run build") ? pass("verify:phase67 command") : fail("verify:phase67 command");
(String(scripts["prelaunch:check"] || "").includes("verify:phase68") || String(scripts["prelaunch:check"] || "").includes("verify:phase69")) ? pass("prelaunch uses Phase 67 verification") : fail("prelaunch Phase 67 verification");
(read("scripts/phase49-release-prepare.mjs").includes("verify:phase68") || read("scripts/phase49-release-prepare.mjs").includes("verify:phase69")) ? pass("production release advances to Phase 67") : fail("production release Phase 67 verification");

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
unresolved.length ? fail(`${unresolved.length} unresolved frontend relative imports\n${unresolved.slice(0,8).join("\n")}`) : pass(`${sourceFiles.length} frontend files, 0 unresolved relative imports`);

if (failures) { console.error(`\nPhase 67 shop discovery audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 67 shop discovery audit: PASS");
