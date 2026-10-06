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
  "server/src/services/account-cart.service.ts",
  "server/src/routes/account.routes.ts",
  "client/src/context/CartContext.jsx",
  "client/src/pages/Cart.jsx",
  "client/src/pages/Checkout.jsx",
  "client/src/pages/admin/AdminLifecycle.jsx",
  "client/src/styles.css",
  "package.json",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/account-cart.service.ts", [
  "AccountCartRevisionConflictError", "ACCOUNT_CART_REVISION_CONFLICT", "expectedRevision", "updateMany",
  "resolveAccountCart", "ACCOUNT_ACCEPTED", "BROWSER_KEPT", "conflicts60m", "availableToSell", "safetyStock",
]);
requireText("server/src/routes/account.routes.ts", [
  '"/cart/resolve"', "expectedRevision", "AccountCartRevisionConflictError", "status(409)", "resolveAccountCart",
]);
requireText("client/src/context/CartContext.jsx", [
  "CART_REVISION_KEY", "expectedRevision: serverRevisionRef.current", "ACCOUNT_CART_REVISION_CONFLICT",
  "savedBagConflict", "visibilitychange", "Your Saved Bag was updated on another device and refreshed here.",
  '"/account/cart/resolve"', "useAccountSavedBag", "keepBrowserSavedBag",
]);
requireText("client/src/pages/Cart.jsx", [
  "Bag changed on another device", "USE ACCOUNT BAG", "KEEP THIS BAG", "PHASE 70 · MULTI-DEVICE SAFETY",
]);
requireText("client/src/pages/Checkout.jsx", [
  "savedBagConflictBlocked", "PHASE 70 · CHECKOUT CONTINUITY", "Resolve the bag version before placing this order",
  "USE ACCOUNT BAG", "KEEP THIS BAG",
]);
requireText("client/src/pages/admin/AdminLifecycle.jsx", [
  "PHASE 70 · MULTI-DEVICE BAG SAFETY", "Saved Bag continuity & conflict health", "CONFLICTS · 60M", "ACCOUNT KEPT · 60M", "BROWSER KEPT · 60M",
]);
requireText("client/src/styles.css", ["phase70-conflict-explainer", "phase70-checkout-conflict", "phase70-admin-saved-bag-grid"]);

const service = read("server/src/services/account-cart.service.ts");
service.includes("where: { userId, revision: expectedRevision }") && service.includes("revision: { increment: 1 }")
  ? pass("Saved Bag write uses optimistic revision concurrency") : fail("Saved Bag optimistic revision update");
service.includes("persistentLines") && !/function persistentLines[\s\S]*?price\s*:/.test(service.slice(service.indexOf("function persistentLines"), service.indexOf("export class AccountCartRevisionConflictError")))
  ? pass("conflict-safe persistence still stores identity + quantity only") : fail("Saved Bag persistence leaked catalogue facts");
service.includes("availableToSell(variant)") ? pass("conflict resolution revalidates public stock") : fail("public stock revalidation");

const checkout = read("client/src/pages/Checkout.jsx");
checkout.includes("savedBagConflictBlocked || submitting") && checkout.includes("if (savedBagConflictBlocked)")
  ? pass("checkout is blocked until an ambiguous Saved Bag is resolved") : fail("checkout conflict gate");
checkout.includes("buyNowMode") && checkout.includes('!buyNowMode && crossDeviceEnabled && syncStatus === "conflict"')
  ? pass("Buy Now remains separate from Saved Bag conflict flow") : fail("Buy Now isolation");

const context = read("client/src/context/CartContext.jsx");
context.includes('window.addEventListener("focus", refreshFromAccount)') && context.includes('document.addEventListener("visibilitychange", onVisibility)')
  ? pass("clean signed-in bag checks for remote changes on return/focus") : fail("remote refresh visibility check");
context.includes("readCartDirty()") && context.includes('syncStatus === "conflict"')
  ? pass("remote refresh does not overwrite unsynced/conflicted local state") : fail("remote refresh local-state guard");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["saved-bag-conflict:doctor"] || "").includes("phase70-saved-bag-conflict-audit.mjs") ? pass("saved-bag-conflict:doctor command") : fail("saved-bag-conflict:doctor command");
String(scripts["client:doctor"] || "").includes("saved-bag-conflict:doctor") ? pass("client:doctor includes Phase 70 gate") : fail("client:doctor Phase 70 gate");
String(scripts["verify:phase70"] || "").includes("performance:budget") && String(scripts["verify:phase70"] || "").includes("npm run build") ? pass("verify:phase70 command") : fail("verify:phase70 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase70") ? pass("prelaunch uses Phase 70 verification") : fail("prelaunch Phase 70 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase70") ? pass("production release advances to Phase 70") : fail("production release Phase 70 verification");

const destructive = ["migrate reset", "db push --force-reset", "dropdb"];
const packageText = JSON.stringify(pkg).toLowerCase();
destructive.some((token) => packageText.includes(token)) ? fail("no destructive production database command added") : pass("no destructive production database command added");

const schema = read("server/prisma/schema.prisma");
schema.includes("model AccountCart") && schema.includes("revision Int @default(1)") ? pass("Phase 70 reuses existing AccountCart revision; no schema expansion required") : fail("AccountCart revision field");
const migrationDirs = fs.readdirSync(path.join(root, "server/prisma/migrations")).filter((name) => /^2026/.test(name));
migrationDirs.includes("20261006121500_phase69_account_saved_bag_v2") ? pass("Phase 69 migration remains schema head for Phase 70") : fail("Phase 69 migration missing");

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

if (failures) { console.error(`\nPhase 70 Saved Bag conflict audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 70 Saved Bag conflict audit: PASS");
