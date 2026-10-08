import test from 'node:test';import assert from 'node:assert/strict';
import {databaseIdentity, compareTargets} from './phase97-target-policy.mjs';
const base='postgresql://service:secret@db.example:5432/riseora_live?schema=public';
test('target fingerprints are credential-free and password changes preserve identity',()=>{
 const a=databaseIdentity(base),b=databaseIdentity(base.replace('secret','different'));
 assert.equal(a.fingerprint,b.fingerprint);assert(!JSON.stringify(a).includes('secret'));
});
test('same production/development target is blocked even with different users',()=>{
 const r=compareTargets({DATABASE_URL:base},{DATABASE_URL:base.replace('service:secret','other:pw')});
 assert(r.findings.some(x=>x.code==='TARGET_EQUALS_DEVELOPMENT'));
});
test('dev/test database rejected for production',()=>{
 const r=compareTargets({DATABASE_URL:base.replace('riseora_live','riseora_test')},{DATABASE_URL:'postgresql://dev:x@localhost/riseora_dev'});
 assert(r.findings.some(x=>x.code==='NONPRODUCTION_DATABASE'));
});
test('DIRECT_URL drift is blocking',()=>{
 const r=compareTargets({DATABASE_URL:base,DIRECT_URL:base.replace('riseora_live','different')},{DATABASE_URL:'postgresql://dev:x@localhost/dev'});
 assert(r.findings.some(x=>x.code==='DIRECT_URL_DRIFT'));
});
test('local production targets require explicit override',()=>{
 const cfg={DATABASE_URL:'postgresql://u:p@127.0.0.1/riseora_live'},dev={DATABASE_URL:'postgresql://u:p@127.0.0.1/riseora_dev'};
 assert(compareTargets(cfg,dev).findings.some(x=>x.code==='LOCAL_DATABASE_REQUIRES_OVERRIDE'));
 assert.equal(compareTargets(cfg,dev,{allowLocal:true}).decision,'GO');
});
test('missing development baseline blocks unless consciously overridden',()=>{
 assert(compareTargets({DATABASE_URL:base},{}).findings.some(x=>x.code==='DEVELOPMENT_REFERENCE_MISSING'));
 assert.equal(compareTargets({DATABASE_URL:base},{},{requireDevelopmentReference:false}).decision,'GO');
});
test('invalid protocols rejected, credentials never shown',()=>{
 assert.throws(()=>databaseIdentity('mysql://u:s@host/db'));
 assert(!JSON.stringify(compareTargets({DATABASE_URL:'mysql://u:s@host/db'},{})).includes('mysql://'));
});
