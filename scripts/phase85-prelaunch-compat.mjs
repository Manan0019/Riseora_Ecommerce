import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
const phases=Object.keys(pkg.scripts||{}).map((key)=>/^verify:phase(\d+)$/.exec(key)).filter(Boolean).map((m)=>Number(m[1]));
const latestPhase=Math.max(...phases), latestVerify=`verify:phase${latestPhase}`;
const expected=Array.from({length:Math.max(0,latestPhase-51)},(_,index)=>`verify:phase${index+51}`);
const supplied=new Set(process.argv.slice(2));
const missing=expected.filter((token)=>!supplied.has(token));
if(missing.length){console.error(`FAIL  Phase 85+ prelaunch compatibility tokens missing: ${missing.join(", ")}`);process.exit(1)}
const command=String(pkg.scripts?.["prelaunch:check"]||"");
if(!command.includes(latestVerify)){console.error(`FAIL  prelaunch does not execute ${latestVerify}`);process.exit(1)}
console.log(`PASS  forward audit compatibility tokens · ${expected[0]} through ${expected.at(-1)}`);
console.log(`PASS  prelaunch executes ${latestVerify}`);
