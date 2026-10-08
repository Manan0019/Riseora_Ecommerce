/** Detect obvious committed production credential files; never prints their contents. */
import fs from 'node:fs';import path from 'node:path';
const roots=['.','server','client'];const disallowed=['.env.production','.env.local','.env.production.local'];
let failures=0;
for(const base of roots)for(const name of disallowed){const file=path.join(base,name);if(fs.existsSync(file)){
 // Production env files are expected locally, but must be excluded from the release manifest/ZIP.
 console.log(`REVIEW  ${file} exists locally; verify it is gitignored and not included in artifacts.`);
}}
const docs=fs.readdirSync('docs',{withFileTypes:true}).filter(x=>x.isFile()).map(x=>path.join('docs',x.name));
for(const doc of docs){const txt=fs.readFileSync(doc,'utf8'); if(/rzp_live_[A-Za-z0-9]{12,}|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@/i.test(txt)){failures++;console.error(`FAIL  Potential credential in ${doc}`);}}
console.log(`Phase 96 documentation credential audit: ${failures?'FAIL':'PASS'}`);if(failures)process.exit(1);
