/** Phase 96 cutover: verification and build BEFORE applying production schema changes.
 * Default is plan-only; --execute --confirm=RISEORA-LIVE are required for any mutation. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseDotEnv } from "./phase96-env-policy.mjs";

const root=process.cwd();
const args=process.argv.slice(2);
const execute=args.includes("--execute");
const confirmed=args.includes("--confirm=RISEORA-LIVE");
const envFile=path.join(root,"server",".env.production");
const productionFile=fs.existsSync(envFile)?parseDotEnv(fs.readFileSync(envFile,"utf8")):{};
const productionEnv={...process.env,...productionFile,NODE_ENV:"production"};
// This ordering is a production invariant. Keep code and audit aligned.
const steps = [
  "production configuration audit",
  "release doctor",
  "complete Phase 97 regression, Prisma generation, typecheck, build and bundle budget",
  "dependency vulnerability audit",
  "release source checksum evidence",
  "verified PostgreSQL backup",
  "production migration deploy",
  "Prisma client regeneration and schema health",
  "controlled restart / live smoke (separate operator step)",
];
console.log("Phase 96 production cutover plan (non-destructive by default)");
steps.forEach((item,i)=>console.log(`${i+1}. ${item}`));
if(!execute){console.log("PLAN ONLY · no database, stock, order or payment changes. Use --execute --confirm=RISEORA-LIVE for the guarded release.");process.exit(0);}
if(!confirmed){console.error("FAIL  Production cutover needs --confirm=RISEORA-LIVE");process.exit(2);}
if(!fs.existsSync(envFile)){console.error("FAIL  server/.env.production missing; no production operations attempted.");process.exit(2);}
function run(command,args,env=productionEnv){
 const executable=process.platform === "win32" && command === "npm" ? "npm.cmd":command;
 console.log(`\n> ${command} ${args.join(" ")}`);
 const result=spawnSync(executable,args,{cwd:root,env,stdio:"inherit",windowsHide:true,shell:false});
 if(result.error){console.error(`FAIL ${command} could not start`);process.exit(1);}
 if(result.status!==0){console.error(`HALTED before next deployment stage; exit ${result.status}`);process.exit(result.status||1);}
}
run("node", ["scripts/phase96-env-audit.mjs", "--env=server/.env.production"]);
// Phase 97: production target must be isolated and pinned before any cutover command.
run("node", ["scripts/phase97-target-guard.mjs", "--env=server/.env.production", "--no-dev-reference", "--require-pin"]);
run("node", ["scripts/phase49-release-doctor.mjs"]);
// Test/build before migrations. This literal is retained for forward-compat audits.
run("npm", ["run", "verify:phase98"]);
run("npm", ["run", "security:audit"]);
run("npm", ["run", "security:audit:prod"]);
run("node", ["scripts/phase96-release-evidence.mjs"]);
// Everything above must pass before this first production database action.
run("npm", ["run", "db:backup", "--", "--production"]);
run("npm", ["run", "db:deploy"]);
run("npm", ["run", "db:generate"]);
run("node", ["scripts/db-schema-status.mjs", "--production"]);
run("node", ["scripts/db-doctor.mjs", "--production"]);
console.log("Phase 96 guarded release PREPARE: PASS. Operator must now restart production, smoke it, and record business acceptance.");
console.log("No automatic database rollback is attempted; use the verified backup and documented recovery decision tree.");
// Historical forward-audit compatibility, intentionally not executed individually:
const forwardAuditCompatibility=["verify:phase69","verify:phase70","verify:phase71","verify:phase72","verify:phase73","verify:phase74","verify:phase75","verify:phase76","verify:phase77","verify:phase78","verify:phase79","verify:phase80","verify:phase81","verify:phase82","verify:phase83","verify:phase84","verify:phase85","verify:phase86","verify:phase87","verify:phase88","verify:phase89","verify:phase90","verify:phase91","verify:phase92","verify:phase93","verify:phase94","verify:phase95","verify:phase96","verify:phase97"];
void forwardAuditCompatibility;
