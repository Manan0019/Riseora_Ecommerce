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
  "server/src/services/ingredient-library.service.ts",
  "server/src/routes/product.routes.ts",
  "server/src/routes/admin.routes.ts",
  "client/src/pages/IngredientLibrary.jsx",
  "client/src/pages/ProductDetails.jsx",
  "client/src/pages/admin/AdminCatalog.jsx",
  "client/src/lib/route-modules.js",
  "client/src/App.jsx",
  "client/src/components/Header.jsx",
  "client/src/components/Footer.jsx",
  "client/src/styles.css",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/ingredient-library.service.ts", [
  "ingredientGuideFromText", "ingredientLibrary", "ingredientDetail", "ingredientCatalogHealth",
  "safetyStock", "This library is for catalogue education, not diagnosis or medical treatment advice",
]);
requireText("server/src/routes/product.routes.ts", [
  '"/ingredients/library"', '"/ingredients/:slug"', "ingredientGuide: ingredientGuideFromText",
]);
requireText("server/src/routes/admin.routes.ts", ['"/catalog/ingredient-health"', "ingredientCatalogHealth"]);
requireText("client/src/pages/IngredientLibrary.jsx", [
  "Riseora ingredient library", "Catalogue information, not medical advice", "Products containing", "Related catalogue ingredients",
]);
requireText("client/src/pages/ProductDetails.jsx", ["ingredientGuide", "/ingredients/", "EXPLORE INGREDIENT LIBRARY"]);
requireText("client/src/pages/admin/AdminCatalog.jsx", [
  "PHASE 66 · PRODUCT EDUCATION", "Ingredient & usage completeness", "/admin/catalog/ingredient-health",
]);
requireText("client/src/lib/route-modules.js", ["IngredientLibrary", "/^\\/ingredients"]);
requireText("client/src/App.jsx", ['path="/ingredients"', 'path="/ingredients/:slug"']);
requireText("client/src/components/Header.jsx", ['to="/ingredients">Ingredients']);
requireText("client/src/components/Footer.jsx", ['to="/ingredients">Ingredient library']);

const service = read("server/src/services/ingredient-library.service.ts");
!/(prisma\.[A-Za-z0-9_]+\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany))\s*\(/.test(service)
  ? pass("ingredient library service remains read-only") : fail("ingredient library service must not mutate catalogue data");
service.includes("stockQuantity") && service.includes("safetyStock") && service.includes("Math.max(0")
  ? pass("ingredient product availability subtracts safety stock") : fail("ingredient availability safety-stock contract");
service.includes("product label") && service.includes("qualified professional")
  ? pass("ingredient education includes label/medical-safety boundaries") : fail("ingredient education safety boundary");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["ingredient:doctor"] || "").includes("phase66-ingredient-library-audit.mjs") ? pass("ingredient:doctor command") : fail("ingredient:doctor command");
String(scripts["client:doctor"] || "").includes("ingredient:doctor") ? pass("client:doctor includes Phase 66 gate") : fail("client:doctor Phase 66 gate");
String(scripts["verify:phase66"] || "").includes("performance:budget") && String(scripts["verify:phase66"] || "").includes("npm run build") ? pass("verify:phase66 command") : fail("verify:phase66 command");
(String(scripts["prelaunch:check"] || "").includes("verify:phase66") || String(scripts["prelaunch:check"] || "").includes("verify:phase68")) ? pass("prelaunch uses Phase 66+ verification") : fail("prelaunch Phase 66+ verification");
(read("scripts/phase49-release-prepare.mjs").includes("verify:phase66") || read("scripts/phase49-release-prepare.mjs").includes("verify:phase68")) ? pass("production release advances to Phase 66+") : fail("production release Phase 66+ verification");

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

if (failures) { console.error(`\nPhase 66 ingredient library audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 66 ingredient library audit: PASS");
