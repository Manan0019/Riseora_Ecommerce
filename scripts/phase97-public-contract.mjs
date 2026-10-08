/** Phase 97: safe, GET-only public cutover contract. No cookies, auth, or order mutations. */
export function validateTarget(raw) {
  const target=new URL(raw);
  if(!['https:','http:'].includes(target.protocol)||target.username||target.password||target.search||target.hash||target.pathname!=='/') throw Error('Supply an origin-only public URL without credentials, path or query');
  if(target.protocol==='http:'&&!['localhost','127.0.0.1','[::1]','::1'].includes(target.hostname)) throw Error('HTTPS required for non-local targets');
  return target.origin;
}
const timeout=7000;
async function request(origin,path,accept='application/json'){
 const url=new URL(path,origin);
 const started=Date.now();
 try{
  const res=await fetch(url,{method:'GET',redirect:'manual',headers:{Accept:accept,'Cache-Control':'no-cache'},signal:AbortSignal.timeout(timeout)});
  const chunks=[];let total=0;
  if(res.body){const reader=res.body.getReader();while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>600000){await reader.cancel();return {ok:false,status:res.status,code:'RESPONSE_TOO_LARGE',durationMs:Date.now()-started};}chunks.push(Buffer.from(value));}}
  return {ok:true,status:res.status,type:res.headers.get('content-type')||'',cache:res.headers.get('cache-control')||'',headers:res.headers,body:Buffer.concat(chunks).toString('utf8'),durationMs:Date.now()-started};
 }catch{return {ok:false,status:0,code:'NETWORK_OR_TIMEOUT',durationMs:Date.now()-started};}
}
const gate=(code,status,details,ms=0)=>({code,status,details,durationMs:ms});
function verifyJson(p,label){
 if(!p.ok)return gate(label,'BLOCK',p.code,p.durationMs);
 if(p.status!==200)return gate(label,'BLOCK',`Expected HTTP 200, got ${p.status}`,p.durationMs);
 if(!/\bjson\b/i.test(p.type))return gate(label,'BLOCK','Content-Type is not JSON (possible SPA fallback)',p.durationMs);
 let parsed;try{parsed=JSON.parse(p.body);}catch{return gate(label,'BLOCK','Invalid JSON response',p.durationMs);}
 if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'||!Object.keys(parsed).length)return gate(label,'BLOCK','Empty/non-object JSON response',p.durationMs);
 const state=String(parsed.status||parsed.health||'').toLowerCase();
 if(parsed.success===false||['error','fail','failed','down','unhealthy','not_ready'].includes(state))return gate(label,'BLOCK','API explicitly reports unhealthy/failure',p.durationMs);
 return gate(label,'PASS',`JSON contract valid (${p.status})`,p.durationMs);
}
export async function probePublicCandidate(origin,{systemPrefix='/api/system',adminPath='/api/admin/phase97-launch/commerce'}={}){
 const gates=[];
 const paths=[['API_LIVENESS','/health/live'],['API_READY','/health/ready'],['API_RELEASE','/release']];
 for(const [code,path] of paths) gates.push(verifyJson(await request(origin,systemPrefix.replace(/\/$/,'')+path),code));
 const unauth=await request(origin,adminPath);
 if(!unauth.ok)gates.push(gate('ADMIN_REQUIRES_AUTH','BLOCK',unauth.code,unauth.durationMs));
 else if([401,403].includes(unauth.status))gates.push(gate('ADMIN_REQUIRES_AUTH','PASS',`Unauthenticated admin request rejected (${unauth.status})`,unauth.durationMs));
 else gates.push(gate('ADMIN_REQUIRES_AUTH','BLOCK',`Unauthenticated admin request returned ${unauth.status}; verify path and auth middleware`,unauth.durationMs));
 const home=await request(origin,'/','text/html');
 if(!home.ok||home.status!==200||!/<html[\s>]/i.test(home.body||''))gates.push(gate('STOREFRONT_HOME','BLOCK',`Missing homepage HTML / HTTP ${home.status||0}`,home.durationMs));
 else if(/<meta[^>]*name=["']robots["'][^>]*noindex/i.test(home.body)||/\bnoindex\b/i.test(home.headers.get('x-robots-tag')||''))gates.push(gate('STOREFRONT_HOME','BLOCK','Homepage is noindex',home.durationMs));
 else gates.push(gate('STOREFRONT_HOME','PASS','Public HTML reachable, not marked noindex',home.durationMs));
 const script=home.body||'';
 if(/(?:\.env(?:\.production)?|DATABASE_URL|JWT_SECRET|RAZORPAY_KEY_SECRET)\s*[:=]\s*["'][^"']{4,}/i.test(script))gates.push(gate('HOMEPAGE_SECRET_PATTERN','BLOCK','Sensitive configuration pattern appears in public HTML; inspect response without sharing secrets',home.durationMs));
 else gates.push(gate('HOMEPAGE_SECRET_PATTERN','PASS','No obvious private environment assignments in HTML',home.durationMs));
 const blocked=gates.filter(g=>g.status==='BLOCK').length;
 return {version:'97.0',readOnly:true,origin,checkedAt:new Date().toISOString(),decision:blocked?'NO_GO':'GO',blocked,gates,note:'GET-only contract. Full payment capture, refunds, cart, COD, checkout, and backup restore require staging UAT.'};
}
