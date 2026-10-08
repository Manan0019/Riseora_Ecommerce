/** Static Prisma relation-graph smoke test. Prisma CLI remains authoritative. */
import fs from 'node:fs';
export function relationGraphErrors(schema){
  const models=new Map([...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(m=>[m[1],m[2]]));
  const fields=new Map();
  for(const [name,body] of models){
    fields.set(name,body.split('\n').map(line=>line.trim().split(/\s+/)).filter(cols=>cols.length>1&&models.has(cols[1].replace(/[\[\]?]/g,''))).map(cols=>({name:cols[0],target:cols[1].replace(/[\[\]?]/g,'')})));
  }
  const errors=[];
  for(const [name,relations] of fields){for(const field of relations){if(!(fields.get(field.target)||[]).some(other=>other.target===name))errors.push(`${name}.${field.name} -> ${field.target}: missing reciprocal relation`);}}
  return {models:models.size,relations:[...fields.values()].reduce((n,a)=>n+a.length,0),errors};
}
if(process.argv[1]&&process.argv[1].replaceAll('\\','/').endsWith('/phase98-relation-graph.mjs')){
 const report=relationGraphErrors(fs.readFileSync('server/prisma/schema.prisma','utf8'));
 report.errors.forEach(error=>console.log('FAIL '+error));
 console.log(`Phase98 Prisma relation graph: ${report.errors.length?'FAIL':'PASS'} · ${report.models} models · ${report.relations} typed edges`);
 if(report.errors.length)process.exitCode=1;
}
