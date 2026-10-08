/** Phase 96 source, integration and non-destructive cutover audit. */
import fs from 'node:fs';import path from 'node:path';
let fail=0;const root=process.cwd();const read=p=>fs.readFileSync(path.join(root,p),'utf8');const exists=p=>fs.existsSync(path.join(root,p));
const check=(name,yes)=>{console.log(`${yes?'PASS':'FAIL'}  ${name}`);if(!yes)fail++;};
for(const file of [
 'server/src/services/phase96-launch-readiness.service.ts', 'server/src/routes/admin-ops.routes.ts',
 'client/src/components/AdminLaunchReadinessCenter.jsx','client/src/pages/admin/AdminFulfilment.jsx',
 'scripts/phase96-env-policy.mjs','scripts/phase96-env-audit.mjs','scripts/phase96-smoke.mjs',
 'scripts/phase96-release-evidence.mjs','scripts/phase96-schema-index-audit.mjs',
 'scripts/phase96-go-live-acceptance.mjs','scripts/phase96-backup-inventory.mjs',
 'scripts/phase96-env.test.mjs','scripts/phase96-smoke.test.mjs','scripts/phase96-release.test.mjs',
 '.github/workflows/phase96-release-gate.yml','docs/PHASE96_ACCEPTANCE_TEMPLATE.json',
 'docs/PHASE96_CUTOVER_RUNBOOK.md','docs/PHASE96_CUSTOMER_JOURNEY_UAT.md',
 'docs/PHASE96_BACKUP_RESTORE_DRILL.md','deployment/nginx/riseora.conf.example',
 'deployment/systemd/riseora.service.example'
])check(`required ${file}`,exists(file));
const service=read('server/src/services/phase96-launch-readiness.service.ts');
check('live dashboard is read-only',!/(?:db|client|prisma)\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/.test(service) && service.includes('readOnly:true'));
check('health checks fail closed',service.includes('"BLOCK",null,"Health query unavailable') && service.includes('MIGRATION_HEAD')&&service.includes('FAILED_MIGRATIONS'));
check('commerce and stock signals', ['NEGATIVE_STOCK','BATCH_QUANTITIES','ONLINE_PAYMENT_TRACE','PAYMENT_TOTALS','REFUND_LIMITS','QA_HOLD_SALE','STORE_POLICIES','DISPATCH_BACKLOG','QA_HOLDS','ACTIVE_RECALLS','SUPPORT_SLA','MAINTENANCE_BACKLOG'].every(s=>service.includes(s)));
const admin=read('server/src/routes/admin-ops.routes.ts');
check('admin endpoint behind authentication',admin.includes('router.use(requireAuth, requireAdmin)')&&admin.includes('/phase96-launch/readiness')&&admin.includes('Cache-Control", "no-store'));
check('admin UI mounted',read('client/src/pages/admin/AdminFulfilment.jsx').includes('<AdminLaunchReadinessCenter />')&&read('client/src/components/AdminLaunchReadinessCenter.jsx').includes('NO_GO'));
const prepare=read('scripts/phase49-release-prepare.mjs');
const order=['phase96-env-audit.mjs','phase49-release-doctor.mjs','verify:phase97','security:audit','phase96-release-evidence.mjs','db:backup','db:deploy','db:generate'].map(token=>prepare.indexOf(token));
check('production build before migration',order.every(n=>n>=0)&&order.every((n,i)=>i===0||n>order[i-1]));
check('safe non-destructive plan and confirm gate',prepare.includes('if(!execute)')&&prepare.includes('if(!confirmed)')&&prepare.includes('--confirm=RISEORA-LIVE'));
check('no destructive automatic migration',!/prisma migrate reset|migrate dev|db push/.test(prepare));
const packageJson=JSON.parse(read('package.json'));
check('full verification linked',packageJson.scripts['verify:phase97'].includes('npm run build') && packageJson.scripts['verify:phase97'].includes('npm run typecheck')&&packageJson.scripts['verify:phase97'].includes('launch:tests'));
check('latest prelaunch',packageJson.scripts['prelaunch:check'].includes('npm run verify:phase97'));
check('latest production preparation',prepare.includes('run("npm", ["run", "verify:phase97"])'));
check('smoke is safe GET-only',read('scripts/phase96-smoke.mjs').includes('method:"GET"')&&read('scripts/phase96-smoke.mjs').includes('AbortSignal.timeout'));
check('env secrets not exposed',!read('scripts/phase96-env-audit.mjs').includes('console.log(env)')&&read('scripts/phase96-env-policy.mjs').includes('JWT_SECRET'));
check('no Phase 96 migration',!fs.readdirSync('server/prisma/migrations').some(n=>n.includes('phase96')));
console.log(`\nPhase 96 launch readiness audit: ${fail?'FAIL':'PASS'} (${fail} failures)`);
if(fail)process.exit(1);
