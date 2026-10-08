import test from 'node:test';import assert from 'node:assert/strict';import {relationGraphErrors} from './phase98-relation-graph.mjs';
test('reciprocal relation graph passes',()=>{const r=relationGraphErrors('model A {\n  id String @id\n  b B?\n}\nmodel B {\n id String @id\n as A[]\n}\n');assert.deepEqual(r.errors,[]);assert.equal(r.models,2)});
test('orphan Prisma relation is blocking',()=>{const r=relationGraphErrors('model A {\n id String @id\n b B?\n}\nmodel B {\n id String @id\n}\n');assert.equal(r.errors.length,1);assert.match(r.errors[0],/A\.b/)});
test('array and optional field suffixes normalize',()=>{const r=relationGraphErrors('model A {\n id String @id\n bs B[]\n}\nmodel B {\n id String @id\n a A?\n}\n');assert.deepEqual(r.errors,[])});
test('non-model scalar fields are ignored',()=>{const r=relationGraphErrors('model A {\n id String @id\n count Int\n label String?\n}\n');assert.deepEqual(r.errors,[])});
