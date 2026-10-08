import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateAcceptance,REQUIRED_GATE_IDS} from './phase97-acceptance-policy.mjs';
const template=()=>({releaseId:'release-2026-10-08-01',environment:'staging',sourceTreeSha256:'a'.repeat(64),gates:REQUIRED_GATE_IDS.map(id=>({id,passed:true,owner:'QA Lead',evidence:'test-run/receipt-12345',verifiedAt:new Date().toISOString()}))});
test('valid deliberately completed evidence passes',()=>assert.equal(evaluateAcceptance(template()).decision,'GO'));
test('default incomplete evidence never passes',()=>{const x=template();x.gates[0].passed=false;assert.equal(evaluateAcceptance(x).decision,'NO_GO');});
test('duplicate gate identity blocked',()=>{const x=template();x.gates.push({...x.gates[0]});assert(evaluateAcceptance(x).failures.some(f=>f.code==='DUPLICATE_GATE'));});
test('placeholders cannot certify evidence',()=>{const x=template();x.gates[0].evidence='TODO confirmation';assert(evaluateAcceptance(x).failures.some(f=>f.code==='EVIDENCE_REQUIRED'));});
test('future evidence cannot pass',()=>{const x=template();x.gates[0].verifiedAt='2099-01-01T00:00:00Z';assert(evaluateAcceptance(x).failures.some(f=>f.code==='EVIDENCE_STALE'));});
test('older than seven days cannot pass',()=>{const x=template();x.gates[0].verifiedAt='2020-01-01T00:00:00Z';assert(evaluateAcceptance(x).failures.some(f=>f.code==='EVIDENCE_STALE'));});
test('missing source fingerprint blocked',()=>{const x=template();x.sourceTreeSha256='';assert(evaluateAcceptance(x).failures.some(f=>f.code==='SOURCE_HASH_MISSING'));});
test('environment must be explicit',()=>{const x=template();x.environment='development';assert(evaluateAcceptance(x).failures.some(f=>f.code==='INVALID_ENVIRONMENT'));});

test('deleting a hard acceptance gate cannot generate false GO',()=>{const x=template();x.gates.pop();assert(evaluateAcceptance(x).failures.some(f=>f.code==='REQUIRED_GATE_MISSING'));});
