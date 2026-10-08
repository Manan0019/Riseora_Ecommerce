import test from 'node:test';import assert from 'node:assert/strict';
import {auditSchemaIndexFields} from './phase96-schema-policy.mjs';
test('valid unique/index model fields pass',()=>{
 const s=`model ManufacturingBom {\n  id String @id\n  outputVariantId String\n  version Int\n  @@unique([outputVariantId, version])\n  @@index([version])\n}`;
 const r=auditSchemaIndexFields(s);assert.deepEqual(r.errors,[]);assert.equal(r.fieldsChecked,3);
});
test('regression: Phase 93 unknown warehouseId index must fail',()=>{
 const s=`model ManufacturingBom {\n  id String @id\n  outputVariantId String\n  version Int\n  @@unique([outputVariantId, warehouseId, version])\n  @@index([status, outputVariantId, warehouseId])\n}`;
 const r=auditSchemaIndexFields(s);assert(r.errors.some(e=>e.field==='warehouseId'));assert(r.errors.some(e=>e.field==='status'));
});
test('sort and length index options do not create false field names',()=>{
 const s=`model Example {\n  id String @id\n  code String\n  @@index([code(sort: Desc)])\n}`;assert.deepEqual(auditSchemaIndexFields(s).errors,[]);
});
