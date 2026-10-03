import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "client/src/pages/Refills.jsx",
  "client/src/pages/admin/AdminRefills.jsx",
  "client/src/pages/CampaignDetails.jsx",
  "client/src/pages/admin/AdminContentStudio.jsx",
  "server/src/routes/campaign.routes.ts",
  "server/prisma/migrations/20261003213000_phase43_content_campaign_studio/migration.sql",
];
let failed = false;
for (const rel of required) {
  const ok = fs.existsSync(path.join(root, rel));
  console.log(`${ok ? "PASS" : "FAIL"}  ${rel}`);
  if (!ok) failed = true;
}

const schema = fs.readFileSync(path.join(root, "server/prisma/schema.prisma"), "utf8");
for (const [label, token] of [
  ["Campaign model", "model Campaign {"],
  ["CampaignProduct model", "model CampaignProduct {"],
  ["MediaAsset model", "model MediaAsset {"],
  ["Banner alt text", "imageAlt       String?"],
]) {
  const ok = schema.includes(token);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed = true;
}

const app = fs.readFileSync(path.join(root, "client/src/App.jsx"), "utf8");
for (const [label, token] of [
  ["Campaign storefront route", 'path="/campaigns/:slug"'],
  ["Admin Content Studio route", 'path="content"'],
  ["Refills customer route retained", 'path="/refills"'],
  ["Admin Refills route retained", 'path="refills" element={<AdminRefills'],
]) {
  const ok = app.includes(token);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed = true;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function resolveRelative(file, spec) {
  const base = path.resolve(path.dirname(file), spec);
  const candidates = [base, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, path.join(base, "index.js"), path.join(base, "index.jsx"), path.join(base, "index.ts"), path.join(base, "index.tsx")];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

const clientRoot = path.join(root, "client/src");
const files = walk(clientRoot);
const missing = [];
const importPattern = /(?:import\s+(?:[^"']+?\s+from\s+)?|export\s+[^"']+?\s+from\s+|import\s*\()(["'])(\.\.?\/[^"']+)\1/g;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  let match;
  while ((match = importPattern.exec(source))) {
    const spec = match[2];
    if (!resolveRelative(file, spec)) missing.push(`${path.relative(root, file)} -> ${spec}`);
  }
}
if (missing.length) {
  failed = true;
  console.log(`FAIL  unresolved relative imports: ${missing.join("; ")}`);
} else {
  console.log(`PASS  ${files.length} frontend JS/JSX/TS files, 0 unresolved relative imports`);
}

if (failed) {
  console.error("\nPhase 43 content studio audit: FAIL");
  process.exit(1);
}
console.log("\nPhase 43 content studio audit: PASS");
