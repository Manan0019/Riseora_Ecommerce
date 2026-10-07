import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
let failed = false;
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function pass(label) { console.log(`PASS ${label}`); }
function fail(label) { failed = true; console.error(`FAIL ${label}`); }
function expect(label, condition) { condition ? pass(label) : fail(label); }

const service = read("server/src/services/rto-recovery.service.ts");
expect("Phase 82 RTO recovery service", service.includes("getRtoRecoveryHealth") && service.includes("assertCodRtoCanClose") && service.includes("assertPrepaidRtoCanRefund"));
expect("physical return gate", service.includes("RTO_DELIVERED") && service.includes("Wait for physical RTO_DELIVERED evidence"));
expect("prepaid refund gate", service.includes("RTO_PREPAID_REFUND_REQUIRED") && service.includes("canRefundPrepaid"));
expect("COD collection contradiction", service.includes("RTO_COD_ALREADY_COLLECTED"));
expect("stock evidence audit", service.includes("ORDER_CANCELLATION") && service.includes("REFUND_RESTOCK") && service.includes("RTO_STOCK_RECOVERY_MISSING"));
expect("read-only health service", !/\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/.test(service));

const routes = read("server/src/routes/admin.routes.ts");
expect("order detail exposes RTO health", routes.includes("rtoRecovery") && routes.includes("getRtoRecoveryHealth"));
expect("atomic COD RTO close endpoint", routes.includes('"/orders/:id/rto-recovery/close"') && routes.includes("RTO delivered to origin; COD order stock restored") && routes.includes('status: "CANCELLED"'));
expect("COD RTO payment closure", routes.includes("COD not collected; parcel returned to origin") && routes.includes('status: "CANCELLED"'));
expect("prepaid shipped refund restricted to completed RTO", routes.includes("assertPrepaidRtoCanRefund") && routes.includes("RTO_REFUND_BLOCKED"));
expect("coupon rollback retained", routes.includes("couponRedemption.deleteMany") && routes.includes("usageCount: { decrement: 1 }"));

const ops = read("server/src/routes/admin-ops.routes.ts");
expect("fulfilment RTO health summary", ops.includes("fulfilmentRtoRecoveryHealth") && ops.includes("rtoRecoveryHealth") && ops.includes("rtoReadyToClose"));

const detail = read("client/src/pages/admin/AdminOrderDetail.jsx");
expect("Admin Order Phase 82 panel", detail.includes("PHASE 82 · RTO RECOVERY") && detail.includes("Close COD RTO & restore stock") && detail.includes("Refund prepaid RTO & close order"));
expect("stock-restoration warning", detail.includes("Do not restore stock yet") && detail.includes("RTO_DELIVERED"));

const fulfilment = read("client/src/pages/admin/AdminFulfilment.jsx");
expect("Admin Fulfilment Phase 82 health", fulfilment.includes("PHASE 82 · RTO RECOVERY") && fulfilment.includes("PREPAID REFUND") && fulfilment.includes("COD READY TO CLOSE"));

const pkg = JSON.parse(read("package.json"));
expect("rto-recovery:doctor command", Boolean(pkg.scripts?.["rto-recovery:doctor"]));
expect("verify:phase82 command", Boolean(pkg.scripts?.["verify:phase82"]));

const prepare = read("scripts/phase49-release-prepare.mjs");
expect("production release advances to phase82", prepare.includes('verify:phase82'));
const releaseAudit = read("scripts/phase49-production-release-audit.mjs");
expect("production audit recognizes phase82", releaseAudit.includes('"verify:phase82"'));

const migrationRoot = path.join(root, "server", "prisma", "migrations");
let phase82Migration = false;
if (fs.existsSync(migrationRoot)) {
  for (const name of fs.readdirSync(migrationRoot)) if (/phase82|rto_recovery/i.test(name)) phase82Migration = true;
}
expect("no Phase 82 database migration", !phase82Migration);

for (const script of ["scripts/phase82-rto-recovery-audit.mjs", "scripts/phase49-production-release-audit.mjs", "scripts/phase49-release-prepare.mjs"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, script)], { encoding: "utf8" });
  expect(`${script} syntax`, result.status === 0);
}

console.log(`\nPhase 82 RTO recovery audit: ${failed ? "FAIL" : "PASS"}`);
if (failed) process.exit(1);
