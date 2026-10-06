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
  "server/src/services/system-health.service.ts",
  "client/src/pages/ProductDetails.jsx",
  "client/src/components/ProductCard.jsx",
  "client/src/pages/admin/AdminSystem.jsx",
  "client/src/styles.css",
  "scripts/phase55-product-recommendation-audit.mjs",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/product-recommendation.service.ts", [
  "smartProductRecommendations", "recommendationReason", "ingredientOverlap", "suitabilityOverlap", "recommendationEngagementSnapshot", "recordRecommendationEvent",
]);
requireText("server/src/routes/product.routes.ts", [
  '"/:slug/recommendations/similar"', '"/recommendations/event"', "smartProductRecommendations", "recommendationEventLimiter",
]);
requireText("server/src/services/system-health.service.ts", ["recommendationEngagementSnapshot", "recommendations,"]);
requireText("client/src/pages/ProductDetails.jsx", [
  "/recommendations/similar?limit=8", "Other products you may like", "recommendationReason", "recommendation_click", "RecommendationShelf",
]);
requireText("client/src/components/ProductCard.jsx", ["onProductOpen", "onClick={() => onProductOpen?.(product)}"]);
requireText("client/src/pages/admin/AdminSystem.jsx", ["recommendation", "clickThroughRatePercent", "health.recommendations"]);
requireText("client/src/styles.css", ["phase55-recommendation-section", "phase55-recommendation-health", "phase55-recommendation-reason"]);

const productDetails = read("client/src/pages/ProductDetails.jsx");
const reviewsIndex = productDetails.indexOf('id="reviews"');
const recommendationIndex = productDetails.indexOf("<RecommendationShelf");
reviewsIndex >= 0 && recommendationIndex > reviewsIndex ? pass("recommendation shelf is after reviews at the bottom of product detail") : fail("recommendation shelf bottom placement");
const firstEarlyReturn = productDetails.indexOf("if (error) return");
const rewardsEffect = productDetails.indexOf('apiFetch("/rewards/public")');
rewardsEffect >= 0 && rewardsEffect < firstEarlyReturn ? pass("ProductDetails hook ordering repaired before early return") : fail("ProductDetails hook ordering");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["recommendation:doctor"] || "").includes("phase55-product-recommendation-audit.mjs") ? pass("recommendation:doctor command") : fail("recommendation:doctor command");
String(scripts["client:doctor"] || "").includes("recommendation:doctor") ? pass("client:doctor includes Phase 55 recommendation gate") : fail("client:doctor Phase 55 recommendation gate");
String(scripts["verify:phase55"] || "").includes("performance:budget") && String(scripts["verify:phase55"] || "").includes("npm run build") ? pass("verify:phase55 command") : fail("verify:phase55 command");
(["verify:phase55", "verify:phase56", "verify:phase57", "verify:phase58", "verify:phase59", "verify:phase60", "verify:phase61", "verify:phase62", "verify:phase63", "verify:phase65", "verify:phase68"].some((token) => String(scripts["prelaunch:check"] || "").includes(token))) ? pass("prelaunch uses Phase 55+ verification") : fail("prelaunch Phase 55+ verification");

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
  console.error(`\nPhase 55 product recommendation audit: FAIL (${failures})`);
  process.exit(1);
}
console.log("\nPhase 55 product recommendation audit: PASS");
