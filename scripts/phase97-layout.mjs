/** Verify cumulative overlay was copied into the actual full application checkout. */
import fs from 'node:fs';
const strict=process.argv.includes('--strict');
const required=['package.json','package-lock.json','client/package.json','server/package.json','server/prisma/schema.prisma','server/prisma/prisma.config.ts','server/src/routes/order.routes.ts','server/src/routes/product.routes.ts','server/src/services/payment.service.ts','server/src/services/inventory.service.ts','client/src/App.jsx','client/src/pages/Checkout.jsx','scripts/db-backup.mjs','scripts/db-doctor.mjs'];
// Prisma config can live at server root rather than prisma/ in full project.
const valid=p=>p==='server/prisma/prisma.config.ts'?fs.existsSync('server/prisma.config.ts')||fs.existsSync('server/prisma/prisma.config.ts'):fs.existsSync(p);
const missing=required.filter(p=>!valid(p));
for(const p of missing)console.log(`${strict?'FAIL':'REVIEW'}  Full-checkout file unavailable: ${p}`);
console.log(`Phase 97 complete checkout: ${missing.length?'INCOMPLETE':'PASS'} · ${required.length-missing.length}/${required.length} required files`);
if(strict&&missing.length)process.exitCode=1;
