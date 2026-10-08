/** Read-only release candidate rehearsal. Does NOT alter production, payments, or inventory. */
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);const flag=k=>args.find(x=>x.startsWith(`--${k}=`))?.slice(k.length+3);
const full=args.includes('--full'), url=flag('url');
const commands=full
 ? [['npm',['run','verify:phase97']],['npm',['run','security:audit']]]
 : [['node',['scripts/phase97-source-audit.mjs']],['node',['--test','scripts/phase97-*.test.mjs']],['node',['scripts/phase96-schema-index-audit.mjs']],['node',['scripts/phase97-layout.mjs']]];
if(url)commands.push(['node',['scripts/phase97-public-probe.mjs',`--url=${url}`]]);
const items=[];
for(const [cmd,params] of commands){
 const start=Date.now();const executable=process.platform==='win32'&&cmd==='npm'?'npm.cmd':cmd;
 console.log(`\n> ${cmd} ${params.join(' ')}`);
 const result=spawnSync(executable,params,{cwd:process.cwd(),stdio:'inherit',windowsHide:true,timeout:full?600000:120000,shell:false});
 items.push({step:`${cmd} ${params.join(' ')}`,exitCode:result.status??1,durationMs:Date.now()-start});
 if(result.error||result.status!==0){console.error('NO_GO  Candidate stage failed; following stages not executed');break;}
}
const pass=items.length===commands.length&&items.every(x=>x.exitCode===0);
const report={version:'97.0',date:new Date().toISOString(),mode:full?'full':'light',readOnly:true,decision:pass?'REVIEW':'NO_GO',testsPassed:pass,steps:items,note:'REVIEW means further staging UAT, restore proof, payment gateway sandbox and owner sign-off are required; this runner never says production GO.'};
const dir=path.resolve('release-evidence');fs.mkdirSync(dir,{recursive:true});const f=path.join(dir,`phase97-candidate-${Date.now()}.json`);fs.writeFileSync(f,JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(`\nPhase 97 candidate rehearsal: ${report.decision} · report ${path.relative(process.cwd(),f)}`);
if(!pass)process.exitCode=1;
