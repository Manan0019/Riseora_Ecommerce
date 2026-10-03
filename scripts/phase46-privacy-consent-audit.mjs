import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
const check = (label, ok) => checks.push({ label, ok: Boolean(ok) });
const exists = (rel) => fs.existsSync(path.join(root, rel));
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// Keep checking the refill files that were repeatedly omitted from older delta packages.
check("Phase 38 RefillPlanner retained", exists("client/src/components/RefillPlanner.jsx"));
check("Phase 38 customer Refills retained", exists("client/src/pages/Refills.jsx"));
check("Phase 38 Admin Refills retained", exists("client/src/pages/admin/AdminRefills.jsx"));
check("Phase 38 admin refill API retained", exists("server/src/routes/admin-refill.routes.ts"));
check("Phase 38 refill email retained", read("server/src/services/notification.service.ts").includes("sendRefillReminderEmail"));
check("REFILL notification type retained", read("server/src/services/notification-center.service.ts").includes('"REFILL"'));

check("Phase 46 migration", exists("server/prisma/migrations/20261004003000_phase46_privacy_consent_v2/migration.sql"));
const schema = read("server/prisma/schema.prisma");
check("MarketingPreference model", schema.includes("model MarketingPreference") && schema.includes("emailMarketing") && schema.includes("whatsappMarketing"));
check("ConsentEvent ledger model", schema.includes("model ConsentEvent") && schema.includes("ConsentPurpose") && schema.includes("ConsentDecision"));
check("PrivacyRequest model", schema.includes("model PrivacyRequest") && schema.includes("PrivacyRequestStatus"));
check("Newsletter unsubscribe token", schema.includes("unsubscribeToken String @unique"));
check("Privacy policy version snapshot", schema.includes("privacyPolicyVersion"));
check("Consent service", exists("server/src/services/consent.service.ts") && read("server/src/services/consent.service.ts").includes("recordConsentEvent"));
check("Customer privacy APIs", exists("server/src/routes/privacy.routes.ts") && read("server/src/index.ts").includes("privacyRoutes"));
check("Admin compliance APIs", exists("server/src/routes/admin-compliance.routes.ts") && read("server/src/index.ts").includes("adminComplianceRoutes"));
check("Privacy Center", exists("client/src/pages/PrivacyCenter.jsx") && read("client/src/App.jsx").includes('path="/privacy-center"'));
check("One-click unsubscribe page", exists("client/src/pages/Unsubscribe.jsx") && read("client/src/App.jsx").includes('path="/unsubscribe"'));
check("Secure guest email-preference link", read("server/src/routes/privacy.routes.ts").includes("/privacy/newsletter/manage-link") && read("server/src/services/notification.service.ts").includes("sendNewsletterPreferenceEmail"));
check("Admin compliance UI", exists("client/src/pages/admin/AdminCompliance.jsx") && read("client/src/App.jsx").includes('path="compliance"'));
check("Explicit newsletter consent", read("client/src/components/Footer.jsx").includes("newsletterConsent") && read("server/src/routes/engagement.routes.ts").includes("consent: z.literal(true)"));
check("Analytics consent ledger wiring", read("client/src/components/AnalyticsBridge.jsx").includes("/privacy/analytics-consent"));
check("Account export includes consent data", read("server/src/routes/account-security.routes.ts").includes("consentHistory") && read("server/src/routes/account-security.routes.ts").includes("privacyRequests"));
check("Admin cannot silently re-subscribe", read("server/src/routes/audience.routes.ts").includes("Marketing consent must be granted by the customer"));

const sourceRoot = path.join(root, "client", "src");
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) sourceFiles.push(full);
  }
}
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
console.log(`\nPhase 46 privacy/consent audit: ${failed.length ? "FAIL" : "PASS"}`);
if (failed.length) process.exit(1);
