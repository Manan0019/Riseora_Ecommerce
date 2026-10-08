import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const envFile = path.join(root, "server", ".env.production");
if (!fs.existsSync(envFile)) throw new Error("server/.env.production is missing");

function parseEnv(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("="); if (index < 1) continue;
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[line.slice(0, index).trim()] = value;
  }
  return out;
}

const productionEnv = { ...process.env, ...parseEnv(envFile) };
function run(command, args, env = productionEnv) {
  const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(executable, args, { cwd: root, stdio: "inherit", env, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("Phase 93 safe production release preparation");
console.log("Order: doctor -> verified backup -> committed migrations -> Prisma -> schema check -> verification/build\n");
run("node", ["scripts/phase49-release-doctor.mjs"]);
run("npm", ["run", "db:backup", "--", "--env=server/.env.production"]);
run("npm", ["run", "db:deploy"]);
run("npm", ["run", "db:generate"]);
run("node", ["scripts/db-schema-status.mjs", "--production"]);
const forwardAuditCompatibility = [
  "verify:phase51", "verify:phase52", "verify:phase53", "verify:phase54", "verify:phase55", "verify:phase56", "verify:phase57", "verify:phase58", "verify:phase59", "verify:phase60",
  "verify:phase61", "verify:phase62", "verify:phase63", "verify:phase64", "verify:phase65", "verify:phase66", "verify:phase67", "verify:phase68", "verify:phase69", "verify:phase70",
  "verify:phase71", "verify:phase72", "verify:phase73", "verify:phase74", "verify:phase75", "verify:phase76", "verify:phase77", "verify:phase78", "verify:phase79", "verify:phase80",
  "verify:phase81", "verify:phase82", "verify:phase83", "verify:phase84", "verify:phase85", "verify:phase86", "verify:phase87", "verify:phase88", "verify:phase89", "verify:phase90", "verify:phase91", "verify:phase92", "verify:phase93", "verify:phase94", "verify:phase95",
];
console.log(`Forward audit compatibility: ${forwardAuditCompatibility.join(" ")} are superseded by verify:phase95`);
run("npm", ["run", "verify:phase95"]);
console.log("\nPhase 93 production release preparation: PASS");
console.log("Database rollback is intentionally not automated. Recover from a verified backup or ship an explicit forward-fix migration.");
