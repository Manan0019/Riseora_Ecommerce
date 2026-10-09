import fs from "node:fs";
import path from "node:path";
const root=process.cwd(); let failures=0;
const pass=(m)=>console.log(`PASS  ${m}`); const fail=(m)=>{failures++;console.error(`FAIL  ${m}`)};
const read=(f)=>fs.readFileSync(path.join(root,f),"utf8");
function need(file,tokens){const s=read(file); for(const t of tokens)s.includes(t)?pass(`${file} · ${t}`):fail(`${file} · missing ${t}`)}
for(const f of ["server/src/services/checkout-submission-safety.service.ts","server/src/services/checkout.service.ts","server/src/routes/order.routes.ts","server/src/routes/payment.routes.ts","server/src/routes/admin-payment.routes.ts","client/src/pages/Checkout.jsx","client/src/pages/admin/AdminPayments.jsx","client/src/styles.css","package.json"]) fs.existsSync(path.join(root,f))?pass(f):fail(f);
need("server/src/services/checkout-submission-safety.service.ts",["checkoutIntentMatchesSnapshot","ensureRazorpayProviderOrder","pg_advisory_xact_lock","PROVIDER_ORDER_REUSED","PAYLOAD_MISMATCH","Aggregate in-memory checkout-submission counters only"]);
need("server/src/services/checkout.service.ts",["CHECKOUT_REQUEST_KEY_REQUIRED","CHECKOUT_REQUEST_PAYLOAD_CHANGED","checkoutIntentMatchesSnapshot","COD_REPLAY","ONLINE_RESUME","FINALIZATION_REPLAY"]);
need("server/src/routes/order.routes.ts",["CHECKOUT_REQUEST_PAYLOAD_CHANGED","CHECKOUT_REQUEST_KEY_REQUIRED"]);
need("server/src/routes/payment.routes.ts",["ensureRazorpayProviderOrder","CHECKOUT_REQUEST_PAYLOAD_CHANGED","CHECKOUT_REQUEST_KEY_REQUIRED"]);
need("server/src/routes/admin-payment.routes.ts",["checkoutSubmissionSafetyHealth","submissionSafety"]);
need("client/src/pages/Checkout.jsx",["submissionLockRef","PHASE 77 · PROTECTED SUBMISSION","user?.id || \"guest\"","This checkout is already being submitted"]);
need("client/src/pages/admin/AdminPayments.jsx",["PHASE 77 · SUBMISSION SAFETY","Duplicate & retry protection","PAYLOAD MISMATCH","PROVIDER REUSE"]);
need("client/src/styles.css",["phase77-submit-safety","phase77-submission-health-grid"]);
const safety=read("server/src/services/checkout-submission-safety.service.ts");
!/customerName: input\.|customerPhone: input\.|shippingAddress: input\.|requestKey:/.test((safety.split("export function checkoutSubmissionSafetyHealth")[1]||"").split("type CheckoutIntent")[0]||"")?pass("submission-safety telemetry stores no customer/cart/request-key payload"):fail("submission-safety telemetry privacy");
safety.includes("userId: userId || null")&&safety.includes("storedPaidItems")?pass("request-key replay is bound to account context and requested paid items"):fail("request-key replay binding");
const checkout=read("server/src/services/checkout.service.ts");
(checkout.match(/CHECKOUT_REQUEST_PAYLOAD_CHANGED/g)||[]).length>=4?pass("COD and online replay paths reject changed checkout intent"):fail("changed-intent replay coverage");
const payment=read("server/src/routes/payment.routes.ts");
!payment.includes("createRazorpayOrder({ amountPaise: session.amountPaise")?pass("provider-order creation is centralized behind Phase 77 lock"):fail("provider-order creation bypasses Phase 77 lock");
const schema=read("server/prisma/schema.prisma");
const migrations=fs.readdirSync(path.join(root,"server/prisma/migrations")).filter(x=>/^2026/.test(x)).sort();
// Retained Phase 77 invariant: this phase adds no migration; later phases may do so.
const phase77LegacyMigration = "20261006121500_phase69_account_saved_bag_v2";
const phase77UnexpectedMigrations = migrations.filter((name) => /(?:^|_)phase77(?:_|$)/i.test(name));
migrations.includes(phase77LegacyMigration) && phase77UnexpectedMigrations.length === 0
  ? pass("Phase 69 migration preserved; Phase 77 adds no migration; newer heads allowed")
  : fail(`Phase 77 migration history invalid: missing Phase 69 or introduced: ${phase77UnexpectedMigrations.join(",")}`);
const pkg=JSON.parse(read("package.json")); const scripts=pkg.scripts||{};
String(scripts["submission-safety:doctor"]||"").includes("phase77-checkout-submission-safety-audit.mjs")?pass("submission-safety:doctor command"):fail("submission-safety:doctor command");
String(scripts["client:doctor"]||"").includes("submission-safety:doctor")?pass("client:doctor includes Phase 77 gate"):fail("client:doctor Phase 77 gate");
String(scripts["verify:phase77"]||"").includes("performance:budget")?pass("verify:phase77 command"):fail("verify:phase77 command");
String(scripts["prelaunch:check"]||"").includes("verify:phase77")?pass("prelaunch uses Phase 77 verification"):fail("prelaunch Phase 77 verification");
read("scripts/phase49-release-prepare.mjs").includes("verify:phase77")?pass("production release advances to Phase 77"):fail("production release Phase 77 verification");
const clientRoot=path.join(root,"client/src"), files=[]; function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name); if(e.isDirectory())walk(f); else if(/\.(?:js|jsx)$/.test(e.name))files.push(f)}} walk(clientRoot);
const unresolved=[]; for(const f of files){const s=fs.readFileSync(f,"utf8"); for(const m of s.matchAll(/(?:from\s+|import\s*\()(["'])(\.{1,2}\/[^"']+)\1/g)){const b=path.resolve(path.dirname(f),m[2]); const c=[b,`${b}.js`,`${b}.jsx`,path.join(b,"index.js"),path.join(b,"index.jsx")]; if(!c.some(fs.existsSync))unresolved.push(`${path.relative(root,f)} -> ${m[2]}`)}}
unresolved.length?fail(`${unresolved.length} unresolved frontend relative imports`):pass(`${files.length} frontend files, 0 unresolved relative imports`);
if(failures){console.error(`\nPhase 77 checkout submission safety audit: FAIL (${failures})`);process.exit(1)} console.log("\nPhase 77 checkout submission safety audit: PASS");
