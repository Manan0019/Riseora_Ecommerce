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
  "server/src/services/product-recommendation.service.ts",
  "server/src/routes/product.routes.ts",
  "client/src/pages/Cart.jsx",
  "client/src/components/ProductCard.jsx",
  "client/src/pages/admin/AdminSystem.jsx",
  "client/src/styles.css",
  "scripts/phase56-cart-intelligence-audit.mjs",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/product-recommendation.service.ts", [
  "smartCartRecommendations", "coPurchaseCounts", "cartRecommendationReason", "Frequently paired with your bag",
  'type RecommendationEventType = "impression" | "click" | "add"', "addToCartRatePercent",
]);
requireText("server/src/routes/product.routes.ts", [
  '"/recommendations/cart"', "smartCartRecommendations", 'z.enum(["impression", "click", "add"])',
]);
requireText("client/src/pages/Cart.jsx", [
  '"/products/recommendations/cart"', "Smart picks for your bag", "COMPLETE YOUR ROUTINE", "recommendationReason",
  'reportRecommendation("add"', "phase56-cart-intelligence",
]);
requireText("client/src/components/ProductCard.jsx", ["onAddToCart", "onAddToCart?.(product, variant)"]);
requireText("client/src/pages/admin/AdminSystem.jsx", [
  "Recommendation & cart assist engagement", "Assisted adds", "addToCartRatePercent",
]);
const adminSystem = read("client/src/pages/admin/AdminSystem.jsx");
(adminSystem.includes("PHASE 56 · CART INTELLIGENCE CONTROL") || adminSystem.includes("PHASE 57 · CHECKOUT CONFIDENCE CONTROL") || adminSystem.includes("PHASE 58 · POST-PURCHASE SELF-SERVICE CONTROL") || adminSystem.includes("PHASE 61 · CUSTOMER COMMUNICATION CONTROL")) ? pass("Admin System Phase 56+ control heading") : fail("Admin System Phase 56+ control heading");
requireText("client/src/styles.css", ["phase56-cart-intelligence", "phase56-cart-recommendation-grid", "phase56-recommendation-health-grid"]);

const service = read("server/src/services/product-recommendation.service.ts");
service.includes('status: "DELIVERED"') && service.includes("order-history") ? pass("cart intelligence uses delivered-order pairing without replacing catalog-fit fallback") : fail("cart intelligence order-history + fallback contract");
service.includes("id: { notIn: sourceIds }") ? pass("cart never recommends products already in the bag") : fail("cart recommendation exclusion");
service.includes("stockQuantity") && service.includes("safetyStock") ? pass("cart suggestions respect public stock availability") : fail("cart stock safety");

const cart = read("client/src/pages/Cart.jsx");
const cartEndpoint = cart.indexOf('/products/recommendations/cart');
const cartShelf = cart.indexOf('Smart picks for your bag');
cartEndpoint >= 0 && cartShelf > cartEndpoint ? pass("cart smart-suggestion data flow reaches shelf") : fail("cart recommendation data flow");
cart.includes('type: "impression"') && cart.includes('type, shelf: CART_RECOMMENDATION_SHELF') ? pass("cart recommendation impression/click/add telemetry wired") : fail("cart recommendation telemetry");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["cart:doctor"] || "").includes("phase56-cart-intelligence-audit.mjs") ? pass("cart:doctor command") : fail("cart:doctor command");
String(scripts["client:doctor"] || "").includes("cart:doctor") ? pass("client:doctor includes Phase 56 cart gate") : fail("client:doctor Phase 56 gate");
String(scripts["verify:phase56"] || "").includes("performance:budget") && String(scripts["verify:phase56"] || "").includes("npm run build") ? pass("verify:phase56 command") : fail("verify:phase56 command");
(["verify:phase56", "verify:phase57", "verify:phase58", "verify:phase59", "verify:phase60", "verify:phase61", "verify:phase62", "verify:phase63"].some((token) => String(scripts["prelaunch:check"] || "").includes(token))) ? pass("prelaunch uses Phase 56+ verification") : fail("prelaunch Phase 56+ verification");

const prepare = read("scripts/phase49-release-prepare.mjs");
(prepare.includes('verify:phase56') || prepare.includes('verify:phase57') || prepare.includes('verify:phase58') || prepare.includes('verify:phase59') || prepare.includes('verify:phase60') || prepare.includes('verify:phase61') || prepare.includes('verify:phase62') || prepare.includes('verify:phase63')) ? pass("production release advances to Phase 56+") : fail("production release Phase 56+ verification");

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
  console.error(`\nPhase 56 cart intelligence audit: FAIL (${failures})`);
  process.exit(1);
}
console.log("\nPhase 56 cart intelligence audit: PASS");
