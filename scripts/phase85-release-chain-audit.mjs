import fs from "node:fs";
import path from "node:path";

const root = process.cwd(); let failed = 0;
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const ok = (label, condition) => condition ? console.log(`PASS  ${label}`) : (failed += 1, console.error(`FAIL  ${label}`));
const pkg = JSON.parse(read("package.json"));
const prelaunch = String(pkg.scripts?.["prelaunch:check"] || "");
const prepare = read("scripts/phase49-release-prepare.mjs");
const prodAudit = read("scripts/phase49-production-release-audit.mjs");
const compat = Array.from({ length: 35 }, (_, index) => `verify:phase${index + 51}`);

ok("verify:phase85 exists", Boolean(pkg.scripts?.["verify:phase85"]));
ok("prelaunch executes latest verify", prelaunch.includes("npm run verify:phase86"));
ok("production release executes latest verify", prepare.includes('run("npm", ["run", "verify:phase86"])'));
ok("production audit recognizes latest verify", prodAudit.includes('"verify:phase86"'));
ok("prelaunch carries legacy forward-compat tokens", compat.every((token) => prelaunch.includes(token)));
ok("production release carries legacy forward-compat tokens", compat.filter((token) => Number(token.split("phase")[1]) >= 69).every((token) => prepare.includes(token)));
ok("verify:phase85 runs release-chain doctor", String(pkg.scripts?.["verify:phase85"] || "").includes("release-chain:doctor"));
ok("verify:phase85 runs dependency security doctor", String(pkg.scripts?.["verify:phase85"] || "").includes("dependency-security:doctor"));
ok("verify:phase85 runs service recovery doctor", String(pkg.scripts?.["verify:phase85"] || "").includes("service-recovery:doctor"));
ok("verify:phase85 still executes build", String(pkg.scripts?.["verify:phase85"] || "").includes("npm run build"));
ok("verify:phase85 still executes performance budget", String(pkg.scripts?.["verify:phase85"] || "").includes("performance:budget"));

if (failed) { console.error(`\nPhase 85 release chain audit: FAIL (${failed})`); process.exit(1); }
console.log("\nPhase 85 release chain audit: PASS");
