import test from 'node:test';import assert from 'node:assert/strict';import {summarizeMeasurements,LATENCY_POLICY} from './phase97-latency-policy.mjs';
test('p95 ranking includes slow samples near tail',()=>assert.equal(summarizeMeasurements([10,20,30,40,50].map(ms=>({ok:true,ms}))).p95Ms,50));
test('one failed request among ten is NO_GO',()=>assert.equal(summarizeMeasurements([...Array(9)].map(()=>({ok:true,ms:10})).concat([{ok:false,ms:10}])).decision,'NO_GO'));
test('zero samples cannot certify availability',()=>assert.equal(summarizeMeasurements([]).decision,'NO_GO'));
test('high p95 is not ignored when all requests returned HTTP 200',()=>assert.equal(summarizeMeasurements([100,100,3000].map(ms=>({ok:true,ms}))).decision,'NO_GO'));
test('safe max request cap is small',()=>assert(LATENCY_POLICY.maxRequests<=60&&LATENCY_POLICY.minIntervalMs>=200));
