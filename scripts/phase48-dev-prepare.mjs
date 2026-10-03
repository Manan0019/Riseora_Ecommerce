import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { inspectSchemaContract } from "./db-schema-status.mjs";

const root = process.cwd();
const serverRoot = path.join(root, "server");
const envFile = path.join(serverRoot, ".env");

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("="); if (i < 1) continue;
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[line.slice(0, i).trim()] = value;
  }
  return out;
}

function prismaCliPath() {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve("prisma/package.json", { paths: [root] });
  return path.join(path.dirname(packageJson), "build", "index.js");
}

function runPrisma(args, env) {
  const result = spawnSync(process.execPath, [prismaCliPath(), ...args], { cwd: serverRoot, stdio: "inherit", windowsHide: true, env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`prisma ${args.join(" ")} failed with exit ${result.status ?? "unknown"}`);
}

console.log("Phase 48 development database gate");
console.log("Applying committed pending migrations before API/Web startup…");
const env = { ...process.env, ...parseEnv(envFile) };
try {
  runPrisma(["validate"], env);
  runPrisma(["migrate", "deploy"], env);
  const status = await inspectSchemaContract();
  if (!status.ok) throw new Error(status.errors.join("; "));
  console.log(`PASS  Development database ready · ${status.migrations.length} migrations · ${status.latest}`);
} catch (error) {
  console.error(`FAIL  Development database is not ready · ${error instanceof Error ? error.message : String(error)}`);
  console.error("Create a backup if needed, then run npm run db:deploy and npm run db:generate.");
  process.exitCode = 1;
}
