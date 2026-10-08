import test from 'node:test';import assert from 'node:assert/strict';
import {inspectBackupBuffer} from './phase97-backup-policy.mjs';
const good=()=>Buffer.concat([Buffer.from('PGDMP'),Buffer.alloc(9000)]);
test('valid custom-archive header and size returns ARCHIVE_ONLY_PASS, not restored',()=>{const r=inspectBackupBuffer(good());assert.equal(r.decision,'ARCHIVE_ONLY_PASS');assert.equal(r.restoreProven,false);});
test('non-PostgreSQL payload rejected',()=>assert(inspectBackupBuffer(Buffer.from('not a backup')).findings.includes('NOT_POSTGRES_CUSTOM_ARCHIVE')));
test('truncated dump rejected',()=>assert(inspectBackupBuffer(Buffer.from('PGDMP')).findings.includes('ARCHIVE_TOO_SMALL')));
test('checksum mismatch rejected',()=>assert(inspectBackupBuffer(good(),{expectedSha256:'0'.repeat(64)}).findings.includes('SHA256_MISMATCH')));
test('verified SHA256 agrees on duplicate bytes',()=>{const r=inspectBackupBuffer(good());assert.equal(inspectBackupBuffer(good(),{expectedSha256:r.sha256}).decision,'ARCHIVE_ONLY_PASS');});
