import test from "node:test";
import assert from "node:assert/strict";
import {parseDotEnv,evaluateProductionEnvironment} from "./phase96-env-policy.mjs";
const secure={NODE_ENV:"production",DATABASE_URL:"postgresql://app_user:LongPassword_2026@db.internal:5432/riseora_prod",JWT_SECRET:"Riseora_Production_Random_Secret_64chars_!237ABcd!",PUBLIC_SITE_URL:"https://riseoraherbals.com",ALLOWED_ORIGINS:"https://riseoraherbals.com",RAZORPAY_KEY_ID:"rzp_live_sample",RAZORPAY_KEY_SECRET:"long-nonplaceholder-secret",RELEASE_VERSION:"phase96"};
test("dotenv parser retains secrets only in memory and supports quoted values",()=>{
 const env=parseDotEnv('  # comment\nexport NODE_ENV=production\nJWT_SECRET="alpha=bravo charlie"\nPORT=5000 # comment\n');
 assert.equal(env.JWT_SECRET,"alpha=bravo charlie");assert.equal(env.PORT,"5000");assert.equal(env.NODE_ENV,"production");
});
test("valid HTTPS, explicit origins and dedicated DB pass",()=>{const result=evaluateProductionEnvironment(secure);assert.equal(result.blocked,0);});
test("reject development database targets",()=>{const result=evaluateProductionEnvironment({...secure,DATABASE_URL:secure.DATABASE_URL.replace('riseora_prod','riseora_ecommerce_dev')});assert(result.issues.some(i=>i.code==='DEVELOPMENT_DATABASE'));});
test("reject localhost HTTP site",()=>{const result=evaluateProductionEnvironment({...secure,PUBLIC_SITE_URL:'http://localhost:5173'});assert(result.issues.some(i=>i.code==='PUBLIC_SITE_URL'));});
test("reject wildcard CORS",()=>{const result=evaluateProductionEnvironment({...secure,ALLOWED_ORIGINS:'*'});assert(result.issues.some(i=>i.code==='CORS_WILDCARD'));});
test("reject example JWT secrets",()=>{const result=evaluateProductionEnvironment({...secure,JWT_SECRET:'changeme'});assert(result.issues.some(i=>i.code==='JWT_SECRET'));});
test("reject partial gateway secrets",()=>{const result=evaluateProductionEnvironment({...secure,RAZORPAY_KEY_SECRET:''});assert(result.issues.some(i=>i.code==='PAYMENT_PAIR'));});
test("reject Razorpay test keys",()=>{const result=evaluateProductionEnvironment({...secure,RAZORPAY_KEY_ID:'rzp_test_123'});assert(result.issues.some(i=>i.code==='PAYMENT_TEST_MODE'));});
test("report contains no secret values",()=>{const result=evaluateProductionEnvironment({...secure,JWT_SECRET:'changeme'});assert(!JSON.stringify(result).includes(secure.DATABASE_URL));assert(!JSON.stringify(result).includes(secure.JWT_SECRET));});
