import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const schema=fs.readFileSync('server/prisma/schema.prisma','utf8');const service=fs.readFileSync('server/src/services/phase97-commerce-readiness.service.ts','utf8');
function fieldsOf(name){const m=new RegExp('^model\\s+'+name+'\\s*\\{([\\s\\S]*?)^\\}','m').exec(schema);assert(m,`Missing model ${name}`);return new Set(m[1].split('\n').map(l=>/^\s*([A-Za-z_]\w*)\s+[^@\s]/.exec(l)?.[1]).filter(Boolean));}
const queries=[...service.matchAll(/sql:`([^`]+)`/g)].map(x=>x[1]);
test('all launch SQL is count-only, SELECT-only and PII-free',()=>{
 assert.equal(queries.length,13);
 for(const sql of queries){assert.match(sql,/^\s*SELECT\s+COUNT\s*\(\*\)/i);assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\s+(?:TABLE|INTO|[A-Za-z_])/i);assert.doesNotMatch(sql,/customerEmail|customerPhone|shippingAddress|passwordHash|token\b/i);}
});
test('every explicitly referenced SQL alias/field exists in Prisma schema',()=>{
 for(const sql of queries){const aliases=new Map();for(const m of sql.matchAll(/\b(?:FROM|JOIN)\s+"([A-Za-z_]\w*)"\s+([a-z]\w*)\b/g)){const fields=fieldsOf(m[1]);aliases.set(m[2],fields);}
  for(const m of sql.matchAll(/\b([a-z]\w*)\."([A-Za-z_]\w*)"/g)){assert(aliases.has(m[1]),`SQL alias ${m[1]} is unknown`);assert(aliases.get(m[1]).has(m[2]),`SQL field ${m[1]}.${m[2]} not found in model`);}
 }
});
