import fs from 'node:fs';import path from 'node:path';import {assessMigrations} from './phase97-migration-policy.mjs';
const dir=path.resolve('server/prisma/migrations');
if(!fs.existsSync(dir)){console.error('NO_GO  Prisma migrations directory missing');process.exit(2);}
const migrations=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>({name:e.name,sql:fs.existsSync(path.join(dir,e.name,'migration.sql'))?fs.readFileSync(path.join(dir,e.name,'migration.sql'),'utf8'):''}));
const r=assessMigrations(migrations,{expectedMinimum:49,expectedHead:"20261008113000_phase98_visual_storefront_studio_v2"});
for(const e of r.errors)console.log(`NO_GO  ${e}`);
console.log(`Phase 97 migration source manifest: ${r.decision} · ${r.count} migrations · head ${r.head}`);
console.log(`Migration SHA256: ${r.fingerprint}`);
if(r.decision!=='GO')process.exitCode=1;
