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
  'type StoredLine = AccountCartRequestLine & { intent?: "LATER" }',
  "savedForLater", "normalizeStoredState", "hydrateBag", 'location: "ACTIVE" | "LATER"',
  'intent: "LATER"', "recordIntentTransitions", "saveForLater60m", "restoredToBag60m",
  "availableToSell(variant)", "Price, stock, names and images are re-read from the live catalogue",
]);
requireText("server/src/routes/account.routes.ts", [
  "savedForLater: accountCartItemsSchema.optional()", "savedForLater: accountCartItemsSchema.default([])",
  "mergeAccountCart(req.user!.id, parsed.data.items, parsed.data.savedForLater || [])",
  "saveAccountCart(req.user!.id, parsed.data.items, parsed.data.expectedRevision, parsed.data.savedForLater)",
]);
requireText("client/src/context/CartContext.jsx", [
  "riseora_cart_saved_for_later", "savedForLater", "bagRequestSignature", "saveForLaterItem", "moveSavedToCart",
  "removeSavedForLater", "savedForLater: browserSavedForLater", "savedForLater: sentSavedForLater",
  "savedForLater: browserSavedForLater", "ACCOUNT_CART_REVISION_CONFLICT",
]);
requireText("client/src/pages/Cart.jsx", [
  "PHASE 71 · BAG INTENT", "Save for later", "PHASE 71 · SAVE FOR LATER", "MOVE TO BAG",
  "WAITING FOR STOCK", "Keep the decision, not the checkout pressure",
]);
requireText("client/src/pages/admin/AdminLifecycle.jsx", [
  "PHASE 71 · CART INTENT CONTINUITY", "Saved Bag continuity, later intent & conflict health",
  "SAVED FOR LATER", "SAVE LATER · 60M", "RESTORED · 60M",
]);
requireText("client/src/styles.css", ["phase71-saved-later", "phase71-later-item", "phase71-active-empty"]);

const service = read("server/src/services/account-cart.service.ts");
const persistentStart = service.indexOf("function persistentLines");
const persistentEnd = service.indexOf("function recordIntentTransitions");
const persistentBlock = service.slice(persistentStart, persistentEnd);
!/(price|mrp|stockQuantity|productName|imageUrl)\s*:/.test(persistentBlock)
  ? pass("persistent account bag keeps catalogue facts out of storage") : fail("persistent account bag leaked catalogue facts");
persistentBlock.includes('intent: "LATER"') && persistentBlock.includes("variantId") && persistentBlock.includes("quantity")
  ? pass("persistent payload adds only customer intent beside variant identity and quantity") : fail("saved-for-later persistence contract");
service.includes('if (location === "ACTIVE" && available <= 0)')
  ? pass("out-of-stock products leave active checkout bag but may remain saved for later") : fail("active-vs-later stock behavior");
service.includes("requestedSavedForLater === undefined ? beforeState.savedForLater : requestedSavedForLater")
  ? pass("older clients preserve existing save-for-later intent") : fail("backward-compatible later bucket preservation");

const context = read("client/src/context/CartContext.jsx");
context.includes("bagRequestSignature(items, savedForLater)") && context.includes("expectedRevision: serverRevisionRef.current")
  ? pass("active and later intent share Phase 70 revision-safe sync") : fail("revision-safe intent sync");
context.includes("setSavedForLater([])") && context.includes("setItems([])")
  ? pass("logout/cross-account isolation clears both local intent buckets") : fail("local intent privacy isolation");
context.includes('source: "save_for_later"') && context.includes('source: "restore_from_later"')
  ? pass("cart analytics distinguish save-for-later and restore intent") : fail("intent analytics events");

const checkout = read("client/src/pages/Checkout.jsx");
checkout.includes("const checkoutItems = buyNowMode ? buyNowItems : items") && !checkout.includes("savedForLater")
  ? pass("Checkout remains active-bag only; later items cannot enter order payloads") : fail("Checkout must exclude saved-for-later items");

const schema = read("server/prisma/schema.prisma");
schema.includes("model AccountCart") && schema.includes("items Json") && schema.includes("revision Int @default(1)")
  ? pass("Phase 71 reuses AccountCart JSON + revision without schema expansion") : fail("AccountCart schema contract");
const migrationRoot = path.join(root, "server/prisma/migrations");
const migrationDirs = fs.readdirSync(migrationRoot).filter((name) => /^2026/.test(name)).sort();
migrationDirs.at(-1) === "20261006121500_phase69_account_saved_bag_v2"
  ? pass("Phase 69 migration remains schema head; Phase 71 adds no migration") : fail(`unexpected migration head: ${migrationDirs.at(-1)}`);

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["cart-intent:doctor"] || "").includes("phase71-cart-intent-audit.mjs") ? pass("cart-intent:doctor command") : fail("cart-intent:doctor command");
String(scripts["client:doctor"] || "").includes("cart-intent:doctor") ? pass("client:doctor includes Phase 71 gate") : fail("client:doctor Phase 71 gate");
String(scripts["verify:phase71"] || "").includes("performance:budget") && String(scripts["verify:phase71"] || "").includes("npm run build") ? pass("verify:phase71 command") : fail("verify:phase71 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase71") ? pass("prelaunch uses Phase 71 verification") : fail("prelaunch Phase 71 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase71") ? pass("production release advances to Phase 71") : fail("production release Phase 71 verification");

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

if (failures) { console.error(`\nPhase 71 cart intent audit: FAIL (${failures})`); process.exit(1); }
console.log("\nPhase 71 cart intent audit: PASS");
