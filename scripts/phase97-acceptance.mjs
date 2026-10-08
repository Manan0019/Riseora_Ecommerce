import fs from 'node:fs';import {evaluateAcceptance} from './phase97-acceptance-policy.mjs';
const file=process.argv.find(x=>x.startsWith('--file='))?.slice(7)||'docs/PHASE97_CUTOVER_ACCEPTANCE.json';
let record;try{record=JSON.parse(fs.readFileSync(file,'utf8'));}catch{console.error('NO_GO  Acceptance file missing/invalid');process.exit(2);}
const result=evaluateAcceptance(record);
for(const f of result.failures)console.log(`NO_GO  ${f.id} · ${f.code}`);
console.log(`Phase 97 release acceptance: ${result.decision} (${result.passing}/${result.checked} passed)`);
if(result.decision!=='GO')process.exitCode=1;
