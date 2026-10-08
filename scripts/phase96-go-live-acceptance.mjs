import fs from 'node:fs';
const file=process.argv.find(x=>x.startsWith('--file='))?.slice(7)||'docs/PHASE96_ACCEPTANCE_TEMPLATE.json';
let document;
try{document=JSON.parse(fs.readFileSync(file,'utf8'));}catch{console.error('NO_GO  Missing or invalid acceptance file');process.exit(2);}
if(!Array.isArray(document.gates)||!document.gates.length){console.error('NO_GO  No acceptance gates');process.exit(2);}
let blockers=0;for(const gate of document.gates){const valid=gate.passed===true&&typeof gate.evidence==='string'&&gate.evidence.trim().length>=8&&typeof gate.owner==='string'&&gate.owner.trim().length>=2;
 console.log(`${valid?'PASS':'NO_GO'}  ${gate.id} · ${gate.title}`);if(!valid)blockers++;
}
if(!document.releaseId||document.releaseId==='NOT_SET'){blockers++;console.error('NO_GO  Release identity not recorded');}
console.log(`Phase 96 human go-live signoff: ${blockers?'NO_GO':'GO'} · ${blockers} missing evidence/ownership gates`);
if(blockers)process.exit(1);
