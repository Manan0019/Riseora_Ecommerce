/** Safe sequential readiness sampler. Not a load test; no sensitive auth or mutation. */
import {setTimeout as delay} from 'node:timers/promises';
import fs from 'node:fs';
import {validateTarget} from './phase97-public-contract.mjs';
import {LATENCY_POLICY,summarizeMeasurements} from './phase97-latency-policy.mjs';
const args=process.argv.slice(2),v=k=>args.find(x=>x.startsWith(`--${k}=`))?.slice(k.length+3);
let origin;try{origin=validateTarget(v('url')||'');}catch(e){console.error(`NO_GO  ${e.message}`);process.exit(2);}
const count=Number(v('requests')||12),interval=Number(v('interval-ms')||1000);
if(!Number.isInteger(count)||count<LATENCY_POLICY.minRequests||count>LATENCY_POLICY.maxRequests||!Number.isInteger(interval)||interval<LATENCY_POLICY.minIntervalMs||interval>LATENCY_POLICY.maxIntervalMs){console.error('NO_GO  Requests/interval exceed Phase 97 safe limits');process.exit(2);}
const maxP95=Number(v('max-p95-ms')||2500);if(!Number.isInteger(maxP95)||maxP95<100||maxP95>20000){console.error('NO_GO  Invalid max p95 budget');process.exit(2);}
const prefix=v('system-prefix')||'/api/system';
if(!/^\/[a-zA-Z0-9/_-]*$/.test(prefix)){console.error('NO_GO  Invalid API prefix');process.exit(2);}
const endpoint=new URL(prefix.replace(/\/$/,'')+'/health/ready',origin),samples=[];
for(let i=0;i<count;i++){
 const start=Date.now();let ok=false,status=0;
 try{const result=await fetch(endpoint,{method:'GET',redirect:'manual',headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000)});status=result.status;
 const data=await result.text();const parsed=JSON.parse(data);ok=result.status===200&&result.headers.get('content-type')?.includes('json')&&parsed&&typeof parsed==='object'&&parsed.success!==false&&!['down','error','unhealthy'].includes(String(parsed.status||'').toLowerCase());}catch{}
 samples.push({ok,status,ms:Date.now()-start});if(i<count-1)await delay(interval);
}
const summary=summarizeMeasurements(samples,{maxP95Ms:maxP95});
console.log(`Phase 97 readiness latency: ${summary.decision} · ${summary.requests} GETs · ${summary.failurePercent}% failed · p95 ${summary.p95Ms??'N/A'}ms`);
if(v('json'))fs.writeFileSync(v('json'),JSON.stringify({version:'97.0',endpoint:'/health/ready',...summary,samples},null,2)+'\n',{mode:0o600});
if(summary.decision!=='GO')process.exitCode=1;
