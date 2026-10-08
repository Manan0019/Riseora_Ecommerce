/** Diagnostic scan for legacy audits that still pin a global migration head.
 * Non-mutating. Reports potential follow-up blockers before the whole client doctor.
 * Does not suppress any checks or rewrite old phase scripts.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'scripts');
const potential=[];
for(const name of fs.readdirSync(dir).filter(n=>/^phase(?:7[3-9]|8[0-9])-.*audit\.mjs$/.test(n))){
  const src=fs.readFileSync(path.join(dir,name),'utf8');
  if (/unexpected migration head|unexpected latest migration|latest migration (?:must|is) |migration head(?:.*?)(?:===|!==|expectedHead)/i.test(src)) {
    potential.push(name);
  }
}
if(potential.length){
  console.log('REVIEW  Additional historical audits may contain hard-coded latest-migration assumptions:');
  potential.forEach(n=>console.log('REVIEW  '+n));
  console.log('REVIEW  These scripts are unchanged. If one fails, share that original script for a contract-preserving repair.');
}else console.log('PASS  No obvious old latest-migration-head checks detected in Phase 73–89 source audits present here.');
