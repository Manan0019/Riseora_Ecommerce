import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const srcRoot = path.join(root, "client", "src");
const allowedExtensions = [".js", ".jsx", ".ts", ".tsx", ".json"];
const problems = [];

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
function requireFile(relative) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) problems.push(`${relative} is missing`);
}

[
  "client/src/analytics.js",
  "client/src/components/ShipmentJourney.jsx",
  "client/src/components/ReturnTimeline.jsx",
  "client/src/pages/ReturnDetail.jsx",
  "client/src/pages/admin/AdminCancellations.jsx",
  "server/src/services/order-cancellation.service.ts",
  "server/prisma/migrations/20261002143000_phase32_post_purchase_ops_v2/migration.sql",
].forEach(requireFile);

const files = walk(srcRoot).filter((file) => /\.(js|jsx|ts|tsx)$/.test(file));
const importPattern = /(?:import\s+(?:[^"']+?\s+from\s+)?|export\s+[^"']*?from\s+|import\s*\()(["'])([^"']+)\1/g;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("lib/analytics") && !file.endsWith(path.join("lib", "analytics.js"))) problems.push(`${path.relative(root, file)} still imports legacy lib/analytics`);
  let match;
  while ((match = importPattern.exec(text))) {
    if (match[2].startsWith(".") && !resolveRelative(file, match[2])) problems.push(`${path.relative(root, file)} has unresolved import ${match[2]}`);
  }
}

const serverIndex = fs.readFileSync(path.join(root, "server", "src", "index.ts"), "utf8");
if (!serverIndex.includes('app.use("/api/uploads", uploadRoutes);')) problems.push("customer upload router is not mounted at /api/uploads");
const schema = fs.readFileSync(path.join(root, "server", "prisma", "schema.prisma"), "utf8");
for (const name of ["OrderCancellationRequest", "ShipmentEvent", "ReturnEvidence", "ReturnStatusHistory"]) {
  if (!schema.includes(`model ${name} {`)) problems.push(`Prisma model ${name} is missing`);
}

if (problems.length) {
  console.error("Phase 32 post-purchase audit FAILED");
  problems.forEach((problem) => console.error(` - ${problem}`));
  process.exit(1);
}
console.log(`Phase 32 post-purchase audit PASS (${files.length} client source files, 0 unresolved imports, customer uploads mounted, post-purchase Prisma models present)`);
