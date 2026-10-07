import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const lockPath = path.join(root, "package-lock.json");
const secure = (value) => {
  const m = String(value || "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return false;
  const actual = m.slice(1).map(Number); const min = [1,2,2];
  for (let i=0;i<3;i+=1) { if (actual[i] > min[i]) return true; if (actual[i] < min[i]) return false; }
  return true;
};
function lockVersions() {
  if (!fs.existsSync(lockPath)) return [];
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  return Object.entries(lock.packages || {}).filter(([name]) => name === "node_modules/source-map-js" || name.endsWith("/node_modules/source-map-js")).map(([,meta]) => meta?.version).filter(Boolean);
}
const before = lockVersions();
if (before.length && before.every(secure)) {
  console.log(`PASS  source-map-js lock already secure · ${[...new Set(before)].join(", ")}`);
  process.exit(0);
}
console.log(`REPAIR source-map-js lock · ${before.length ? before.join(", ") : "lock entry missing"} → 1.2.2`);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
execFileSync(npm, ["install", "source-map-js@1.2.2", "--save-dev", "--save-exact", "--no-audit"], { cwd: root, stdio: "inherit" });
const after = lockVersions();
if (!after.length || !after.every(secure)) {
  console.error(`FAIL  source-map-js lock repair · ${after.join(", ") || "missing"}`);
  process.exit(1);
}
console.log(`PASS  source-map-js lock repaired · ${[...new Set(after)].join(", ")}`);
