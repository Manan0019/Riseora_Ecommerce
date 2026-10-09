import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const flows=['phase97-release-candidate.yml','phase96-release-gate.yml'];

for (const flow of flows) {
  const yaml=fs.readFileSync(path.join(repo,'.github','workflows',flow),'utf8');
  test(`${flow} provides safe compile-time Prisma environment`,()=>{
    const match=yaml.match(/^\s+DATABASE_URL: (postgresql:\/\/[^\n]+)$/m);
    assert.ok(match,'DATABASE_URL must be provided by CI build only');
    const u=new URL(match[1]);
    assert.equal(u.protocol,'postgresql:');
    assert.equal(u.hostname,'127.0.0.1');
    assert.equal(u.pathname,'/riseora_ci_schema_only');
    assert.equal(u.password,'');
    assert.equal(u.username,'riseora_ci');
    assert.match(yaml,/npm run db:generate/);
    assert.match(yaml,/npm run typecheck/);
    assert.match(yaml,/npm run build/);
  });
  test(`${flow} never deploys or uses production credentials`,()=>{
    assert.doesNotMatch(yaml,/secrets[.\[]DATABASE_URL/);
    assert.doesNotMatch(yaml,/npm run (db:deploy|release:prepare)|prisma migrate (deploy|reset)|npm run launch:acceptance/);
    assert.match(yaml,/actions\/checkout@v5/);
    assert.match(yaml,/actions\/setup-node@v5/);
  });
}

test('Phase 97 keeps push and PR build verification',()=>{
  const yaml=fs.readFileSync(path.join(repo,'.github','workflows',flows[0]),'utf8');
  assert.match(yaml,/pull_request:/);
  assert.match(yaml,/branches: \[main, master\]/);
  assert.match(yaml,/npm run security:audit/);
  assert.match(yaml,/npm run candidate:tests/);
});
