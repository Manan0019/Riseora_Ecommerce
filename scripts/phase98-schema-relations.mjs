/** Exact regression guard for the Phase97 Prisma P1012 crash. No database connection. */
import fs from 'node:fs';
const schema=fs.readFileSync('server/prisma/schema.prisma','utf8');
const block=name=>schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1]||'';
let fail=0;const check=(label,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${label}`);if(!ok)fail++};
check('ManufacturingBom has no invalid MaintenanceSpareUsage relation',!block('ManufacturingBom').includes('maintenanceSpareUsages'));
check('ProductionOrder has no invalid routing operation relation',!block('ProductionOrder').includes('routingOperations ProductionRoutingOperation[]'));
check('MaintenanceSpareUsage links to owning product variant',block('MaintenanceSpareUsage').includes('variant ProductVariant'));
check('ProductionRoutingOperation links to ProductionRouting',block('ProductionRoutingOperation').includes('routing ProductionRouting'));
check('Phase 98 draft/published independent JSON',block('StorefrontExperience').includes('draft Json')&&block('StorefrontExperience').includes('published Json?'));
check('Phase 98 publication immutable history',block('StorefrontExperiencePublication').includes('snapshot Json')&&block('StorefrontExperiencePublication').includes('revision Int @unique'));
if(fail)process.exitCode=1;
