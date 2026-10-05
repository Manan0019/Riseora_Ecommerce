import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;
const EXPECTED_ANALYTICS_EXPORTS = [
  "analyticsConsent",
  "configureAnalytics",
  "getAnalyticsConfiguration",
  "setAnalyticsConsent",
  "clearAnalyticsConsent",
  "openAnalyticsPreferences",
  "analyticsEvents",
  "loadAnalytics",
  "trackPage",
  "trackEvent",
  "analyticsItems",
  "trackCommerce",
  "trackPurchase",
];

function pass(message) { console.log(`PASS  ${message}`); }
function fail(message) { failed = true; console.error(`FAIL  ${message}`); }
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function exists(relative) { return fs.existsSync(path.join(root, relative)); }

const canonicalPath = "client/src/analytics.js";
const bridgePath = "client/src/lib/analytics.js";
if (!exists(canonicalPath)) fail(`${canonicalPath} exists`);
if (!exists(bridgePath)) fail(`${bridgePath} exists`);

const analyticsText = exists(canonicalPath) ? read(canonicalPath) : "";
const bridgeText = exists(bridgePath) ? read(bridgePath) : "";
const exportedFunctions = new Set([
  ...analyticsText.matchAll(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g),
].map((match) => match[1]));
const exportedBindings = new Set([
  ...analyticsText.matchAll(/\bexport\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g),
].map((match) => match[1]));
const canonicalExports = new Set([...exportedFunctions, ...exportedBindings]);

analyticsText.includes('export * from "./lib/analytics.js"')
  ? fail("canonical analytics module still depends on export-star compatibility bridge")
  : pass("canonical analytics implementation is self-contained");

for (const name of EXPECTED_ANALYTICS_EXPORTS) {
  canonicalExports.has(name) ? pass(`analytics export · ${name}`) : fail(`analytics export missing · ${name}`);
}

bridgeText.includes('from "../analytics.js"')
  ? pass("legacy lib/analytics bridge points to canonical module")
  : fail("legacy lib/analytics bridge target");
for (const name of EXPECTED_ANALYTICS_EXPORTS) {
  bridgeText.includes(name) ? pass(`legacy bridge export · ${name}`) : fail(`legacy bridge export missing · ${name}`);
}

const clientFiles = walk(path.join(root, "client/src")).filter((file) => /\.(?:js|jsx|mjs|ts|tsx)$/.test(file));
const unresolved = [];
const legacyAnalyticsImports = [];
const invalidAnalyticsImports = [];

for (const file of clientFiles) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const text = fs.readFileSync(file, "utf8");

  if (relative !== bridgePath && /from\s+["'][^"']*lib\/analytics(?:\.js)?["']/.test(text)) {
    legacyAnalyticsImports.push(relative);
  }

  for (const match of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']*\/analytics(?:\.js)?|\.\.\/analytics(?:\.js)?|\.\/analytics(?:\.js)?)["']/g)) {
    const names = match[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.split(/\s+as\s+/i)[0].trim());
    for (const name of names) {
      if (!canonicalExports.has(name)) invalidAnalyticsImports.push(`${relative} imports ${name}`);
    }
  }

  for (const match of text.matchAll(/(?:from\s+|import\s*\()(["'])(\.{1,2}\/[^"']+)\1/g)) {
    const specifier = match[2];
    const candidate = path.resolve(path.dirname(file), specifier);
    if (!resolves(candidate)) unresolved.push(`${relative} -> ${specifier}`);
  }
}

legacyAnalyticsImports.length
  ? fail(`legacy lib/analytics imports remain:\n${legacyAnalyticsImports.join("\n")}`)
  : pass("all application analytics imports use canonical client/src/analytics.js");
invalidAnalyticsImports.length
  ? fail(`invalid analytics named imports:\n${invalidAnalyticsImports.join("\n")}`)
  : pass("all analytics named imports are backed by canonical exports");
unresolved.length
  ? fail(`unresolved relative imports:\n${unresolved.join("\n")}`)
  : pass(`${clientFiles.length} frontend files, 0 unresolved relative imports`);

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts || {};
String(scripts["client:doctor"] || "").includes("phase51-frontend-module-contract.mjs")
  ? pass("client:doctor command") : fail("client:doctor command");
String(scripts.predev || "").includes("client:doctor") && String(scripts.predev || "").includes("phase48-dev-prepare.mjs")
  ? pass("npm run dev blocks before Vite on frontend contract failure") : fail("predev frontend contract gate");
String(scripts["verify:phase51"] || "").includes("client:doctor") && String(scripts["verify:phase51"] || "").includes("npm run build")
  ? pass("verify:phase51 command") : fail("verify:phase51 command");
(["verify:phase51", "verify:phase52", "verify:phase53", "verify:phase54", "verify:phase55", "verify:phase56", "verify:phase57", "verify:phase58", "verify:phase59", "verify:phase60"].some((token) => String(scripts["prelaunch:check"] || "").includes(token)))
  ? pass("prelaunch uses Phase 51+ verification") : fail("prelaunch uses Phase 51+ verification");

const risky = ["prisma migrate reset", "prisma db push --force-reset"];
const packageText = read("package.json").toLowerCase();
const foundRisky = risky.filter((needle) => packageText.includes(needle));
foundRisky.length ? fail(`destructive production command detected: ${foundRisky.join(", ")}`) : pass("no destructive production database command added");

if (failed) {
  console.error("\nPhase 51 frontend module contract: FAIL");
  process.exit(1);
}
console.log("\nPhase 51 frontend module contract: PASS");

function walk(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "generated"].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else result.push(full);
  }
  return result;
}

function resolves(candidate) {
  for (const extension of ["", ".js", ".jsx", ".mjs", ".ts", ".tsx", ".json"]) {
    try { if (fs.statSync(candidate + extension).isFile()) return true; } catch {}
  }
  for (const extension of [".js", ".jsx", ".mjs", ".ts", ".tsx"]) {
    try { if (fs.statSync(path.join(candidate, `index${extension}`)).isFile()) return true; } catch {}
  }
  return false;
}
