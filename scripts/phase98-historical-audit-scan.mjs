/**
 * Phase 98 historical migration-head compatibility scan.
 * Fail closed if any historical audit is absent or still pins the global latest
 * migration to Phase 69. This is a read-only source guard, not a migration tool.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(sourcePath), '..');

export const HISTORICAL_PHASES = Array.from({length:17},(_,i)=>i+73); // 73–89

export function scanHistoricalAudits({root=defaultRoot,phases=HISTORICAL_PHASES}={}) {
  const dir=path.join(root,'scripts');
  const findings=[];
  if(!fs.existsSync(dir))return [{code:'AUDIT_DIRECTORY_MISSING',file:'scripts'}];
  const entries=fs.readdirSync(dir);
  for(const phase of phases) {
    const names=entries.filter(n=>new RegExp(`^phase${phase}-.*audit\\.mjs$`).test(n));
    if(!names.length) { findings.push({code:'HISTORICAL_AUDIT_MISSING',phase}); continue; }
    for(const name of names) {
      const src=fs.readFileSync(path.join(dir,name),'utf8');
      const suspicious=[
        /(?:migrationDirs|migrations)\.at\(-1\)\s*(?:===|==|!==|!=)\s*['"`]/,
        /['"`]20261006121500_phase69_account_saved_bag_v2['"`]\s*(?:===|==|!==|!=)\s*(?:migrationDirs|migrations)\.at\(-1\)/,
        /unexpected migration head/i,
        /(?:phase69_account_saved_bag_v2|phase69.*saved.bag).{0,130}(?:latest migration|migration head|schema head)/i,
      ];
      if(suspicious.some(p=>p.test(src))) findings.push({code:'STALE_MIGRATION_HEAD',phase,file:name});
      // Phase 73–78 must retain specific no-migration invariants.
      if(phase>=73 && phase<=78) {
        if(!src.includes(`phase${phase}UnexpectedMigrations`) ||
           !src.includes('20261006121500_phase69_account_saved_bag_v2')) {
          findings.push({code:'MIGRATION_HISTORY_GUARD_MISSING',phase,file:name});
        }
      }
    }
  }
  return findings;
}

if(process.argv[1] && path.resolve(process.argv[1])===sourcePath){
  const findings=scanHistoricalAudits();
  for(const item of findings)console.error(`FAIL  ${item.code} · ${item.file||'Phase '+item.phase}`);
  console.log(findings.length
    ? `Phase 98 historical audit sweep: FAIL (${findings.length})`
    : 'Phase 98 historical audit sweep: PASS · all Phase 73–89 audits present · no stale global migration-head assertions');
  if(findings.length) process.exitCode=1;
}
