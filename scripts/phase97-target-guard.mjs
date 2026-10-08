/** Read-only cutover target identity protection. Does not query, create, or migrate databases. */
import fs from 'node:fs';
import {parseDotEnv} from './phase96-env-policy.mjs';
import {compareTargets} from './phase97-target-policy.mjs';
const flags=process.argv.slice(2);
const val=(k)=>flags.find(x=>x.startsWith(`--${k}=`))?.slice(k.length+3);
const envPath=val('env')||'server/.env.production';
const devPath=val('dev-env')||'server/.env';
function load(file){return fs.existsSync(file)?parseDotEnv(fs.readFileSync(file,'utf8')):{};}
const p=load(envPath), d=load(devPath);
const report=compareTargets(p,d,{allowLocal:flags.includes('--allow-local'),requireDevelopmentReference:!flags.includes('--no-dev-reference')});
const expected=val('expected')||p.PHASE97_TARGET_FINGERPRINT||'';
if(flags.includes('--require-pin') && !expected) report.findings.push({code:'PIN_REQUIRED',level:'BLOCK',message:'Explicitly pin the intended database fingerprint in PHASE97_TARGET_FINGERPRINT before production execution.'});
if(expected && report.targetFingerprint!==expected)report.findings.push({code:'PIN_MISMATCH',level:'BLOCK',message:'The configured database target differs from the operator-reviewed fingerprint.'});
report.decision=report.findings.some(x=>x.level==='BLOCK')?'NO_GO':'GO';
for (const f of report.findings) console.log(`${f.level}  ${f.code} · ${f.message}`);
console.log(`Target fingerprint: ${report.targetFingerprint||'UNAVAILABLE'} (credential-free hash)`);
console.log(`Phase 97 deployment target isolation: ${report.decision}`);
if(report.decision==='NO_GO') process.exitCode=1;
