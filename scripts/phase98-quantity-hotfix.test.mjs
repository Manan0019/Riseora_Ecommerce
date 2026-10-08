import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {auditPhase72,phase72Tokens} from './phase72-cart-quantity-readiness-audit.mjs';
function makeFixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'riseora-phase72-compat-'));
  function write(rel, txt){const full=path.join(root,rel); fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,txt);}
  const paths=Object.entries(phase72Tokens);
  for(const [name,tokens] of paths) write(name,tokens.join('\n'));
  // Add all cross-file behavioral evidence from the previously passing full Windows audit.
  fs.appendFileSync(path.join(root,'server/src/services/cart-quantity-intelligence.service.ts'),'\nsafetyStock\n');
  fs.appendFileSync(path.join(root,'client/src/pages/Cart.jsx'),'\napplySafeCartQuantities\n');
  write('client/src/pages/Home.jsx','export default function Home(){return null}');
  write('server/prisma/schema.prisma','model AccountCart {\n id String @id\n items Json\n revision Int\n}\n');
  write('server/prisma/migrations/20261006121500_phase69_account_saved_bag_v2/migration.sql','select 1;');
  write('package.json',JSON.stringify({scripts:{
    'quantity:doctor':'node scripts/phase72-cart-quantity-readiness-audit.mjs',
    'client:doctor':'npm run quantity:doctor',
    'verify:phase72':'npm run client:doctor',
    'prelaunch:check':'npm run verify:phase98'
  }}));
  write('scripts/phase49-release-prepare.mjs','npm run verify:phase98');
  return {root,write,cleanup(){fs.rmSync(root,{recursive:true,force:true});}};
}
const failures=(r)=>r.filter(x=>x.status==='FAIL').map(x=>x.name);
test('Phase 72 historic checkout with future Phase 98 migration passes',t=>{
  const f=makeFixture();t.after(f.cleanup);
  f.write('server/prisma/migrations/20261008113000_phase98_visual_storefront_studio_v2/migration.sql','select 1;');
  const result=auditPhase72({root:f.root});
  assert.deepEqual(failures(result),[]);
  assert.equal(result.filter(x=>x.status==='DEFERRED').length,0,'full checkout must never defer tests');
  assert.ok(result.some(x=>x.name.includes('future legitimate migration heads allowed')&&x.status==='PASS'));
});
test('Unexpected Phase 72 migration is still blocked',t=>{
  const f=makeFixture();t.after(f.cleanup);
  f.write('server/prisma/migrations/20261006130000_phase72_unexpected/migration.sql','select 1;');
  assert.ok(failures(auditPhase72({root:f.root})).some(x=>x.includes('Phase 72 added no migration')));
});
test('Critical Phase 72 cart source contract remains mandatory',t=>{
  const f=makeFixture();t.after(f.cleanup);
  const file=path.join(f.root,'client/src/pages/Cart.jsx');
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('APPLY SAFE QUANTITIES','REMOVED'));
  assert.ok(failures(auditPhase72({root:f.root})).some(x=>x.includes('APPLY SAFE QUANTITIES')));
});
test('Complete checkout cannot silently defer missing source',t=>{
  const f=makeFixture();t.after(f.cleanup);
  fs.unlinkSync(path.join(f.root,'server/src/services/cart-quantity-intelligence.service.ts'));
  assert.ok(failures(auditPhase72({root:f.root})).some(x=>x.includes('cart-quantity-intelligence.service.ts')));
});
test('Legacy missing Phase 69 saved-bag migration is blocked in complete checkout',t=>{
  const f=makeFixture();t.after(f.cleanup);
  fs.rmSync(path.join(f.root,'server/prisma/migrations/20261006121500_phase69_account_saved_bag_v2'),{recursive:true});
  assert.ok(failures(auditPhase72({root:f.root})).some(x=>x.includes('Phase 69 saved-bag migration')));
});
test('Destructive database commands are not exempted by compatibility fix',t=>{
  const f=makeFixture();t.after(f.cleanup);
  const file=path.join(f.root,'package.json');
  const p=JSON.parse(fs.readFileSync(file,'utf8'));
  p.scripts.danger='prisma migrate reset';
  fs.writeFileSync(file,JSON.stringify(p));
  assert.ok(failures(auditPhase72({root:f.root})).some(x=>x.includes('no destructive production')));
});
