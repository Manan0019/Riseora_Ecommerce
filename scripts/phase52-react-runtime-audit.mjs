import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;
function pass(message) { console.log(`PASS  ${message}`); }
function fail(message) { failed = true; console.error(`FAIL  ${message}`); }
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function requireText(relative, needles) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return fail(`${relative} exists`);
  const text = read(relative);
  pass(relative);
  for (const needle of needles) text.includes(needle) ? pass(`${relative} · ${needle}`) : fail(`${relative} missing ${needle}`);
}

const pkg = JSON.parse(read("package.json"));
const client = JSON.parse(read("client/package.json"));
const expected = "19.1.1";

pkg.dependencies?.react === expected ? pass(`root React singleton anchor · ${expected}`) : fail("root React singleton anchor");
pkg.dependencies?.["react-dom"] === expected ? pass(`root ReactDOM singleton anchor · ${expected}`) : fail("root ReactDOM singleton anchor");
client.dependencies?.react === expected ? pass(`client React pin · ${expected}`) : fail("client React pin");
client.dependencies?.["react-dom"] === expected ? pass(`client ReactDOM pin · ${expected}`) : fail("client ReactDOM pin");

requireText("client/vite.config.js", ["dedupe", '"react"', '"react-dom"', '"react/jsx-runtime"', '"react/jsx-dev-runtime"']);
requireText("scripts/phase52-react-runtime-doctor.mjs", ["single physical React runtime", "React Router DOM -> React", "npm run deps:repair"]);
requireText("scripts/phase52-clear-vite-cache.mjs", ["client/node_modules/.vite", "stale Vite dependency cache"]);

const scripts = pkg.scripts || {};
String(scripts["react:doctor"] || "").includes("phase52-react-runtime-doctor.mjs") ? pass("react:doctor command") : fail("react:doctor command");
String(scripts["deps:repair"] || "").includes("npm dedupe") && String(scripts["deps:repair"] || "").includes("phase52-clear-vite-cache.mjs") ? pass("deps:repair command") : fail("deps:repair command");
String(scripts["client:doctor"] || "").includes("phase52-react-runtime-doctor.mjs") ? pass("client:doctor includes React runtime doctor") : fail("client:doctor React runtime gate");
String(scripts.predev || "").includes("client:doctor") ? pass("npm run dev blocks on React runtime contract") : fail("predev React runtime gate");
String(scripts["verify:phase52"] || "").includes("phase52-react-runtime-audit.mjs") && String(scripts["verify:phase52"] || "").includes("npm run build") ? pass("verify:phase52 command") : fail("verify:phase52 command");
(["verify:phase52", "verify:phase53", "verify:phase54", "verify:phase55", "verify:phase56", "verify:phase57", "verify:phase58", "verify:phase59", "verify:phase60", "verify:phase61", "verify:phase62", "verify:phase63", "verify:phase64"].some((token) => String(scripts["prelaunch:check"] || "").includes(token))) ? pass("prelaunch uses Phase 52+ verification") : fail("prelaunch uses Phase 52+ verification");

const doctor = spawnSync(process.execPath, [path.join(root, "scripts/phase52-react-runtime-doctor.mjs"), "--source-only"], { cwd: root, encoding: "utf8" });
if (doctor.stdout) process.stdout.write(doctor.stdout);
if (doctor.stderr) process.stderr.write(doctor.stderr);
doctor.status === 0 ? pass("Phase 52 source-only React doctor") : fail("Phase 52 source-only React doctor");

const risky = ["prisma migrate reset", "prisma db push --force-reset"];
const packageText = read("package.json").toLowerCase();
const found = risky.filter((needle) => packageText.includes(needle));
found.length ? fail(`destructive production command detected: ${found.join(", ")}`) : pass("no destructive production database command added");

if (failed) {
  console.error("\nPhase 52 React runtime audit: FAIL");
  process.exit(1);
}
console.log("\nPhase 52 React runtime audit: PASS");
