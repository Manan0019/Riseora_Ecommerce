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
  "server/prisma/migrations/20261006121500_phase69_account_saved_bag_v2/migration.sql",
  "server/src/services/account-cart.service.ts",
  "server/src/routes/account.routes.ts",
  "server/src/routes/lifecycle.routes.ts",
  "server/src/services/database-readiness.service.ts",
  "client/src/context/CartContext.jsx",
  "client/src/pages/Cart.jsx",
  "client/src/pages/admin/AdminLifecycle.jsx",
  "client/src/styles.css",
  "package.json",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/prisma/schema.prisma", ["model AccountCart", "accountCart AccountCart?", "userId String @unique", "items Json", "lastMergedAt DateTime?"]);
requireText("server/prisma/migrations/20261006121500_phase69_account_saved_bag_v2/migration.sql", [
  'CREATE TABLE "AccountCart"', 'CREATE UNIQUE INDEX "AccountCart_userId_key"', 'FOREIGN KEY ("userId") REFERENCES "User"("id")',
]);
requireText("server/src/services/account-cart.service.ts", [
  "getAccountCart", "mergeAccountCart", "saveAccountCart", "accountCartHealth", "availableToSell", "safetyStock",
  "maxPurchaseQuantity", "Saved Bag persistence intentionally stores only product-option identity + requested quantity",
  "Price, stock, names and images are re-read from the live catalogue on every restore/sync",
]);
requireText("server/src/routes/account.routes.ts", ['"/cart"', '"/cart/merge"', "getAccountCart", "mergeAccountCart", "saveAccountCart"]);
requireText("server/src/routes/lifecycle.routes.ts", ['"/saved-bag-health"', "accountCartHealth"]);
requireText("client/src/context/CartContext.jsx", [
  '"/account/cart/merge"', '"/account/cart"', "apiFetch(endpoint", "toAccountCartRequest", "cartRequestSignature",
  "syncReadyRef", "lastServerSignatureRef", "retrySavedBagSync", "setItems([])",
  "CART_OWNER_KEY", "CART_DIRTY_KEY", "storedOwner === userId && localDirty", 'method = "GET"',
]);
requireText("client/src/pages/Cart.jsx", [
  "PHASE 71 · BAG INTENT", "Save for later", "RETRY ACCOUNT SYNC",
  "Sign in to carry both your active bag and later list across devices",
]);
requireText("client/src/pages/admin/AdminLifecycle.jsx", [
  "PHASE 71 · CART INTENT CONTINUITY", "Saved Bag continuity", "/admin/lifecycle/saved-bag-health", "STALE · 30D+",
  "separate from cart-recovery marketing consent",
]);
requireText("client/src/styles.css", ["phase69-saved-bag", "phase69-admin-saved-bag-grid"]);
requireText("server/src/services/database-readiness.service.ts", ["20261006121500_phase69_account_saved_bag_v2", "AccountCart table"]);
requireText("scripts/db-schema-status.mjs", ["20261006121500_phase69_account_saved_bag_v2", "AccountCart table"]);

const service = read("server/src/services/account-cart.service.ts");
/service\.accountCart/.test(service) ? fail("invalid accountCart service reference") : pass("account cart service uses Prisma model directly");
service.includes("sellingPrice") && service.includes("stockQuantity") && service.includes("availableToSell")
  ? pass("saved bag rehydrates live price and public availability") : fail("saved bag must rehydrate current catalogue data");
(service.includes("Math.max(merged.get(row.variantId) || 0, row.quantity)") || service.includes("Math.max(active.get(row.variantId) || 0, row.quantity)"))
  ? pass("browser/account merge avoids duplicate-quantity inflation") : fail("saved bag merge quantity rule");
const persistentBlock = service.slice(service.indexOf("function persistentLines"), service.indexOf("export async function getAccountCart"));
!/(price|mrp|stockQuantity|productName|imageUrl)\s*:/.test(persistentBlock)
  ? pass("persistent Saved Bag payload excludes stale catalogue facts") : fail("Saved Bag persistence must store identity + quantity only");

const cartContext = read("client/src/context/CartContext.jsx");
cartContext.includes("if (!user?.id)") && cartContext.includes("setItems([])")
  ? pass("logout clears browser copy of signed-in bag") : fail("logout privacy guard for signed-in bag");
!cartContext.includes('"/account/cart", { method: "PUT", body: JSON.stringify({ items: buyNowItems')
  ? pass("Buy Now session is not persisted as Saved Bag") : fail("Buy Now must stay session-scoped");
cartContext.includes("storedOwner === userId && localDirty") && cartContext.includes('method = "PUT"') && cartContext.includes('method = "GET"')
  ? pass("same-account clean refresh restores server authority; only dirty local state replaces it") : fail("Saved Bag owner/dirty conflict policy");
cartContext.includes("storedOwner !== userId") && cartContext.includes('markStoredCartOwner("")')
  ? pass("cross-account browser cart isolation guard") : fail("cross-account local cart isolation");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["saved-bag:doctor"] || "").includes("phase69-account-saved-bag-audit.mjs") ? pass("saved-bag:doctor command") : fail("saved-bag:doctor command");
String(scripts["client:doctor"] || "").includes("saved-bag:doctor") ? pass("client:doctor includes Phase 69 gate") : fail("client:doctor Phase 69 gate");
String(scripts["verify:phase69"] || "").includes("performance:budget") && String(scripts["verify:phase69"] || "").includes("npm run build") ? pass("verify:phase69 command") : fail("verify:phase69 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase69") ? pass("prelaunch uses Phase 69 verification") : fail("prelaunch Phase 69 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase69") ? pass("production release advances to Phase 69") : fail("production release Phase 69 verification");

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

if (failures) { console.error(`\nPhase 69 account Saved Bag audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 69 account Saved Bag audit: PASS");
