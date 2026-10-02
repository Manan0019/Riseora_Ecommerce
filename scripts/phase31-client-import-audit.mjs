import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const srcRoot = path.join(root, "client", "src");
const analyticsFile = path.join(srcRoot, "analytics.js");
const allowedExtensions = [".js", ".jsx", ".ts", ".tsx", ".json"];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function resolveRelative(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, ...allowedExtensions.map((ext) => `${base}${ext}`), ...allowedExtensions.map((ext) => path.join(base, `index${ext}`))];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

const problems = [];
if (!fs.existsSync(analyticsFile)) problems.push("client/src/analytics.js is missing");

const files = walk(srcRoot).filter((file) => /\.(js|jsx|ts|tsx)$/.test(file));
const importPattern = /(?:import\s+(?:[^"']+?\s+from\s+)?|export\s+[^"']*?from\s+|import\s*\()(["'])([^"']+)\1/g;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("lib/analytics") && !file.endsWith(path.join("lib", "analytics.js"))) {
    problems.push(`${path.relative(root, file)} still imports the legacy lib/analytics module`);
  }
  let match;
  while ((match = importPattern.exec(text))) {
    const specifier = match[2];
    if (!specifier.startsWith(".")) continue;
    if (!resolveRelative(file, specifier)) problems.push(`${path.relative(root, file)} has unresolved import ${specifier}`);
  }
}

if (problems.length) {
  console.error("Phase 31 client import audit FAILED");
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}
console.log(`Phase 31 client import audit PASS (${files.length} source files, analytics entry present, 0 unresolved relative imports, 0 legacy analytics imports)`);
