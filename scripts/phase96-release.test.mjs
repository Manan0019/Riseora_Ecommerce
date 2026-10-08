import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
const file=path.resolve('scripts/phase49-release-prepare.mjs');
function invoke(args){return spawnSync(process.execPath,[file,...args],{cwd:process.cwd(),encoding:"utf8",timeout:10000});}
test("release plan is non-mutating without environment file",()=>{const r=invoke([]);assert.equal(r.status,0);assert.match(r.stdout,/PLAN ONLY/);assert.doesNotMatch(r.stdout,/^>.*db:deploy/m);});
test("execute cannot run without confirmation",()=>{const r=invoke(['--execute']);assert.notEqual(r.status,0);assert.match(r.stderr,/--confirm=RISEORA-LIVE/);});
test("operator must confirm; commands are not auto-run by default",()=>{
 const text=String(invoke([]).stdout);assert(text.indexOf('complete Phase 96 regression')<text.indexOf('production migration deploy'));assert(text.indexOf('verified PostgreSQL backup')<text.indexOf('production migration deploy'));
});
