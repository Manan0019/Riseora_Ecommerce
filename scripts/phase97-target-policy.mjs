import crypto from "node:crypto";

/** No secrets or complete connection strings are ever emitted. */
export function databaseIdentity(raw) {
  if (!raw) return null;
  const url = new URL(raw);
  if (!['postgres:','postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) throw Error('Invalid PostgreSQL target');
  const host = url.hostname.toLowerCase().replace(/\.$/,'');
  const port = url.port || '5432';
  const db = decodeURIComponent(url.pathname.slice(1));
  const schema = url.searchParams.get('schema') || 'public';
  if (/[/\s]/.test(db) || !schema || /[/\s]/.test(schema)) throw Error('Invalid database/schema name');
  return {host, port, db, schema, fingerprint:crypto.createHash('sha256').update(`${host}|${port}|${db}|${schema}`).digest('hex').slice(0,16)};
}

export function compareTargets(environment, development, {allowLocal = false, requireDevelopmentReference = true} = {}) {
  const findings=[];
  const add=(code,level,message)=>findings.push({code,level,message});
  let target, direct, dev;
  try { target=databaseIdentity(environment.DATABASE_URL); if(!target) throw Error(); }
  catch { add('TARGET_INVALID','BLOCK','DATABASE_URL must identify a valid PostgreSQL database.'); }
  try { if(environment.DIRECT_URL) direct=databaseIdentity(environment.DIRECT_URL); }
  catch { add('DIRECT_URL_INVALID','BLOCK','DIRECT_URL must identify a valid PostgreSQL database.'); }
  try { if(development.DATABASE_URL) dev=databaseIdentity(development.DATABASE_URL); }
  catch { add('DEVELOPMENT_REFERENCE_INVALID','BLOCK','Development DATABASE_URL could not be interpreted safely.'); }
  if (!dev && requireDevelopmentReference) add('DEVELOPMENT_REFERENCE_MISSING','BLOCK','Provide a local development DB reference to prove isolation before live cutover.');
  if(target && dev && target.fingerprint === dev.fingerprint) add('TARGET_EQUALS_DEVELOPMENT','BLOCK','Production/staging and development target the same host, port, DB and schema.');
  if(target && direct && target.fingerprint !== direct.fingerprint) add('DIRECT_URL_DRIFT','BLOCK','DIRECT_URL points at a different database/schema than DATABASE_URL. Use same logical database (proxy host differences require manual review).');
  if(target && /(^|[_-])(dev|test|testing|sample|demo)($|[_-])/i.test(target.db)) add('NONPRODUCTION_DATABASE','BLOCK','Launch database has a development/test-style name.');
  if(target && !allowLocal && ['localhost','127.0.0.1','::1'].includes(target.host)) add('LOCAL_DATABASE_REQUIRES_OVERRIDE','BLOCK','A local production DB requires explicit --allow-local and verified off-host backup/DR.');
  return {decision:findings.some(x=>x.level==='BLOCK')?'NO_GO':findings.length?'REVIEW':'GO', findings, targetFingerprint:target?.fingerprint || null, developmentDistinct:Boolean(target && dev && target.fingerprint!==dev.fingerprint)};
}
