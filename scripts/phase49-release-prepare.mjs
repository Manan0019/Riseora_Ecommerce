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

console.log("Phase 59 safe production release preparation");
console.log("Order: doctor -> verified backup -> committed migrations -> Prisma -> schema check -> verification/build\n");
run("node", ["scripts/phase49-release-doctor.mjs"]);
run("npm", ["run", "db:backup", "--", "--env=server/.env.production"]);
run("npm", ["run", "db:deploy"]);
run("npm", ["run", "db:generate"]);
run("node", ["scripts/db-schema-status.mjs", "--production"]);
run("npm", ["run", "verify:phase61"]);
console.log("\nPhase 59 production release preparation: PASS");
console.log("Database rollback is intentionally not automated. Recover from a verified backup or ship an explicit forward-fix migration.");
