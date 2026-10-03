import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const lockPath = path.join(root, "package-lock.json");
if (!fs.existsSync(lockPath)) throw new Error("package-lock.json missing. Run npm install before security:tree.");
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const packages = lock.packages || {};
const matches = (name) => Object.entries(packages).filter(([key]) => key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`)).map(([key, value]) => ({ key, version: value.version || "0.0.0" }));
const tuple = (v) => String(v).replace(/^[^0-9]*/, "").split(/[.-]/).slice(0,3).map((x) => Number(x) || 0);
const cmp = (a,b) => { const A=tuple(a),B=tuple(b); for(let i=0;i<3;i++){ if(A[i]!==B[i]) return A[i]-B[i]; } return 0; };
let failed = false;
const pass = (m) => console.log(`PASS  ${m}`);
const fail = (m) => { failed = true; console.log(`FAIL  ${m}`); };

const vite = matches("vite");
if (vite.length && vite.every((x) => cmp(x.version, "8.3.2") >= 0)) pass(`Vite baseline ${vite.map(x=>x.version).join(", ")}`); else fail(`Vite must resolve to 8.3.2+ after npm install; found ${vite.map(x=>x.version).join(", ") || "none"}`);

const deepmerge = matches("deepmerge-ts");
if (deepmerge.length && deepmerge.every((x) => cmp(x.version, "8.0.0") >= 0)) pass(`deepmerge-ts patched ${deepmerge.map(x=>x.version).join(", ")}`); else fail(`deepmerge-ts <8 is blocked; found ${deepmerge.map(x=>x.version).join(", ") || "none"}`);

const mysql = matches("mysql2");
if (!mysql.length || mysql.every((x) => cmp(x.version, "3.23.1") >= 0)) pass(`mysql2 patched ${mysql.map(x=>x.version).join(", ") || "not installed"}`); else fail(`mysql2 must resolve to 3.23.1+; found ${mysql.map(x=>x.version).join(", ")}`);

const esbuild = matches("esbuild");
const vulnerableEsbuild = esbuild.filter((x) => cmp(x.version, "0.25.0") < 0 || (cmp(x.version, "0.27.3") >= 0 && cmp(x.version, "0.28.1") < 0));
if (!vulnerableEsbuild.length) pass(`esbuild advisory ranges absent ${esbuild.map(x=>x.version).join(", ") || "not installed"}`); else fail(`Vulnerable esbuild versions found: ${vulnerableEsbuild.map(x=>x.version).join(", ")}`);

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const name of ["esbuild@0.28.2", "@prisma/engines@7.10.0", "@prisma/client@7.10.0", "prisma@7.10.0"]) {
  pkg.allowScripts?.[name] === true ? pass(`install script reviewed: ${name}`) : fail(`allowScripts missing pinned approval for ${name}`);
}
if (pkg.overrides?.["deepmerge-ts"] && pkg.overrides?.mysql2) pass("targeted Prisma transitive security overrides present"); else fail("Prisma security overrides missing");

console.log(`\nPhase 40 dependency tree: ${failed ? "FAIL" : "PASS"}`);
if (failed) console.log("Run npm install first. If this still fails, run npm audit and share the exact report rather than using --force.");
process.exitCode = failed ? 1 : 0;
