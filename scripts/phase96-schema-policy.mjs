/** Pure, dependency-free Prisma model/index name cross-check, not a substitute for prisma validate. */
export function auditSchemaIndexFields(schema){
 const models=[...String(schema).matchAll(/\bmodel\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
 const errors=[];let fieldsChecked=0;
 for(const [,name,body] of models){
   const fields=new Set([...body.matchAll(/^\s*(\w+)\s+[^@\s][^\n]*/gm)].map(m=>m[1]));
   for(const match of body.matchAll(/@@(?:unique|index|id)\s*\(\s*\[([^\]]+)\]/g)){
     for(const part of match[1].split(',')){
       const key=part.trim().split(/\s*\(/)[0];fieldsChecked++;
       if(!fields.has(key))errors.push({model:name,field:key});
     }
   }
 }
 return {modelCount:models.length,fieldsChecked,errors};
}
