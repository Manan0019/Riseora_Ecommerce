import fs from "node:fs";
import path from "node:path";

const root = process.cwd(); let failed = 0;
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const ok = (name, cond) => { if (cond) console.log(`PASS  ${name}`); else { console.error(`FAIL  ${name}`); failed++; } };

const schema = read("server/prisma/schema.prisma");
const migration = read("server/prisma/migrations/20261007143000_phase84_customer_care_service_ops_v2/migration.sql");
const customerRoutes = read("server/src/routes/return.routes.ts");
const adminRoutes = read("server/src/routes/admin-ops.routes.ts");
const service = read("server/src/services/support-operations.service.ts");
const customerUi = read("client/src/components/SupportCaseCenter.jsx") + read("client/src/pages/Returns.jsx") + read("client/src/pages/ReturnDetail.jsx");
const adminUi = read("client/src/components/AdminSupportOperations.jsx") + read("client/src/pages/admin/AdminReturns.jsx");
const styles = read("client/src/styles.css");
const pkg = JSON.parse(read("package.json"));
const prepare = read("scripts/phase49-release-prepare.mjs");
const prodAudit = read("scripts/phase49-production-release-audit.mjs");

ok("Phase 84 migration exists", migration.includes("SupportEscalationLevel") && migration.includes("SupportResolutionCode"));
ok("durable support SLA fields", schema.includes("slaDueAt DateTime?") && schema.includes("firstResponseAt DateTime?") && schema.includes("lastCustomerReplyAt DateTime?"));
ok("durable resolution evidence", schema.includes("resolutionCode SupportResolutionCode?") && schema.includes("resolutionSummary String?") && schema.includes("resolvedByUserId"));
ok("return-to-support linkage", schema.includes("returnRequestId String?") && schema.includes("supportTickets ContactMessage[]"));
ok("CSAT persisted", schema.includes("satisfactionScore Int?") && schema.includes("satisfactionSubmittedAt DateTime?"));
ok("support health service is read-only", !/prisma\.|\.create\(|\.update\(|\.delete\(|\.upsert\(/.test(service));
ok("priority and SLA policy", service.includes("phase84SupportPriority") && service.includes("phase84SupportSlaDueAt") && service.includes('priority === "URGENT" ? 4'));
ok("customer can create linked cases", customerRoutes.includes('router.post("/support-cases"') && customerRoutes.includes("returnRequestId"));
ok("customer conversation and reopen", customerRoutes.includes('/support-cases/:id/reply') && customerRoutes.includes('/support-cases/:id/reopen'));
ok("customer CSAT", customerRoutes.includes('/support-cases/:id/rating') && customerRoutes.includes("satisfactionSubmittedAt"));
ok("order ownership verified", customerRoutes.includes("Choose an order that belongs to your account"));
ok("return ownership verified", customerRoutes.includes("Return case does not belong to your account"));
ok("admin support operations summary", adminRoutes.includes('/support-cases/phase84-summary') && adminRoutes.includes("phase84SupportSummary"));
ok("admin assignment", adminRoutes.includes('/support-cases/:id/assign-to-me'));
ok("internal notes supported", adminRoutes.includes("isInternal: parsed.data.internal"));
ok("escalation workflow", adminRoutes.includes('/support-cases/:id/escalate') && adminRoutes.includes("nextEscalationLevel"));
ok("resolution requires evidence", adminRoutes.includes("resolutionSummary") && adminRoutes.includes("customerVisibleMessage") && adminRoutes.includes('/support-cases/:id/resolve'));
ok("customer notifications on reply/resolution", adminRoutes.includes("Support update ·") && adminRoutes.includes("Support case resolved ·"));
ok("customer care UI", customerUi.includes("Support & issue resolution") && customerUi.includes("Open a support case") && customerUi.includes("How was this support experience?"));
ok("return-linked support UI", customerUi.includes("linkedReturn"));
ok("admin command center UI", adminUi.includes("Customer Care Command Center") && adminUi.includes("Assign to me") && adminUi.includes("RESOLUTION EVIDENCE"));
ok("admin SLA + CSAT KPIs", adminUi.includes("SLA BREACH") && adminUi.includes("CSAT"));
ok("Phase 84 styling", styles.includes("Phase 84 — Customer Care Case Management"));
ok("support-operations:doctor command", Boolean(pkg.scripts?.["support-operations:doctor"]));
ok("verify:phase84 command", Boolean(pkg.scripts?.["verify:phase84"]));
ok("prelaunch advances to phase84", String(pkg.scripts?.["prelaunch:check"] || "").includes("verify:phase84"));
ok("production release advances to phase84", prepare.includes('verify:phase84'));
ok("production audit recognizes phase84", prodAudit.includes('"verify:phase84"'));

if (failed) { console.error(`\nPhase 84 support operations audit: FAIL (${failed})`); process.exit(1); }
console.log("\nPhase 84 support operations audit: PASS");
