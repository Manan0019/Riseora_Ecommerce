import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mustExist = [
  "client/src/pages/HelpCenter.jsx",
  "client/src/pages/Support.jsx",
  "client/src/pages/admin/AdminSupport.jsx",
  "server/src/routes/support.routes.ts",
  "server/src/routes/admin-support.routes.ts",
  "server/src/services/email.service.ts",
  "server/prisma/migrations/20261003003000_phase37_support_communications_v2/migration.sql",
];
for (const rel of mustExist) if (!fs.existsSync(path.join(root, rel))) throw new Error(`Phase 37 missing required file: ${rel}`);

const checks = [
  ["server/prisma/schema.prisma", ["model SupportMessage", "model EmailDeliveryLog", "SupportTicketPriority", "SUPPORT"]],
  ["server/src/index.ts", ["/api/support", "adminSupportRoutes"]],
  ["client/src/App.jsx", ["/help", "/support", "AdminSupport"]],
  ["client/src/components/AdminLayout.jsx", ["/admin/support", 'permission: "SUPPORT"']],
  ["server/src/services/email.service.ts", ["emailDeliveryLog", "renderRiseoraEmail", "Idempotency-Key"]],
  ["server/src/routes/admin-support.routes.ts", ["WAITING_CUSTOMER", "email-deliveries", "Internal note added"]],
];
for (const [rel, markers] of checks) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  for (const marker of markers) if (!text.includes(marker)) throw new Error(`Phase 37 marker missing in ${rel}: ${marker}`);
}

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry.name)) result.push(full);
  }
  return result;
}
function resolves(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js"), path.join(base, "index.jsx")];
  return candidates.some((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}
const sourceFiles = walk(path.join(root, "client/src"));
const missing = [];
const importPattern = /(?:from\s+|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g;
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(importPattern)) if (!resolves(file, match[1])) missing.push(`${path.relative(root, file)} -> ${match[1]}`);
}
if (missing.length) throw new Error(`Unresolved client imports:\n${missing.join("\n")}`);

console.log("Phase 37 support/communications audit PASS");
console.log(`${sourceFiles.length} frontend JS/JSX files`);
console.log("0 unresolved relative imports");
console.log("support threads, admin queue and transactional email logging present");
