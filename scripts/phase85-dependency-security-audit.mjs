import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
let failed = 0;
const pass = (label) => console.log(`PASS  ${label}`);
const fail = (label, detail = "") => { failed += 1; console.error(`FAIL  ${label}${detail ? ` · ${detail}` : ""}`); };

function versionTuple(value) {
  return String(value || "").replace(/^[^0-9]*/, "").split(".").slice(0, 3).map((part) => Number(part.replace(/\D.*/, "") || 0));
}
function gte(actual, minimum) {
  const a = versionTuple(actual); const b = versionTuple(minimum);
  for (let i = 0; i < 3; i += 1) { if ((a[i] || 0) > (b[i] || 0)) return true; if ((a[i] || 0) < (b[i] || 0)) return false; }
  return true;
}

const concurrently = pkg.devDependencies?.concurrently;
gte(concurrently, "10.0.5") ? pass(`concurrently policy · ${concurrently}`) : fail("concurrently policy", String(concurrently));
const shellQuote = pkg.overrides?.["shell-quote"];
gte(shellQuote, "1.11.0") ? pass(`shell-quote override · ${shellQuote}`) : fail("shell-quote secure override", String(shellQuote));
const sourceMap = pkg.overrides?.["source-map-js"];
gte(sourceMap, "1.2.2") ? pass(`source-map-js override · ${sourceMap}`) : fail("source-map-js secure override", String(sourceMap));

const lockPath = path.join(root, "package-lock.json");
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const packages = lock.packages || {};
  const versions = (needle) => Object.entries(packages)
    .filter(([name]) => name === `node_modules/${needle}` || name.endsWith(`/node_modules/${needle}`))
    .map(([, meta]) => meta?.version)
    .filter(Boolean);
  const shellVersions = versions("shell-quote");
  const sourceVersions = versions("source-map-js");
  const concurrentVersions = versions("concurrently");
  shellVersions.length && shellVersions.every((v) => gte(v, "1.11.0")) ? pass(`lockfile shell-quote · ${[...new Set(shellVersions)].join(", ")}`) : fail("lockfile shell-quote", shellVersions.join(", ") || "missing after npm install");
  sourceVersions.length && sourceVersions.every((v) => gte(v, "1.2.2")) ? pass(`lockfile source-map-js · ${[...new Set(sourceVersions)].join(", ")}`) : fail("lockfile source-map-js", sourceVersions.join(", ") || "missing after npm install");
  concurrentVersions.length && concurrentVersions.every((v) => gte(v, "10.0.5")) ? pass(`lockfile concurrently · ${[...new Set(concurrentVersions)].join(", ")}`) : fail("lockfile concurrently", concurrentVersions.join(", ") || "missing after npm install");
} else {
  pass("package-lock validation deferred until npm install (overlay intentionally does not ship node_modules/lockfile)");
}

if (failed) { console.error(`\nPhase 85 dependency security audit: FAIL (${failed})`); process.exit(1); }
console.log("\nPhase 85 dependency security audit: PASS");
