import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;
function pass(message) { console.log(`PASS  ${message}`); }
function fail(message) { failed = true; console.error(`FAIL  ${message}`); }
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function requireText(relative, needles) {
  if (!fs.existsSync(path.join(root, relative))) return fail(`${relative} exists`);
  const text = read(relative);
  pass(relative);
  for (const needle of needles) text.includes(needle) ? pass(`${relative} · ${needle}`) : fail(`${relative} missing ${needle}`);
}

requireText("server/src/config/env.ts", ["AUTH_SESSION_TTL_DAYS", "AUTH_MAX_FAILED_LOGINS", "AUTH_LOCK_MINUTES", "RELEASE_BUILD_TIME"]);
requireText("client/src/analytics.js", ["export function analyticsConsent", "export function trackEvent", "export function trackCommerce"]);
requireText("client/src/lib/persisted-state.js", ["readPersistedArray", "riseora_state_quarantine:"]);
requireText("client/src/lib/client-runtime.js", ["prepareClientRuntime", "cleanupDevelopmentServiceWorkers", "repairTransientClientState", "createClientErrorReference"]);
requireText("client/src/main.jsx", ["prepareClientRuntime();", "cleanupDevelopmentServiceWorkers"]);
requireText("client/src/context/CartContext.jsx", ["readPersistedArray", "normalizeStoredLine"]);
requireText("client/src/context/WishlistContext.jsx", ["readPersistedArray"]);
requireText("client/src/context/CompareContext.jsx", ["readPersistedArray"]);
requireText("client/src/pages/Home.jsx", ["responseArray", "readPersistedArray"]);
requireText("client/src/components/AppErrorBoundary.jsx", ["Error reference:", "Repair local state", "referenceId"]);
requireText("server/src/routes/system.routes.ts", ["referenceId: z.string()"]);
requireText("server/src/services/runtime-observability.service.ts", ["client_error_reported", "referenceId"]);
requireText("scripts/phase50-client-state-test.mjs", ["Phase 50 client-state recovery test: PASS"]);

const envText = read("server/src/config/env.ts");
const schemaKeys = new Set([...envText.matchAll(/^\s{2}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1]));
const usedEnv = new Set();
for (const file of walk(path.join(root, "server/src")).filter((file) => file.endsWith(".ts"))) {
  const text = fs.readFileSync(file, "utf8").replace(/process\.env\.[A-Z][A-Z0-9_]*/g, "");
  for (const match of text.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)) usedEnv.add(match[1]);
}
const missingEnv = [...usedEnv].filter((key) => !schemaKeys.has(key)).sort();
missingEnv.length ? fail(`environment schema missing used keys: ${missingEnv.join(", ")}`) : pass(`${usedEnv.size} server env references covered by schema`);

const packageJson = JSON.parse(read("package.json"));
packageJson.scripts?.["verify:phase50"]?.includes("phase50-runtime-recovery-audit.mjs") ? pass("verify:phase50 command") : fail("verify:phase50 command");
(packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase50") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase51") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase52") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase53") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase54") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase55") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase56") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase57") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase58") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase59") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase60") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase61") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase62") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase63") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase65") || packageJson.scripts?.["prelaunch:check"]?.includes("verify:phase66")) ? pass("prelaunch includes Phase 50+ verification") : fail("prelaunch includes Phase 50+ verification");

const clientFiles = walk(path.join(root, "client/src")).filter((file) => /\.(?:js|jsx|mjs|ts|tsx)$/.test(file));
const unresolved = [];
for (const file of clientFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(/(?:from\s+|import\s*\()(["'])(\.{1,2}\/[^"']+)\1/g)) {
    const specifier = match[2];
    const candidate = path.resolve(path.dirname(file), specifier);
    if (!resolves(candidate)) unresolved.push(`${path.relative(root, file)} -> ${specifier}`);
  }
}
unresolved.length ? fail(`unresolved relative imports:\n${unresolved.join("\n")}`) : pass(`${clientFiles.length} frontend files, 0 unresolved relative imports`);

const risky = ["prisma migrate reset", "prisma db push --force-reset"];
const packageText = read("package.json").toLowerCase();
const foundRisky = risky.filter((needle) => packageText.includes(needle));
foundRisky.length ? fail(`destructive production command detected: ${foundRisky.join(", ")}`) : pass("no destructive production database command added");

if (failed) {
  console.error("\nPhase 50 runtime recovery audit: FAIL");
  process.exit(1);
}
console.log("\nPhase 50 runtime recovery audit: PASS");

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
  const extensions = ["", ".js", ".jsx", ".mjs", ".ts", ".tsx", ".json"];
  for (const extension of extensions) {
    try { if (fs.statSync(candidate + extension).isFile()) return true; } catch {}
  }
  for (const extension of [".js", ".jsx", ".mjs", ".ts", ".tsx"]) {
    try { if (fs.statSync(path.join(candidate, `index${extension}`)).isFile()) return true; } catch {}
  }
  return false;
}
