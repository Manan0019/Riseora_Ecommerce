import fs from "node:fs";
import path from "node:path";

const root = process.cwd(); let failed = 0;
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const ok = (label, condition) => condition ? console.log(`PASS  ${label}`) : (failed += 1, console.error(`FAIL  ${label}`));
const schema = read("server/prisma/schema.prisma");
const migration = read("server/prisma/migrations/20261007163000_phase85_service_recovery_customer360_v2/migration.sql");
const service = read("server/src/services/support-recovery.service.ts");
const admin = read("server/src/routes/admin-ops.routes.ts");
const customer = read("server/src/routes/return.routes.ts");
const adminUi = read("client/src/components/AdminSupportOperations.jsx");
const customerUi = read("client/src/components/SupportCaseCenter.jsx");
const css = read("client/src/styles.css");
const pkg = JSON.parse(read("package.json"));

ok("Phase 85 migration exists", migration.includes('CREATE TYPE "SupportRecoveryKind"') && migration.includes('CREATE TABLE "SupportRecoveryGrant"'));
ok("schema persists one recovery grant per case", schema.includes("model SupportRecoveryGrant") && schema.includes("ticketId String @unique"));
ok("schema supports coupon and reward-point recovery", schema.includes("enum SupportRecoveryKind") && schema.includes("COUPON") && schema.includes("REWARD_POINTS"));
ok("customer 360 is read-only", !/\.create\(|\.update\(|\.delete\(|\.upsert\(/.test(service));
ok("30-day anti-abuse limits exist", service.includes("maxGrantsPerCustomer: 2") && service.includes("maxCouponTotal: 1000") && service.includes("maxPointsTotal: 1000"));
ok("customer 360 profile exists", service.includes("phase85Customer360Profile") && service.includes("frictionScore") && service.includes("relationshipTier"));
ok("admin profile endpoint", admin.includes('/phase85-customer360'));
ok("service recovery endpoint", admin.includes('/phase85-recovery'));
ok("case assignment enforced before recovery", admin.includes("assign this case to yourself before issuing a benefit"));
ok("coupon grant is single-use and customer-owned", admin.includes("usageLimit: 1") && admin.includes("rewardOwnerUserId: current.userId"));
ok("reward grant creates auditable transaction", admin.includes('type: "ADMIN_ADJUST"') && admin.includes('sourceKey: `support-recovery/${current.id}`'));
ok("customer receives support notification", admin.includes("Riseora care benefit") && admin.includes('type: "SUPPORT"'));
ok("customer support API exposes recovery grant", customer.includes("recoveryGrant: true"));
ok("admin Customer 360 UI", adminUi.includes("PHASE 85 · CUSTOMER 360") && adminUi.includes("FRICTION SCORE"));
ok("admin controlled recovery UI", adminUi.includes("CONTROLLED SERVICE RECOVERY") && adminUi.includes("Issue care benefit"));
ok("customer sees issued benefit", customerUi.includes("PHASE 85 · RISEORA CARE BENEFIT"));
ok("Phase 85 styles", css.includes("phase85-customer360-panel") && css.includes("phase85-customer-benefit"));
ok("service-recovery:doctor command", Boolean(pkg.scripts?.["service-recovery:doctor"]));
ok("verify:phase85 command", Boolean(pkg.scripts?.["verify:phase85"]));
ok("prelaunch advances to phase85", String(pkg.scripts?.["prelaunch:check"] || "").includes("npm run verify:phase85"));
ok("dependency pins repair terminal audit findings", pkg.devDependencies?.concurrently === "10.0.5" && pkg.overrides?.["shell-quote"] === "1.12.0" && pkg.overrides?.["source-map-js"] === "1.2.2");

if (failed) { console.error(`\nPhase 85 service recovery audit: FAIL (${failed})`); process.exit(1); }
console.log("\nPhase 85 service recovery audit: PASS");
