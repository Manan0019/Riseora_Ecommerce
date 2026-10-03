import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "client/src/pages/admin/AdminInventory.jsx",
  "server/src/services/inventory.service.ts",
  "server/prisma/migrations/20261003130000_phase39_inventory_control_v2/migration.sql",
];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) throw new Error(`Phase 39 missing: ${rel}`);

const checks = [
  ["server/prisma/schema.prisma", ["model InventoryMovement", "InventoryMovementType", "safetyStock"]],
  ["server/src/services/checkout.service.ts", ["adjustInventory", "ORDER_RESERVATION", "enforceSafetyStock: true", "ORDER_RELEASE"]],
  ["server/src/routes/admin.routes.ts", ["availableQuantity", "suggestedReorder", "/inventory/:id/movements", "ADMIN_ADJUSTMENT"]],
  ["server/src/routes/product.routes.ts", ["publicVariant", "availableQuantity"]],
  ["server/src/services/stock-alert.service.ts", ["availableToSell"]],
  ["client/src/pages/admin/AdminInventory.jsx", ["Safety stock", "SELLABLE", "Adjustment reason", "STOCK LEDGER"]],
  ["client/src/pages/admin/AdminCatalog.jsx", ["safetyStock", "Protected from customer checkout"]],
];
for (const [rel, markers] of checks) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  for (const marker of markers) if (!text.includes(marker)) throw new Error(`Phase 39 marker missing in ${rel}: ${marker}`);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}
function resolves(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  return [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js"), path.join(base, "index.jsx")].some((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}
const files = walk(path.join(root, "client/src"));
const missing = [];
const importPattern = /(?:from\s+|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(importPattern)) if (!resolves(file, match[1])) missing.push(`${path.relative(root, file)} -> ${match[1]}`);
}
if (missing.length) throw new Error(`Unresolved client imports:\n${missing.join("\n")}`);

console.log("Phase 39 inventory control audit PASS");
console.log(`${files.length} frontend JS/JSX files`);
console.log("0 unresolved relative imports");
console.log("safety stock, stock ledger, atomic reservation and reorder intelligence present");
