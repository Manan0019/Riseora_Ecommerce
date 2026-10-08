/** Non-destructive source migration manifest check. Database applied state requires db:status. */
import crypto from 'node:crypto';
export function assessMigrations(migrations,{expectedMinimum=48,expectedHead='20261008094000_phase95_maintenance_reliability_spares_v2'}={}){
 const errors=[];
 const names=migrations.map(m=>m.name).sort();
 if(names.length<expectedMinimum)errors.push('MIGRATION_SOURCE_INCOMPLETE');
 if(names.at(-1)!==expectedHead)errors.push('MIGRATION_HEAD_UNEXPECTED');
 if(new Set(names).size!==names.length)errors.push('MIGRATION_DUPLICATE_NAME');
 for(const m of migrations){if(!/^\d{14}_[a-z0-9_]+$/.test(m.name))errors.push('MIGRATION_NAME_INVALID');if(!m.sql||!m.sql.trim())errors.push('MIGRATION_EMPTY_SQL');}
 const fingerprint=crypto.createHash('sha256').update(migrations.sort((a,b)=>a.name.localeCompare(b.name)).map(m=>`${m.name}:${crypto.createHash('sha256').update(m.sql).digest('hex')}\n`).join('')).digest('hex');
 return {decision:errors.length?'NO_GO':'GO',count:names.length,head:names.at(-1)||null,errors:[...new Set(errors)],fingerprint};
}
