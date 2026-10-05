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
  "server/src/services/product-trust.service.ts",
  "server/src/routes/product.routes.ts",
  "server/src/routes/admin.routes.ts",
  "client/src/pages/ProductDetails.jsx",
  "client/src/pages/admin/AdminReviews.jsx",
  "client/src/styles.css",
  "scripts/phase64-review-trust-audit.mjs",
]) fs.existsSync(path.join(root, file)) ? pass(file) : fail(file);

requireText("server/src/services/product-trust.service.ts", [
  "reviewTrustScore", "enrichReviewsForTrust", "reviewTrustSummary", "communityTrustHealth",
  "verifiedPercent", "photoPercent", "commonThemes",
  "Themes count neutral keyword mentions and do not infer medical efficacy or sentiment",
  "No new customer profiling store",
]);
requireText("server/src/routes/product.routes.ts", [
  "enrichReviewsForTrust", "reviewTrustSummary", "reviewTrustSummary: trustSummary", "qaTrustSummary",
]);
requireText("server/src/routes/admin.routes.ts", [
  '"/community/trust-health"', "communityTrustHealth",
]);
requireText("client/src/pages/ProductDetails.jsx", [
  "Verified only", "With photos", "Recommended", "Search answered questions",
  "phase64-review-trust-strip", "reviewTrustSummary", '"@type": "Review"', "reviewTrustScore",
]);
requireText("client/src/pages/admin/AdminReviews.jsx", [
  "PHASE 64 · TRUST & COMMUNITY", "Storefront trust health", "/admin/community/trust-health",
  "VERIFIED SHARE", "PHOTO REVIEWS", "PUBLISHED Q&amp;A",
]);
requireText("client/src/styles.css", [
  "phase64-review-trust-strip", "phase64-review-controls", "phase64-qa-search", "phase64-trust-health-grid",
]);

const trustService = read("server/src/services/product-trust.service.ts");
!/(prisma\.[A-Za-z0-9_]+\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany))\s*\(/.test(trustService)
  ? pass("Phase 64 trust service is read-only")
  : fail("Phase 64 trust service must remain read-only");
trustService.includes("isApproved: true") && trustService.includes("isPublished: true")
  ? pass("Admin trust health uses approved reviews and published Q&A")
  : fail("community trust moderation contract");

const productPage = read("client/src/pages/ProductDetails.jsx");
productPage.includes("verifiedOnly") && productPage.includes("photoOnly") && productPage.includes("reviewSort")
  ? pass("review trust filters and sorting wired")
  : fail("review trust filters contract");
productPage.includes("questionSearch") && productPage.includes("visibleQuestions")
  ? pass("storefront Q&A search wired")
  : fail("Q&A discovery contract");
productPage.includes('review: publicReviews.slice(0, 5).map')
  ? pass("approved review structured data included")
  : fail("review structured data contract");

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};
String(scripts["trust:doctor"] || "").includes("phase64-review-trust-audit.mjs") ? pass("trust:doctor command") : fail("trust:doctor command");
String(scripts["client:doctor"] || "").includes("trust:doctor") ? pass("client:doctor includes Phase 64 trust gate") : fail("client:doctor Phase 64 gate");
String(scripts["verify:phase64"] || "").includes("performance:budget") && String(scripts["verify:phase64"] || "").includes("npm run build") ? pass("verify:phase64 command") : fail("verify:phase64 command");
String(scripts["prelaunch:check"] || "").includes("verify:phase64") ? pass("prelaunch uses Phase 64 verification") : fail("prelaunch Phase 64 verification");
const prepare = read("scripts/phase49-release-prepare.mjs");
prepare.includes("verify:phase64") ? pass("production release advances to Phase 64") : fail("production release Phase 64 verification");

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
  console.error(`\nPhase 64 review trust audit: FAIL (${failures})`);
  process.exit(1);
}
console.log("\nPhase 64 review trust audit: PASS");
