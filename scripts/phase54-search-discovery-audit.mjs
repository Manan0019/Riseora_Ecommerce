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
  "server/src/services/search-intelligence.service.ts",
  "server/src/routes/product.routes.ts",
  "server/src/services/system-health.service.ts",
  "client/src/components/SmartSearch.jsx",
  "client/src/components/Header.jsx",
  "client/src/pages/Shop.jsx",
  "client/src/pages/admin/AdminSystem.jsx",
  "scripts/phase54-search-discovery-audit.mjs",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/search-intelligence.service.ts", [
  "normalizeSearchText", "suggestedCorrection", "relatedSearchTerms", "recordSearchObservation", "searchDiscoverySnapshot", "[redacted]",
]);
requireText("server/src/routes/product.routes.ts", [
  '"/search/intelligence"', "buildSearchDictionary", "searchPreviewProducts", "rescueProducts", "recordSearchObservation",
]);
requireText("server/src/services/system-health.service.ts", ["searchDiscoverySnapshot", "discovery,"]);
requireText("client/src/components/SmartSearch.jsx", ["Did you mean", "RELATED SEARCHES", "phase54-smart-search"]);
requireText("client/src/components/Header.jsx", ["/products/search/intelligence", "SmartSearch", "POPULAR PICKS"]);
requireText("client/src/pages/Shop.jsx", ["searchIntelligence", "search_recovery", "No exact matches", "phase54-rescue-products"]);
requireText("client/src/pages/admin/AdminSystem.jsx", ["Search discovery health", "zeroResultRatePercent"]);
requireText("client/src/styles.css", ["phase54-smart-search", "phase54-search-health", "phase54-zero-results"]);

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["search:doctor"] || "").includes("phase54-search-discovery-audit.mjs") ? pass("search:doctor command") : fail("search:doctor command");
String(scripts["client:doctor"] || "").includes("search:doctor") ? pass("client:doctor includes Phase 54 discovery gate") : fail("client:doctor Phase 54 gate");
String(scripts["verify:phase54"] || "").includes("performance:budget") && String(scripts["verify:phase54"] || "").includes("npm run build") ? pass("verify:phase54 command") : fail("verify:phase54 command");
(["verify:phase54", "verify:phase55", "verify:phase56"].some((token) => String(scripts["prelaunch:check"] || "").includes(token))) ? pass("prelaunch uses Phase 54+ verification") : fail("prelaunch Phase 54+ verification");

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
  console.error(`\nPhase 54 search discovery audit: FAIL (${failures})`);
  process.exit(1);
}
console.log("\nPhase 54 search discovery audit: PASS");
