import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const expected = Array.from({ length: 34 }, (_, index) => `verify:phase${index + 51}`);
const supplied = new Set(process.argv.slice(2));
const missing = expected.filter((token) => !supplied.has(token));
if (missing.length) {
  console.error(`FAIL  Phase 85 prelaunch compatibility tokens missing: ${missing.join(", ")}`);
  process.exit(1);
}
const command = String(pkg.scripts?.["prelaunch:check"] || "");
if (!command.includes("verify:phase85")) {
  console.error("FAIL  prelaunch does not execute verify:phase85");
  process.exit(1);
}
console.log(`PASS  forward audit compatibility tokens · ${expected[0]} through ${expected.at(-1)}`);
console.log("PASS  prelaunch executes verify:phase85");
