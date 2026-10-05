import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;
function pass(message) { console.log(`PASS  ${message}`); }
function fail(message) { failed = true; console.error(`FAIL  ${message}`); }
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function requireText(relative, needles) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return fail(`${relative} exists`);
  const text = read(relative);
  pass(relative);
  for (const needle of needles) text.includes(needle) ? pass(`${relative} · ${needle}`) : fail(`${relative} missing ${needle}`);
}

requireText("client/src/lib/route-modules.js", ["memoImport", "lazyRoute", "preloadRoutePath", "routeModuleNameForPath"]);
requireText("client/src/components/RoutePerformanceBridge.jsx", ["pointerover", "focusin", "touchstart", "requestIdleCallback", "saveData"]);
requireText("client/src/lib/web-performance.js", ["largest-contentful-paint", "layout-shift", "longtask", "reportClientPerformance"]);
requireText("client/src/api/http.js", ["inFlightGets", "apiFetchCached", "invalidateApiCache", "reportClientPerformance"]);
requireText("client/src/context/StoreContext.jsx", ["apiFetchCached", "ttlMs: 30000"]);
requireText("client/src/pages/Home.jsx", ["apiFetchCached", "ttlMs: 15000"]);
requireText("client/src/App.jsx", ["RoutePerformanceBridge", "lazyRoute(\"Home\")"]);
requireText("server/src/routes/system.routes.ts", ["/client-performance", "recordClientPerformance", "Invalid client performance report"]);
requireText("server/src/services/runtime-observability.service.ts", ["ClientPerformanceSample", "recordClientPerformance", "webExperience", "lcpP75Ms", "clsP75"]);
requireText("client/src/pages/admin/AdminSystem.jsx", ["Customer web experience", "LCP · P75", "CLS · P75"]);
requireText("scripts/phase53-bundle-budget.mjs", ["Phase 53 bundle budget: PASS", "MAX_JS_CHUNK_BYTES", "MAX_CSS_CHUNK_BYTES"]);

const app = read("client/src/App.jsx");
const oldLazyImports = [...app.matchAll(/lazy\(\(\)\s*=>\s*import\(/g)].length;
oldLazyImports === 0 ? pass("App routes use memoized Phase 53 route loaders") : fail(`App still contains ${oldLazyImports} direct lazy import(s)`);

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts || {};
String(scripts["client:doctor"] || "").includes("phase53-storefront-performance-audit.mjs") ? pass("client:doctor includes Phase 53 performance contract") : fail("client:doctor Phase 53 contract");
String(scripts["performance:budget"] || "").includes("phase53-bundle-budget.mjs") ? pass("performance:budget command") : fail("performance:budget command");
String(scripts["verify:phase53"] || "").includes("performance:budget") && String(scripts["verify:phase53"] || "").includes("npm run build") ? pass("verify:phase53 command") : fail("verify:phase53 command");
(["verify:phase53", "verify:phase54", "verify:phase55", "verify:phase56", "verify:phase57", "verify:phase58", "verify:phase59", "verify:phase60", "verify:phase61", "verify:phase62", "verify:phase63", "verify:phase64"].some((token) => String(scripts["prelaunch:check"] || "").includes(token))) ? pass("prelaunch uses Phase 53+ verification") : fail("prelaunch uses Phase 53+ verification");

const routeModuleText = read("client/src/lib/route-modules.js");
const routeNames = [...app.matchAll(/lazyRoute\("([A-Za-z0-9]+)"\)/g)].map((match) => match[1]);
const missingLoaders = routeNames.filter((name) => !routeModuleText.includes(`${name}: memoImport`));
missingLoaders.length ? fail(`lazy routes without memoized loaders: ${missingLoaders.join(", ")}`) : pass(`${routeNames.length} lazy routes backed by memoized loaders`);

const risky = ["prisma migrate reset", "prisma db push --force-reset"];
const packageText = read("package.json").toLowerCase();
const found = risky.filter((needle) => packageText.includes(needle));
found.length ? fail(`destructive production database command detected: ${found.join(", ")}`) : pass("no destructive production database command added");

if (failed) {
  console.error("\nPhase 53 storefront performance audit: FAIL");
  process.exit(1);
}
console.log("\nPhase 53 storefront performance audit: PASS");
