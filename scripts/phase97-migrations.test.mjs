import test from 'node:test';import assert from 'node:assert/strict';import {assessMigrations} from './phase97-migration-policy.mjs';
const sample=()=>[{name:'20261008094000_phase95_maintenance_reliability_spares_v2',sql:'SELECT 1;'}];
test('known immutable migration set can pass',()=>assert.equal(assessMigrations(sample(),{expectedMinimum:1}).decision,'GO'));
test('missing older source migrations cannot pass',()=>assert(assessMigrations(sample()).errors.includes('MIGRATION_SOURCE_INCOMPLETE')));
test('blank migration SQL cannot pass',()=>{const a=sample();a[0].sql='';assert(assessMigrations(a,{expectedMinimum:1}).errors.includes('MIGRATION_EMPTY_SQL'));});
test('duplicate folder names fail',()=>{const a=sample();a.push({...a[0]});assert(assessMigrations(a,{expectedMinimum:1}).errors.includes('MIGRATION_DUPLICATE_NAME'));});
test('unexpected migration head blocked',()=>assert(assessMigrations([{name:'20261008101010_other',sql:'SELECT 1'}],{expectedMinimum:1}).errors.includes('MIGRATION_HEAD_UNEXPECTED')));
