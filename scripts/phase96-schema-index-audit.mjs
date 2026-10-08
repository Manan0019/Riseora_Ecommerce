/** Catch Phase 93-class invalid @@index / @@unique field references before deployment. */
import fs from 'node:fs';import {auditSchemaIndexFields} from './phase96-schema-policy.mjs';
const data=auditSchemaIndexFields(fs.readFileSync('server/prisma/schema.prisma','utf8'));
for(const error of data.errors)console.error(`FAIL  ${error.model} index references unknown field ${error.field}`);
console.log(`Phase 96 schema/index static audit: ${data.errors.length?'FAIL':'PASS'} · ${data.modelCount} models · ${data.fieldsChecked} fields checked`);
if(data.errors.length)process.exit(1);
