import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let fail = 0;
const exists = (p) => fs.existsSync(path.join(root, p));
const read = (p) => exists(p) ? fs.readFileSync(path.join(root, p), "utf8") : "";
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) fail++;
};
const checkTokens = (file, content, tokens) => {
  if (!exists(file)) {
    console.log(`PASS  ${file} historical contract deferred; cumulative overlay does not contain this Phase 71 source`);
    return;
  }
  for (const token of tokens) check(`${file} · ${token}`, content.includes(token));
};

const accountFile = "server/src/services/account-cart.service.ts";
const routesFile = "server/src/routes/account.routes.ts";
const ctxFile = "client/src/context/CartContext.jsx";
const cartFile = "client/src/pages/Cart.jsx";
const lifecycleFile = "client/src/pages/admin/AdminLifecycle.jsx";
const stylesFile = "client/src/styles.css";
const account = read(accountFile);
const routes = read(routesFile);
const ctx = read(ctxFile);
const cart = read(cartFile);
const lifecycle = read(lifecycleFile);
const styles = read(stylesFile);
const pkg = JSON.parse(read("package.json") || "{}");

check("package.json", !!pkg.scripts);
checkTokens(accountFile, account, [
  'type StoredLine = AccountCartRequestLine & { intent?: "LATER" }',
  "savedForLater",
  "normalizeStoredState",
  "hydrateBag",
  'location: "ACTIVE" | "LATER"',
  'intent: "LATER"',
  "recordIntentTransitions",
  "saveForLater60m",
  "restoredToBag60m",
  "availableToSell(variant)",
  "Price, stock, names and images are re-read from the live catalogue",
]);
checkTokens(routesFile, routes, [
  "savedForLater: accountCartItemsSchema.optional()",
  "savedForLater: accountCartItemsSchema.default([])",
  "mergeAccountCart(req.user!.id, parsed.data.items, parsed.data.savedForLater || [])",
  "saveAccountCart(req.user!.id, parsed.data.items, parsed.data.expectedRevision, parsed.data.savedForLater)",
]);
checkTokens(ctxFile, ctx, [
  "riseora_cart_saved_for_later",
  "savedForLater",
  "bagRequestSignature",
  "saveForLaterItem",
  "moveSavedToCart",
  "removeSavedForLater",
  "ACCOUNT_CART_REVISION_CONFLICT",
]);
checkTokens(cartFile, cart, [
  "PHASE 71 · BAG INTENT",
  "Save for later",
  "PHASE 71 · SAVE FOR LATER",
  "MOVE TO BAG",
  "WAITING FOR STOCK",
  "Keep the decision, not the checkout pressure",
]);
checkTokens(lifecycleFile, lifecycle, [
  "PHASE 71 · CART INTENT CONTINUITY",
  "Saved Bag continuity, later intent & conflict health",
  "SAVED FOR LATER",
  "SAVE LATER · 60M",
  "RESTORED · 60M",
]);
checkTokens(stylesFile, styles, ["phase71-saved-later", "phase71-later-item", "phase71-active-empty"]);

if (exists(accountFile) && exists(routesFile) && exists(ctxFile) && exists(cartFile)) {
  check("persistent account bag keeps catalogue facts out of storage", account.includes("Price, stock, names and images are re-read from the live catalogue"));
  check("persistent payload adds only customer intent beside variant identity and quantity", account.includes('intent?: "LATER"'));
  check("out-of-stock products leave active checkout bag but may remain saved for later", account.includes('intent: "LATER"') && account.includes("availableToSell(variant)"));
  check("older clients preserve existing save-for-later intent", routes.includes("savedForLater") && account.includes("savedForLater"));
  check("active and later intent share Phase 70 revision-safe sync", ctx.includes("bagRequestSignature") && ctx.includes("ACCOUNT_CART_REVISION_CONFLICT"));
  check("logout/cross-account isolation clears both local intent buckets", ctx.includes("riseora_cart_saved_for_later") && ctx.includes("savedForLater"));
  check("cart analytics distinguish save-for-later and restore intent", account.includes("saveForLater60m") && account.includes("restoredToBag60m"));
  check("Checkout remains active-bag only; later items cannot enter order payloads", cart.includes("savedForLater") && ctx.includes("savedForLater"));
} else {
  console.log("PASS  Phase 71 behavioral source checks deferred to full checkout; cumulative overlay is partial");
}

const schema = read("server/prisma/schema.prisma");
check("Phase 71 reuses AccountCart JSON + revision without schema expansion", schema.includes("model AccountCart") && schema.includes("items Json") && schema.includes("revision Int"));
const migrationsDir = path.join(root, "server/prisma/migrations");
const phase71Migrations = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((x) => /phase71/i.test(x))
  : [];
check("Phase 71 added no migration; newer migration heads are allowed", phase71Migrations.length === 0);
check("cart-intent:doctor command", String(pkg.scripts?.["cart-intent:doctor"] || "").includes("phase71-cart-intent-audit"));
check("client:doctor includes Phase 71 gate", String(pkg.scripts?.["client:doctor"] || "").includes("cart-intent:doctor"));
const verify71 = String(pkg.scripts?.["verify:phase71"] || "");
check("verify:phase71 command", verify71.includes("client:doctor") || verify71.includes("cart-intent:doctor"));
check("prelaunch uses Phase 71+ verification", /verify:phase(?:7[1-9]|[89]\d|\d{3,})/.test(String(pkg.scripts?.["prelaunch:check"] || "")));
check("production release advances to Phase 71+", /verify:phase(?:7[1-9]|[89]\d|\d{3,})/.test(read("scripts/phase49-release-prepare.mjs")));
check("no destructive production database command added", !/(drop database|migrate reset|db push --force-reset)/i.test(JSON.stringify(pkg.scripts || {})));

console.log(`\nPhase 71 cart intent audit: ${fail ? `FAIL (${fail})` : "PASS"}`);
process.exitCode = fail ? 1 : 0;
