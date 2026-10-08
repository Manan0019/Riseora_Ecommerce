import { readEnvironmentFile, evaluateProductionEnvironment } from "./phase96-env-policy.mjs";
import path from "node:path";
const args=process.argv.slice(2);
const file = args.find(x=>x.startsWith("--env="))?.slice(6) || "server/.env.production";
let env;
try { env = readEnvironmentFile(path.resolve(file)); }
catch { console.error("FAIL  Production environment file missing/unreadable. Use --env=server/.env.production"); process.exit(1); }
const result = evaluateProductionEnvironment({...env, ...Object.fromEntries(Object.entries(process.env).filter(([k])=>k.startsWith("PHASE96_OVERRIDE_" )).map(([k,v])=>[k.slice(17),v]))});
for(const issue of result.issues) console.log(`${issue.level}  ${issue.code} · ${issue.message}`);
console.log(`Phase 96 environment audit: ${result.decision} (${result.blocked} blockers, ${result.warnings} review items)`);
console.log("Credential values and connection strings were not logged.");
if(result.blocked) process.exit(1);
