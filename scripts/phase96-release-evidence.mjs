import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root=process.cwd();
const tracked=["package.json","package-lock.json","server/prisma/schema.prisma","server/prisma/migrations","client/src","server/src","scripts","DEPLOYMENT_PRODUCTION.md"];
const seen=[];
const ignore=(name)=>["node_modules","dist","build","generated",".git",".env",".env.production",".env.local","backups","uploads","release-evidence"].includes(name) || /^\.env\./.test(name);
function visit(abs){if(!fs.existsSync(abs))return;let stat=fs.lstatSync(abs);if(stat.isSymbolicLink())return;if(stat.isDirectory()){for(const name of fs.readdirSync(abs).sort())if(!ignore(name))visit(path.join(abs,name));return;}
 const rel=path.relative(root,abs).replaceAll(path.sep,"/");if(ignore(path.basename(abs)))return;const buf=fs.readFileSync(abs);seen.push({path:rel,size:buf.length,sha256:crypto.createHash("sha256").update(buf).digest("hex")});}
tracked.forEach(x=>visit(path.join(root,x)));
const report={phase:96,createdAt:new Date().toISOString(),fileCount:seen.length,files:seen,sourceTreeSha256:crypto.createHash("sha256").update(seen.map(x=>`${x.path}:${x.sha256}\n`).join("")).digest("hex"),note:"Source manifest only. Does not include secrets, DB dumps, uploads, git objects, or generated code."};
const dir=path.join(root,"release-evidence");fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,`phase96-${Date.now()}.json`);fs.writeFileSync(file,JSON.stringify(report,null,2)+"\n",{mode:0o600});console.log(`PASS  Release evidence written: ${path.relative(root,file)} (${report.fileCount} source files)`);console.log(`TREE SHA-256: ${report.sourceTreeSha256}`);
