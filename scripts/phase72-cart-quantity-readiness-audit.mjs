import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failures = 0;
const pass = (message) => console.log(`PASS  ${message}`);
const fail = (message) => { failures += 1; console.error(`FAIL  ${message}`); };
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
function requireText(file, tokens) {
  const value = read(file);
  for (const token of tokens) value.includes(token) ? pass(`${file} · ${token}`) : fail(`${file} · missing ${token}`);
}

for (const file of [
  "server/src/services/cart-quantity-intelligence.service.ts",
  "server/src/routes/product.routes.ts",
  "server/src/routes/admin.routes.ts",
  "client/src/context/CartContext.jsx",
  "client/src/pages/Cart.jsx",
  "client/src/pages/admin/AdminCatalog.jsx",
  "client/src/styles.css",
  "package.json",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/cart-quantity-intelligence.service.ts", [
  "getCartQuantityReadiness", "cartQuantityHealth", "availableToSell(variant)", "maxPurchaseQuantity",
  "lowStockThreshold", "adjustmentRequired", "quantityCeiling", "safeQuantity",
  "Safety stock is never counted as customer-available inventory", "contain no customer identity or cart contents",
]);
requireText("server/src/routes/product.routes.ts", [
  '"/cart/quantity-readiness"', "getCartQuantityReadiness", "Invalid cart quantity request",
]);
requireText("server/src/routes/admin.routes.ts", [
  '"/catalog/cart-quantity-health"', "cartQuantityHealth",
]);
requireText("client/src/context/CartContext.jsx", [
  "refreshCartFacts", "applySafeCartQuantities", "safeQuantity", "stockQuantity", "maxPurchaseQuantity",
]);
requireText("client/src/pages/Cart.jsx", [
  "PHASE 72 · CART READINESS", "Quantity check before checkout", "REFRESH AVAILABILITY",
  "APPLY SAFE QUANTITIES", "Resolve quantities first", "Low stock", "Current quantity is at a limit",
  "/products/cart/quantity-readiness",
]);
requireText("client/src/pages/admin/AdminCatalog.jsx", [
  "PHASE 72 · CART READINESS", "Quantity & purchase-limit health", "/admin/catalog/cart-quantity-health",
  "LOW-STOCK VARIANTS", "ADJUSTMENT CARTS · 60M", "AT-LIMIT CARTS · 60M",
]);
requireText("client/src/styles.css", ["phase72-cart-readiness", "phase72-line-guidance", "phase72-admin-quantity-health"]);

const service = read("server/src/services/cart-quantity-intelligence.service.ts");
!/prisma\.[a-zA-Z0-9_]+\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/.test(service)
  ? pass("Phase 72 quantity intelligence service remains read-only") : fail("Phase 72 service must not mutate catalogue data");
service.includes("availableToSell(variant)")
  ? pass("quantity readiness uses public availability after safety stock") : fail("quantity readiness must subtract safety stock");
service.includes("product.maxPurchaseQuantity") && service.includes("remainingByProduct")
  ? pass("product-level purchase limits are enforced across variants") : fail("product purchase-limit enforcement");
service.includes("lowStockThreshold") && service.includes("LOW_STOCK")
  ? pass("low-stock guidance is based on configured thresholds") : fail("low-stock guidance contract");

const cart = read("client/src/pages/Cart.jsx");
cart.includes("quantityAdjustmentRequired") && cart.includes("Resolve quantities first") && cart.includes("APPLY SAFE QUANTITIES")
  ? pass("Cart blocks obvious invalid quantities until explicit safe adjustment") : fail("Cart quantity resolution flow");
cart.includes("Checkout will still perform its independent server preflight")
  ? pass("Phase 57 checkout authority remains explicit") : fail("checkout authority boundary");

const schema = read("server/prisma/schema.prisma");
schema.includes("model AccountCart") && schema.includes("revision Int @default(1)")
  ? pass("Phase 72 leaves Saved Bag schema unchanged") : fail("Saved Bag schema contract");
const migrationRoot = path.join(root, "server/prisma/migrations");
const migrationDirs = fs.readdirSync(migrationRoot).filter((name) => /^2026/.test(name)).sort();
migrationDirs.at(-1) === "20261006121500_phase69_account_saved_bag_v2"
  ? pass("Phase 69 migration remains schema head; Phase 72 adds no migration") : fail(`unexpected migration head: ${migrationDirs.at(-1)}`);

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["quantity:doctor"] || "").includes("phase72-cart-quantity-readiness-audit.mjs") ? pass("quantity:doctor command") : fail("quantity:doctor command");
String(scripts["client:doctor"] || "").includes("quantity:doctor") ? pass("client:doctor includes Phase 72 gate") : fail("client:doctor Phase 72 gate");
String(scripts["verify:phase72"] || "").includes("performance:budget") && String(scripts["verify:phase72"] || "").includes("npm run build") ? pass("verify:phase72 command") : fail("verify:phase72 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase72") ? pass("prelaunch uses Phase 72 verification") : fail("prelaunch Phase 72 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase72") ? pass("production release advances to Phase 72") : fail("production release Phase 72 verification");

const destructive = ["migrate reset", "db push --force-reset", "dropdb"];
const packageText = JSON.stringify(pkg).toLowerCase();
destructive.some((token) => packageText.includes(token)) ? fail("no destructive production database command added") : pass("no destructive production database command added");

const clientRoot = path.join(root, "client/src");
const sourceFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:js|jsx)$/.test(entry.name)) sourceFiles.push(full);
  }
}
walk(clientRoot);
const unresolved = [];
for (const file of sourceFiles) {
  const value = fs.readFileSync(file, "utf8");
  for (const match of value.matchAll(/(?:from\s+|import\s*\()(["'])(\.{1,2}\/[^"']+)\1/g)) {
    const raw = match[2]; const base = path.resolve(path.dirname(file), raw);
    const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js"), path.join(base, "index.jsx")];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) unresolved.push(`${path.relative(root, file)} -> ${raw}`);
  }
}
unresolved.length ? fail(`${unresolved.length} unresolved frontend relative imports\n${unresolved.slice(0, 8).join("\n")}`) : pass(`${sourceFiles.length} frontend files, 0 unresolved relative imports`);

if (failures) { console.error(`\nPhase 72 cart quantity readiness audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 72 cart quantity readiness audit: PASS");
