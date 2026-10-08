/** Guarded, deterministic opt-in source integration for the full Windows Home.jsx.
 * Overlay packages never replace the user's original Home.jsx.
 * Requires TypeScript parser; reparse transformed file before atomic write.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(scriptDir,'..');
const home=path.resolve((process.argv.includes('--path')&&process.argv[process.argv.indexOf('--path')+1])||path.join(project,'client/src/pages/Home.jsx'));
const isCheck=process.argv.includes('--check'),dry=process.argv.includes('--dry-run');
const fail=m=>{console.error('BLOCKED Phase 98 homepage integration: '+m);process.exit(1)};
if(!fs.existsSync(home))fail('Home.jsx is not in this overlay. Run this inside the complete Riseora Windows checkout.');
const require=createRequire(import.meta.url);
let ts;
try{ts=require('typescript')}catch{try{ts=require(path.join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'))}catch{fail('TypeScript parser not installed. Run npm install before experience:mount.')}}
const source=fs.readFileSync(home,'utf8');
const marker='import PremiumHomeSections from "../components/PremiumHomeSections";';
if(source.includes(marker)&&source.includes('<PremiumHomeSections />')){console.log('PASS  Phase 98 homepage already mounted (idempotent)');process.exit(0)}
if(isCheck)fail('Home.jsx has not yet been mounted. Run npm run experience:mount.');
if(source.includes('PremiumHomeSections')&&!source.includes(marker))fail('Unexpected conflicting homepage integration; no edits made.');
const parsed=ts.createSourceFile(home,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
if(parsed.parseDiagnostics.length)fail('Original Home.jsx does not parse. Resolve existing syntax errors first.');
let component=null;
const defaultExport=parsed.statements.find(n=>ts.isExportAssignment(n)&&ts.isIdentifier(n.expression));
const exportedName=defaultExport?.expression?.text||'Home';
for(const node of parsed.statements){
 if(ts.isFunctionDeclaration(node)&&((node.name?.text===exportedName||node.name?.text==='Home')||node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword)))component=node;
 if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations){if(d.name?.getText(parsed)===exportedName||d.name?.getText(parsed)==='Home'&&d.initializer)component=d.initializer}
}
if(!component)fail('No recognizable Home component function; refusing to overwrite user source.');
let target=null;
const visit=node=>{
 if(node!==component&&ts.isFunctionLike(node))return;
 if(ts.isReturnStatement(node)&&node.expression){let expr=node.expression;while(ts.isParenthesizedExpression(expr))expr=expr.expression;if(ts.isJsxElement(expr)||ts.isJsxFragment(expr)||ts.isJsxSelfClosingElement(expr))target=expr;}
 ts.forEachChild(node,visit);
};
visit(component);
if(!target)fail('No unambiguous JSX root in Home return. Source unchanged.');
let updated;
if(ts.isJsxElement(target)){
 // JSX opening element end is the insertion point immediately after >.
 updated=source.slice(0,target.openingElement.end)+'\n      <PremiumHomeSections />'+source.slice(target.openingElement.end);
}else if(ts.isJsxFragment(target)){
 updated=source.slice(0,target.openingFragment.end)+'\n      <PremiumHomeSections />'+source.slice(target.openingFragment.end);
}else{
 updated=source.slice(0,target.getStart(parsed))+'<>\n      <PremiumHomeSections />\n'+source.slice(target.getStart(parsed),target.end)+'\n    </>'+source.slice(target.end);
}
updated=marker+'\n'+updated;
const reparsed=ts.createSourceFile(home,updated,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
if(reparsed.parseDiagnostics.length)fail('Transformed JSX would not parse; original preserved.');
const componentCount=(updated.match(/<PremiumHomeSections\s*\/>/g)||[]).length;
if(componentCount!==1)fail('Unexpected integration count; original preserved.');
if(dry){console.log('PASS  Phase 98 homepage patch would parse and mount once; no files changed');process.exit(0)}
const backup=home+'.phase98-before-integration.bak';
if(!fs.existsSync(backup))fs.copyFileSync(home,backup,fs.constants.COPYFILE_EXCL);
const temp=home+'.phase98-write-tmp';
fs.writeFileSync(temp,updated,'utf8');
fs.renameSync(temp,home);
console.log('PASS  Phase 98 homepage mounted safely · original backed up · JSX reparsed');
