import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {scanHistoricalAudits} from './phase98-historical-audit-scan.mjs';

const scripts=path.dirname(fileURLToPath(import.meta.url));
const root=path.dirname(scripts);
// Self-contained verified script targets. A root-level release manifest may be archived or
// omitted when overlays are copied; tests must not depend on that packaging metadata.
const manifest = Object.freeze([
  {
    "phase": 73,
    "target": "scripts/phase73-delivery-promise-audit.mjs",
    "patched_sha256": "bf12d2abbaa77a10b68e2763a76bca442a992f2119aacb17b1475b47c382978d"
  },
  {
    "phase": 74,
    "target": "scripts/phase74-payment-readiness-audit.mjs",
    "patched_sha256": "fa426842bab6c8c21ae5979f0d7902485e49d10e9dbb3aec7c99ac3521930a48"
  },
  {
    "phase": 75,
    "target": "scripts/phase75-address-readiness-audit.mjs",
    "patched_sha256": "57373a737cb3abc2055f9873c8f1662cf51e5983f9f118b02a8a32c5e55e60ad"
  },
  {
    "phase": 76,
    "target": "scripts/phase76-checkout-final-review-audit.mjs",
    "patched_sha256": "573f795f752a7436ade1a9c143bf27ed28b269b02238ef3d6d553aacc4491fe8"
  },
  {
    "phase": 77,
    "target": "scripts/phase77-checkout-submission-safety-audit.mjs",
    "patched_sha256": "b90af04fa0879a71c782b6dd9857b8e8dbe72df606c9d38cf60e329177c68358"
  },
  {
    "phase": 78,
    "target": "scripts/phase78-payment-confirmation-audit.mjs",
    "patched_sha256": "07802c0a50f40fa17c862bfe64702c6a62c51ab80ff34d50e39eaa4e661439fd"
  }
]);
const legacy='20261006121500_phase69_account_saved_bag_v2';
const newHead='20261008113000_phase98_visual_storefront_studio_v2';

function execHistory(phase, migrationNames) {
  const file=manifest.find(m=>m.phase===phase);
  const source=fs.readFileSync(path.join(root,file.target),'utf8');
  const code=source.match(new RegExp(`// Retained Phase ${phase} invariant:[\\s\\S]*?: fail\\(\`Phase ${phase} migration history invalid:[^\\n]*;`));
  assert.ok(code,`executable invariant exists for phase ${phase}`);
  const statuses=[];
  const context={migrationDirs:migrationNames,migrations:migrationNames,pass:(s)=>statuses.push({pass:true,message:s}),fail:(s)=>statuses.push({pass:false,message:s})};
  vm.runInNewContext(code[0],context);
  assert.equal(statuses.length,1);
  return statuses[0];
}

for(const m of manifest){
  const phase=m.phase;
  test(`Phase ${phase} accepts true historical migration and Phase 98 migration`,()=>{
    assert.equal(execHistory(phase,[legacy,newHead]).pass,true);
  });
  test(`Phase ${phase} rejects missing Phase 69 migration`,()=>{
    assert.equal(execHistory(phase,[newHead]).pass,false);
  });
  test(`Phase ${phase} rejects an unexpected Phase ${phase} migration`,()=>{
    assert.equal(execHistory(phase,[legacy,`20261009000000_phase${phase}_invalid`]).pass,false);
  });
  test(`Phase ${phase} preserves checked original code via recorded digest`,()=>{
    const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,m.target))).digest('hex');
    assert.equal(actual,m.patched_sha256);
  });
}

test('scan passes the actual complete Phase 73–89 overlay',()=>{
  assert.deepEqual(scanHistoricalAudits({root}),[]);
});

test('scan catches a reintroduced historical latest-head assertion',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'riseora-historical-'));
  try {
    fs.mkdirSync(path.join(temp,'scripts'));
    const file='phase73-delivery-promise-audit.mjs';
    let src=fs.readFileSync(path.join(scripts,file),'utf8');
    src+='\nconst x=migrationDirs.at(-1)==="20261006121500_phase69_account_saved_bag_v2";\n';
    fs.writeFileSync(path.join(temp,'scripts',file),src);
    assert.ok(scanHistoricalAudits({root:temp,phases:[73]}).some(x=>x.code==='STALE_MIGRATION_HEAD'));
  }finally {fs.rmSync(temp,{recursive:true,force:true});}
});

test('scan cannot silently pass when the source audit is missing',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'riseora-historical-'));
  try{
    fs.mkdirSync(path.join(temp,'scripts'));
    assert.ok(scanHistoricalAudits({root:temp,phases:[73]}).some(x=>x.code==='HISTORICAL_AUDIT_MISSING'));
  } finally{fs.rmSync(temp,{recursive:true,force:true});}
});
