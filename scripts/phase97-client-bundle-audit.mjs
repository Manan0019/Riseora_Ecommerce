import fs from 'node:fs';import path from 'node:path';import {evaluateBundleFiles} from './phase97-bundle-policy.mjs';
const root=path.resolve('client/dist');
if(!fs.existsSync(root)){console.error('NO_GO  client/dist missing: run npm run build before bundle leak audit');process.exit(1);}
const files=[];let oversized=0;
function walk(at){for(const e of fs.readdirSync(at,{withFileTypes:true})){const target=path.join(at,e.name);if(e.isSymbolicLink()){console.error('NO_GO  Symlink in public build');process.exitCode=1;continue;}if(e.isDirectory()){walk(target);continue;}if(!e.isFile())continue;
 const relative=path.relative(root,target).replaceAll(path.sep,'/');const stat=fs.statSync(target);if(stat.size>12_000_000){oversized++;continue;}
 files.push({path:relative,content:/\.(?:js|css|html|json|txt)$/i.test(relative)?fs.readFileSync(target,'utf8'):''});}}
walk(root);const result=evaluateBundleFiles(files);
for(const f of result.findings)console.log(`${f.status}  ${f.code} · ${f.file}`);
if(oversized)console.log(`REVIEW  ${oversized} oversized assets not content-scanned`);
console.log(`Phase 97 public bundle privacy audit: ${result.decision} (${result.filesScanned} files examined)`);
if(result.decision==='NO_GO'||process.exitCode)process.exitCode=1;
