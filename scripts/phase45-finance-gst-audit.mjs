import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
const check = (label, ok) => checks.push({ label, ok: Boolean(ok) });
const exists = (rel) => fs.existsSync(path.join(root, rel));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

check("Phase 38 RefillPlanner restored", exists("client/src/components/RefillPlanner.jsx"));
check("Phase 38 admin refill route retained", exists("server/src/routes/admin-refill.routes.ts"));
check("Phase 38 refill email retained", read("server/src/services/notification.service.ts").includes("sendRefillReminderEmail"));
check("REFILL notification type retained", read("server/src/services/notification-center.service.ts").includes('"REFILL"'));
check("Phase 45 migration", exists("server/prisma/migrations/20261003193000_phase45_finance_gst_reconciliation/migration.sql"));
const schema = read("server/prisma/schema.prisma");
check("CreditNote model", schema.includes("model CreditNote") && schema.includes("creditNoteNumber") && schema.includes("sourceKey"));
check("Payment reconciliation state", schema.includes("PaymentReconciliationStatus") && schema.includes("reconciliationStatus"));
check("Invoice PAN/place-of-supply snapshot", schema.includes("sellerPan") && schema.includes("placeOfSupply"));
check("Store PAN and credit-note numbering", schema.includes("creditNotePrefix") && schema.includes("creditNoteNextNumber") && schema.includes("pan           String?"));
check("Finance service", exists("server/src/services/finance.service.ts") && read("server/src/services/finance.service.ts").includes("reconcileFinancePayments"));
check("Credit-note service", exists("server/src/services/credit-note.service.ts") && read("server/src/services/credit-note.service.ts").includes("ensureCreditNoteForReturn"));
check("Admin finance API", exists("server/src/routes/admin-finance.routes.ts") && read("server/src/index.ts").includes("adminFinanceRoutes"));
check("Admin finance UI", exists("client/src/pages/admin/AdminFinance.jsx") && read("client/src/App.jsx").includes('path="finance"'));
check("Customer credit-note UI", exists("client/src/pages/CreditNote.jsx") && read("client/src/App.jsx").includes('path="/credit-note/:returnNumber"'));
check("Finance permission", read("server/src/security/admin-permissions.ts").includes('"FINANCE"') && read("client/src/adminPermissions.js").includes('"FINANCE"'));

const sourceRoot = path.join(root, "client", "src");
const sourceFiles = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) sourceFiles.push(full); } }
walk(sourceRoot);
const missing = [];
const importPattern = /(?:from\s+|import\s*\()(["'])(\.{1,2}\/[^"']+)\1/g;
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, "utf8"); let match;
  while ((match = importPattern.exec(text))) {
    const base = path.resolve(path.dirname(file), match[2]);
    const candidates = [base, ...[".js", ".jsx", ".ts", ".tsx", ".json"].map((ext) => base + ext), ...[".js", ".jsx", ".ts", ".tsx"].map((ext) => path.join(base, `index${ext}`))];
    if (!candidates.some((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())) missing.push(`${path.relative(root, file)} -> ${match[2]}`);
  }
}
check(`${sourceFiles.length} frontend files, 0 unresolved relative imports`, missing.length === 0);

for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.label}`);
if (missing.length) missing.slice(0, 30).forEach((item) => console.log(`      ${item}`));
const failed = checks.filter((item) => !item.ok);
console.log(`\nPhase 45 finance/GST audit: ${failed.length ? "FAIL" : "PASS"}`);
if (failed.length) process.exit(1);
