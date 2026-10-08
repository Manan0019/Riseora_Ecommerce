import test from 'node:test';import assert from 'node:assert/strict';import {evaluateBundleFiles} from './phase97-bundle-policy.mjs';
test('ordinary compiled storefront can pass',()=>assert.equal(evaluateBundleFiles([{path:'assets/app.js',content:'console.log("shop")'}]).decision,'GO'));
test('database credential URL cannot appear in public build',()=>assert(evaluateBundleFiles([{path:'assets/app.js',content:'postgresql://user:pass@host/db'}]).findings.some(x=>x.code==='DATABASE_URL_IN_BUNDLE')));
test('JWT / Razorpay secret assignments are blocked',()=>assert.equal(evaluateBundleFiles([{path:'main.js',content:'JWT_SECRET="supersecretdata"'}]).decision,'NO_GO'));
test('environment file copied to dist is blocked',()=>assert.equal(evaluateBundleFiles([{path:'.env.production',content:''}]).decision,'NO_GO'));
test('source maps require explicit review, not automatic GO',()=>assert.equal(evaluateBundleFiles([{path:'assets/app.js.map',content:''}]).decision,'REVIEW'));
