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
  "server/src/services/saved-shopping.service.ts",
  "server/src/routes/wishlist.routes.ts",
  "server/src/routes/admin.routes.ts",
  "client/src/pages/Wishlist.jsx",
  "client/src/pages/admin/AdminCatalog.jsx",
  "client/src/styles.css",
  "package.json",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/saved-shopping.service.ts", [
  "getSavedShoppingIntelligence", "savedShoppingHealth", "recordSavedShoppingEvent", "safetyStock",
  "Price and stock watches start only after an explicit customer action", "Aggregate catalogue and watch counts only",
]);
requireText("server/src/routes/wishlist.routes.ts", [
  '"/intelligence"', '"/event"', "getSavedShoppingIntelligence", "recordSavedShoppingEvent",
  'z.enum(["view", "product_open", "alert_create", "add"])',
]);
requireText("server/src/routes/admin.routes.ts", ['"/catalog/saved-shopping-health"', "savedShoppingHealth"]);
requireText("client/src/pages/Wishlist.jsx", [
  "PHASE 68 · SAVED SHOPPING INTELLIGENCE", "Your saved-shopping watchlist", "/wishlist/intelligence",
  "/wishlist/event", "WATCH ANY PRICE DROP", "NOTIFY WHEN AVAILABLE", "Saving a product never starts a price or stock alert automatically",
]);
requireText("client/src/pages/admin/AdminCatalog.jsx", [
  "PHASE 68 · SAVED SHOPPING", "Wishlist & watchlist health", "/admin/catalog/saved-shopping-health",
  "PRICE WATCHES", "STOCK WATCHES", "ASSISTED ADDS · 60M",
]);
requireText("client/src/styles.css", ["phase68-saved-intelligence", "phase68-decision", "phase68-admin-saved-health"]);

const service = read("server/src/services/saved-shopping.service.ts");
!/(prisma\.[A-Za-z0-9_]+\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany))\s*\(/.test(service)
  ? pass("Phase 68 saved-shopping intelligence service remains read-only") : fail("saved-shopping intelligence must not mutate persistent data");
service.includes("stockQuantity") && service.includes("safetyStock") && service.includes("Math.max(0")
  ? pass("saved-shopping availability subtracts safety stock") : fail("saved-shopping safety-stock contract");
!service.includes("customerPhone") && !service.includes("customerName") && !service.includes("recentProducts")
  ? pass("saved-shopping engagement telemetry does not persist customer browsing identity") : fail("saved-shopping telemetry privacy guard");

const wishlist = read("client/src/pages/Wishlist.jsx");
const explicitPrice = wishlist.includes('apiFetch(isPrice ? "/price-alerts" : "/stock-alerts"') && wishlist.includes('onClick={() => startWatch(info)}');
explicitPrice ? pass("price/stock watches require explicit wishlist button action") : fail("watch creation must remain explicit");
!wishlist.includes("useEffect(() => startWatch") && !wishlist.includes("toggle(product); startWatch")
  ? pass("saving a wishlist product does not auto-subscribe alerts") : fail("wishlist must never auto-subscribe alerts");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["saved-shopping:doctor"] || "").includes("phase68-saved-shopping-audit.mjs") ? pass("saved-shopping:doctor command") : fail("saved-shopping:doctor command");
String(scripts["client:doctor"] || "").includes("saved-shopping:doctor") ? pass("client:doctor includes Phase 68 gate") : fail("client:doctor Phase 68 gate");
String(scripts["verify:phase68"] || "").includes("performance:budget") && String(scripts["verify:phase68"] || "").includes("npm run build") ? pass("verify:phase68 command") : fail("verify:phase68 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase68") ? pass("prelaunch uses Phase 68 verification") : fail("prelaunch Phase 68 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase68") ? pass("production release advances to Phase 68") : fail("production release Phase 68 verification");

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

if (failures) { console.error(`\nPhase 68 saved shopping audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 68 saved shopping audit: PASS");
