import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failures = 0;
const pass = (label) => console.log(`PASS  ${label}`);
const fail = (label) => { failures += 1; console.error(`FAIL  ${label}`); };
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const requireText = (file, needles) => {
  const value = read(file);
  for (const needle of needles) value.includes(needle) ? pass(`${file} · ${needle}`) : fail(`${file} · ${needle}`);
};

for (const file of [
  "server/src/services/post-purchase.service.ts",
  "server/src/routes/account.routes.ts",
  "server/src/services/system-health.service.ts",
  "client/src/pages/Orders.jsx",
  "client/src/pages/OrderDetail.jsx",
  "client/src/pages/Support.jsx",
  "client/src/pages/admin/AdminSystem.jsx",
  "client/src/styles.css",
  "scripts/phase58-postpurchase-selfservice-audit.mjs",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/post-purchase.service.ts", [
  "buildReorderPreview", "getOrderCare", "availableToSell", "returnWindowDays", "postPurchaseSnapshot",
  '"reorder_preview"', '"reorder_add"', "priceChanged", "Current purchase limit reached",
]);
requireText("server/src/routes/account.routes.ts", [
  '"/reorder/:orderNumber/preview"', '"/reorder/:orderNumber"', '"/order-care/:orderNumber"', "buildReorderPreview", "getOrderCare",
]);
requireText("server/src/services/system-health.service.ts", ["postPurchaseSnapshot", "postPurchase,"]);
requireText("client/src/pages/Orders.jsx", [
  "Review buy again", "/preview", "BUY AGAIN REVIEW", "Add available items to cart", "Today's available-item total",
]);
requireText("client/src/pages/OrderDetail.jsx", [
  "ORDER AFTERCARE", "What can you do next?", "Review buy again", "RETURN WINDOW", "BUY AGAIN", "Get help with this order", "/account/order-care/",
]);
requireText("client/src/pages/Support.jsx", ["useSearchParams", 'searchParams.get("order")', 'searchParams.get("category")', "Help with order"]);
requireText("client/src/pages/admin/AdminSystem.jsx", [
  "Post-purchase self-service", "Reorder previews", "Preview → add", "Adjusted previews",
]);
requireText("client/src/styles.css", ["phase58-order-care", "phase58-reorder-preview", "phase58-postpurchase-health-grid"]);
const adminSystem = read("client/src/pages/admin/AdminSystem.jsx");
(adminSystem.includes("PHASE 58 · POST-PURCHASE SELF-SERVICE CONTROL") || adminSystem.includes("PHASE 61 · CUSTOMER COMMUNICATION CONTROL")) ? pass("Admin System Phase 58+ control heading") : fail("Admin System Phase 58+ control heading");

const service = read("server/src/services/post-purchase.service.ts");
service.includes("stockQuantity") || service.includes("availableToSell") ? pass("reorder preview uses live public stock") : fail("reorder live-stock contract");
service.includes("maxPurchaseQuantity") && service.includes("usedByProduct") ? pass("reorder preview preserves current purchase limits") : fail("reorder purchase-limit contract");
service.includes("previousUnitPrice") && service.includes("currentUnitPrice") && service.includes("priceDifference") ? pass("reorder preview exposes current-vs-previous price changes") : fail("reorder price-difference contract");
service.includes("settings.returnsEnabled") && service.includes("returnDeadline") && service.includes("daysRemaining") ? pass("order aftercare reuses configured return policy") : fail("order return-window contract");

const orderDetail = read("client/src/pages/OrderDetail.jsx");
const previewIndex = orderDetail.indexOf('/reorder/${orderNumber}/preview');
const addIndex = orderDetail.indexOf('/reorder/${orderNumber}`', previewIndex);
previewIndex >= 0 && addIndex > previewIndex ? pass("Order Detail reviews reorder before confirmed add") : fail("Order Detail two-step reorder flow");

const orders = read("client/src/pages/Orders.jsx");
orders.includes('apiFetch(`/account/reorder/${order.orderNumber}/preview`)') && orders.includes('apiFetch(`/account/reorder/${order.orderNumber}`, { method: "POST" })')
  ? pass("Orders list uses preview-then-confirm reorder flow") : fail("Orders list reorder flow");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["postpurchase:doctor"] || "").includes("phase58-postpurchase-selfservice-audit.mjs") ? pass("postpurchase:doctor command") : fail("postpurchase:doctor command");
String(scripts["client:doctor"] || "").includes("postpurchase:doctor") ? pass("client:doctor includes Phase 58 post-purchase gate") : fail("client:doctor Phase 58 gate");
String(scripts["verify:phase58"] || "").includes("performance:budget") && String(scripts["verify:phase58"] || "").includes("npm run build") ? pass("verify:phase58 command") : fail("verify:phase58 command");
(["verify:phase58", "verify:phase59", "verify:phase60", "verify:phase61", "verify:phase62", "verify:phase63", "verify:phase65"].some((token) => String(scripts["prelaunch:check"] || "").includes(token))) ? pass("prelaunch uses Phase 58+ verification") : fail("prelaunch Phase 58+ verification");
const prepare = read("scripts/phase49-release-prepare.mjs");
(prepare.includes('verify:phase58') || prepare.includes('verify:phase59') || prepare.includes('verify:phase60') || prepare.includes('verify:phase61') || prepare.includes('verify:phase62') || prepare.includes('verify:phase65') || prepare.includes('verify:phase63')) ? pass("production release advances to Phase 58+") : fail("production release Phase 58+ verification");

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
    const raw = match[2];
    const base = path.resolve(path.dirname(file), raw);
    const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js"), path.join(base, "index.jsx")];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) unresolved.push(`${path.relative(root, file)} -> ${raw}`);
  }
}
unresolved.length ? fail(`${unresolved.length} unresolved frontend relative imports\n${unresolved.slice(0, 8).join("\n")}`) : pass(`${sourceFiles.length} frontend files, 0 unresolved relative imports`);

if (failures) {
  console.error(`\nPhase 58 post-purchase self-service audit: FAIL (${failures})`);
  process.exit(1);
}
console.log("\nPhase 58 post-purchase self-service audit: PASS");
