import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const lockPath = path.join(root, "package-lock.json");
if (!fs.existsSync(lockPath)) throw new Error("package-lock.json missing. Run npm install before security:tree.");
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const packages = lock.packages || {};
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const clientPkg = JSON.parse(fs.readFileSync(path.join(root, "client/package.json"), "utf8"));
const serverPkg = JSON.parse(fs.readFileSync(path.join(root, "server/package.json"), "utf8"));

const matches = (name) => Object.entries(packages)
  .filter(([key]) => key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`))
  .map(([key, value]) => ({ key, version: value.version || "0.0.0", dev: Boolean(value.dev) }));
const tuple = (v) => String(v).replace(/^[^0-9]*/, "").split(/[.-]/).slice(0, 3).map((x) => Number(x) || 0);
const cmp = (a, b) => { const A = tuple(a), B = tuple(b); for (let i = 0; i < 3; i += 1) { if (A[i] !== B[i]) return A[i] - B[i]; } return 0; };
let failed = false;
const pass = (m) => console.log(`PASS  ${m}`);
const fail = (m) => { failed = true; console.log(`FAIL  ${m}`); };

const routerDom = matches("react-router-dom");
routerDom.length && routerDom.every((x) => cmp(x.version, "6.30.6") >= 0)
  ? pass(`React Router patched ${routerDom.map((x) => x.version).join(", ")}`)
  : fail(`react-router-dom must resolve to 6.30.6+; found ${routerDom.map((x) => x.version).join(", ") || "none"}`);

const vite = matches("vite");
vite.length && vite.every((x) => cmp(x.version, "8.3.2") >= 0)
  ? pass(`Vite baseline ${vite.map((x) => x.version).join(", ")}`)
  : fail(`Vite must resolve to 8.3.2+; found ${vite.map((x) => x.version).join(", ") || "none"}`);

const esbuild = matches("esbuild");
const badEsbuild = esbuild.filter((x) => cmp(x.version, "0.28.1") < 0);
!badEsbuild.length
  ? pass(`esbuild patched ${esbuild.map((x) => x.version).join(", ") || "not installed"}`)
  : fail(`esbuild <0.28.1 remains: ${badEsbuild.map((x) => `${x.version} (${x.key})`).join(", ")}`);

const tsup = matches("tsup");
!tsup.length ? pass("tsup removed; server build uses pinned esbuild directly") : fail(`tsup must be removed; found ${tsup.map((x) => x.version).join(", ")}`);

const deepmerge = matches("deepmerge-ts");
deepmerge.length && deepmerge.every((x) => cmp(x.version, "8.0.0") >= 0)
  ? pass(`deepmerge-ts patched ${deepmerge.map((x) => x.version).join(", ")}`)
  : fail(`deepmerge-ts <8 remains: ${deepmerge.map((x) => `${x.version} (${x.key})`).join(", ") || "none"}`);

const mysql = matches("mysql2");
!mysql.length || mysql.every((x) => cmp(x.version, "3.23.1") >= 0)
  ? pass(`mysql2 patched ${mysql.map((x) => x.version).join(", ") || "not installed"}`)
  : fail(`mysql2 <=3.23.0 remains: ${mysql.map((x) => `${x.version} (${x.key})`).join(", ")}`);

const prisma = matches("prisma");
prisma.length && prisma.every((x) => x.dev)
  ? pass("Prisma CLI is development-only in the resolved lockfile")
  : fail(`Prisma CLI must be dev-only; found ${prisma.map((x) => `${x.key} dev=${x.dev}`).join(", ") || "none"}`);

clientPkg.dependencies?.["react-router-dom"] === "6.30.6" ? pass("client manifest pins react-router-dom 6.30.6") : fail("client manifest must pin react-router-dom 6.30.6");
serverPkg.devDependencies?.tsup === undefined ? pass("server manifest no longer depends on tsup") : fail("server manifest still depends on tsup");
serverPkg.devDependencies?.esbuild === "0.28.2" ? pass("server build pins esbuild 0.28.2") : fail("server build must pin esbuild 0.28.2");
serverPkg.devDependencies?.prisma === undefined && pkg.devDependencies?.prisma === "7.10.0" ? pass("Prisma CLI isolated at workspace root as dev-only tooling") : fail("Prisma CLI must be root devDependency only");

for (const name of ["esbuild", "@prisma/engines", "prisma"]) {
  pkg.allowScripts?.[name] === true ? pass(`install script reviewed: ${name}`) : fail(`allowScripts missing reviewed package ${name}`);
}

console.log(`\nPhase 41 dependency tree: ${failed ? "FAIL" : "PASS"}`);
if (failed) console.log("Run npm install after applying Phase 41. If stale versions remain, remove root/client/server node_modules plus package-lock.json, then run npm install again. Do not use npm audit fix --force.");
process.exitCode = failed ? 1 : 0;
