import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
function check(label, condition) { checks.push({ label, ok: Boolean(condition) }); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }

check("Phase 38 admin refill route restored", exists("server/src/routes/admin-refill.routes.ts"));
check("Refill email implementation restored", read("server/src/services/notification.service.ts").includes("sendRefillReminderEmail"));
check("REFILL in-app notification type restored", read("server/src/services/notification-center.service.ts").includes('"REFILL"'));
check("Customer Refills page retained", exists("client/src/pages/Refills.jsx"));
check("Admin Refills page retained", exists("client/src/pages/admin/AdminRefills.jsx"));
check("Phase 44 migration", exists("server/prisma/migrations/20261003231500_phase44_fulfilment_shipping_v2/migration.sql"));
const schema = read("server/prisma/schema.prisma");
check("Shipping zone courier preference", schema.includes("preferredShippingPartnerId") && schema.includes('PreferredShippingPartner'));
check("Shipping zone weight/COD/SLA overrides", schema.includes("codMaxOrderAmount") && schema.includes("dispatchWithinDays") && schema.includes("maxWeightGrams"));
check("Order dispatch SLA snapshot", schema.includes("dispatchDueAt DateTime?"));
check("Shipment courier relation", schema.includes("shippingPartnerId String?"));
check("Weight-aware shipping service", read("server/src/services/shipping-zone.service.ts").includes("totalWeightGrams") && read("server/src/services/shipping-zone.service.ts").includes("partnerWeightBlocked"));
check("Checkout snapshots dispatch SLA", read("server/src/services/checkout.service.ts").includes("dispatchDueAt") && read("server/src/services/checkout.service.ts").includes("preferredShippingPartnerName"));
check("Admin fulfilment API", read("server/src/routes/admin-ops.routes.ts").includes('"/fulfilment/overview"'));
check("Admin fulfilment UI", exists("client/src/pages/admin/AdminFulfilment.jsx") && read("client/src/App.jsx").includes('path="fulfilment"'));
check("Operations permission includes fulfilment", read("server/src/security/admin-permissions.ts").includes('"/fulfilment"'));

const sourceRoot = path.join(root, "client", "src");
const sourceFiles = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) sourceFiles.push(full); } }
walk(sourceRoot);
const missing = [];
const importPattern = /(?:from\s+|import\s*\()(["'])(\.{1,2}\/[^"']+)\1/g;
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, "utf8");
  let match;
  while ((match = importPattern.exec(text))) {
    const base = path.resolve(path.dirname(file), match[2]);
    const candidates = [base, ...[".js", ".jsx", ".ts", ".tsx", ".json"].map((ext) => base + ext), ...[".js", ".jsx", ".ts", ".tsx"].map((ext) => path.join(base, `index${ext}`))];
    if (!candidates.some((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())) missing.push(`${path.relative(root, file)} -> ${match[2]}`);
  }
}
check(`${sourceFiles.length} frontend files, 0 unresolved relative imports`, missing.length === 0);

for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.label}`);
if (missing.length) missing.slice(0, 20).forEach((item) => console.log(`      ${item}`));
const failed = checks.filter((item) => !item.ok);
console.log(`\nPhase 44 fulfilment/shipping audit: ${failed.length ? "FAIL" : "PASS"}`);
if (failed.length) process.exit(1);
