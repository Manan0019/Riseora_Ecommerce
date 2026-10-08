import fs from 'node:fs';
import {validateTarget,probePublicCandidate} from './phase97-public-contract.mjs';
const args=process.argv.slice(2),v=k=>args.find(x=>x.startsWith(`--${k}=`))?.slice(k.length+3);
let origin;try{origin=validateTarget(v('url')||'');}catch(e){console.error(`NO_GO  ${e.message}`);process.exit(2);}
const report=await probePublicCandidate(origin,{systemPrefix:v('system-prefix')||'/api/system',adminPath:v('admin-path')||'/api/admin/phase97-launch/commerce'});
for(const g of report.gates)console.log(`${g.status}  ${g.code} · ${g.details} · ${g.durationMs}ms`);
console.log(`Phase 97 public launch contract: ${report.decision}`);
const output=v('json');if(output){fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log('Report saved (aggregate, no customer data).');}
if(report.blocked)process.exitCode=1;
