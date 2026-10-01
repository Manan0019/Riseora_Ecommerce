import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envFile = path.join(root, "server", ".env.production");
if (!fs.existsSync(envFile)) throw new Error("server/.env.production is missing");
function parseEnv(file) { const out = {}; for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) { const line = raw.trim(); if (!line || line.startsWith("#")) continue; const i = line.indexOf("="); if (i < 1) continue; let value = line.slice(i+1).trim(); if ((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))) value=value.slice(1,-1); out[line.slice(0,i).trim()]=value; } return out; }
const productionEnv = { ...process.env, ...parseEnv(envFile) };
function run(command, args, env = process.env) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  const result = spawnSync(executable, args, { cwd: root, stdio: "inherit", env, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run("node", ["scripts/phase24-preflight.mjs"]);
run("npm", ["run", "db:generate"]);
run("npm", ["run", "prisma:deploy", "--workspace", "server"], productionEnv);
run("npm", ["run", "typecheck"]);
run("npm", ["run", "build"], productionEnv);
console.log("\nPhase 24 production deployment build PASS.");
