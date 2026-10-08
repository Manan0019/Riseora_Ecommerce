/** Backup discovery is read-only; it cannot prove restore quality on its own. */
import fs from 'node:fs';
import path from 'node:path';
const file=process.argv.find(x=>x.startsWith('--directory='))?.slice(12)||'server/backups';
const days=Math.max(1,Math.min(365,Number(process.argv.find(x=>x.startsWith('--max-age-days='))?.split('=')[1]||7)));
if(!fs.existsSync(file)){console.error('BLOCK  Backup directory not found');process.exit(1);}
const backups=fs.readdirSync(file).filter(n=>n.endsWith('.dump')).map(name=>({name,stat:fs.statSync(path.join(file,name))})).filter(x=>x.stat.isFile()).sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs);
const latest=backups[0];if(!latest){console.error('BLOCK  No PostgreSQL .dump backup found');process.exit(1);}
const ageHours=Math.round((Date.now()-latest.stat.mtimeMs)/3600000);
console.log(`Backup inventory · ${backups.length} dumps; latest ${ageHours}h old; ${latest.stat.size} bytes`);
if(!latest.stat.size || ageHours>days*24){console.error(`BLOCK  No non-empty backup newer than ${days} days`);process.exit(1);}
console.log('PASS  Recent non-empty backup found. IMPORTANT: a separate isolated restore drill is still required.');
