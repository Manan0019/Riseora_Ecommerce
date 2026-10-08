/** Human sign-off is required; files alone must never auto-certify live payment or rollback readiness. */
export const REQUIRED_GATE_IDS = Object.freeze([
'STAGING_ISOLATED_DB','SCHEMA_VALIDATED','BUILD_TYPECHECK','DEPENDENCY_AUDIT','LOGIN_SECURITY',
'PRODUCT_STOCK','BAG_CHECKOUT','COD_ORDER','PAYMENT_CAPTURE','WEBHOOK_DUPLICATE',
'PAYMENT_FAILURE','PAYMENT_REFUND','COUPON_REWARD','FULFILMENT_SHIP','CANCEL_RESTOCK',
'RETURN_RTO','INBOUND_QA','FEFO_RECALL','MANUFACTURING_EXECUTION','EMAIL_NOTIFICATION',
'LEGAL_POLICY','DATA_PRIVACY','BACKUP_VERIFIED','RESTORE_DRILL','FILE_STORAGE','DOMAIN_TLS',
'PUBLIC_PROBES','SENSITIVE_CONFIG','ROLLBACK_PLAN','ALERTING_MONITORING','CUTOVER_APPROVAL','POST_DEPLOY_SMOKE'
]);
const placeholder=/^(?:TODO|TBD|NOT_SET|PENDING|NA|NONE|EXAMPLE|PLACEHOLDER|http:\/\/example|https:\/\/example)/i;
export function evaluateAcceptance(record,{now=new Date()}={}){
 const failures=[];const add=(code,id='RELEASE')=>failures.push({code,id});
 if(!record || typeof record!=='object'||!Array.isArray(record.gates)||!record.gates.length) return {decision:'NO_GO',failures:[{code:'GATES_MISSING',id:'RELEASE'}],passing:0,checked:0};
 const seen=new Set();let passing=0;
 for(const id of REQUIRED_GATE_IDS) if(!record.gates.some(g=>g?.id===id))add('REQUIRED_GATE_MISSING',id);
 for(const g of record.gates) if(!REQUIRED_GATE_IDS.includes(g?.id)) add('UNKNOWN_GATE',String(g?.id||'UNKNOWN'));
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{7,79}$/.test(String(record.releaseId||''))||placeholder.test(record.releaseId))add('INVALID_RELEASE_ID');
 if(!['staging','production'].includes(record.environment))add('INVALID_ENVIRONMENT');
 if(!/^[0-9a-f]{12,64}$/i.test(String(record.sourceTreeSha256||'')))add('SOURCE_HASH_MISSING');
 for(const g of record.gates){
  const id=String(g?.id||'UNKNOWN');
  if(seen.has(id))add('DUPLICATE_GATE',id);seen.add(id);
  if(!/^[A-Z][A-Z0-9_]{3,69}$/.test(id))add('INVALID_GATE_ID',id);
  if(g?.passed!==true){add('NOT_PASSED',id);continue;}
  if(typeof g.owner!=='string'||g.owner.trim().length<3||placeholder.test(g.owner.trim())){add('OWNER_REQUIRED',id);continue;}
  if(typeof g.evidence!=='string'||g.evidence.trim().length<12||placeholder.test(g.evidence.trim())){add('EVIDENCE_REQUIRED',id);continue;}
  const at=new Date(g.verifiedAt||'');
  if(!Number.isFinite(at.getTime())||at>now||now.getTime()-at.getTime()>7*86400000){add('EVIDENCE_STALE',id);continue;}
  passing++;
 }
 return {decision:failures.length?'NO_GO':'GO',failures,passing,checked:record.gates.length};
}
