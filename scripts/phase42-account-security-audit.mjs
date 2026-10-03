import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failed = false;
const pass = (m) => console.log(`PASS  ${m}`);
const fail = (m) => { failed = true; console.log(`FAIL  ${m}`); };
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));
const requireText = (rel, needles, label) => {
  if (!exists(rel)) return fail(`${label} missing: ${rel}`);
  const text = read(rel);
  const missing = needles.filter((needle) => !text.includes(needle));
  missing.length ? fail(`${label} missing markers: ${missing.join(", ")}`) : pass(label);
};

requireText("server/prisma/schema.prisma", ["model AuthSession", "model AuthSecurityEvent", "failedLoginCount", "lastPasswordChangedAt"], "account security Prisma models");
requireText("server/src/services/auth-security.service.ts", ["createAuthSession", "revokeAllAuthSessions", "privacyHash", "cleanupExpiredAuthSessions"], "session/security service");
requireText("server/src/middleware/auth.ts", ["payload.sid", "authSession", "req.authSessionId"], "managed-session authentication");
requireText("server/src/routes/account-security.routes.ts", ["/overview", "/revoke-others", "/export", "/sessions/:id"], "customer security APIs");
requireText("client/src/pages/SecurityCenter.jsx", ["Active sessions", "Download your data", "Security history"], "customer Security Center");
requireText("scripts/db-doctor.mjs", ["createRequire", "process.execPath", "prisma/package.json"], "Windows-safe database doctor");
requireText("scripts/phase42-security-tree.mjs", ["7.18.4", "Prisma CLI is isolated to the root devDependencies"], "Phase 42 dependency verifier");
requireText("server/prisma/migrations/20261003174500_phase42_account_security_sessions/migration.sql", ["AuthSession", "AuthSecurityEvent", "failedLoginCount"], "Phase 42 migration");

const clientPkg = JSON.parse(read("client/package.json"));
clientPkg.dependencies?.["react-router-dom"] === "7.18.4" ? pass("React Router 7.18.4 pinned") : fail("React Router 7.18.4 not pinned");

// Resolve all relative JS/JSX imports without requiring node_modules.
const sourceRoot = path.join(root, "client/src");
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(js|jsx)$/.test(entry.name)) files.push(full); } }
walk(sourceRoot);
const missingImports = [];
const importRx = /(?:from\s+|import\s*\()?["'](\.{1,2}\/[^"']+)["']/g;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(importRx)) {
    const base = path.resolve(path.dirname(file), match[1]);
    const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js"), path.join(base, "index.jsx")];
    if (!candidates.some((candidate) => fs.existsSync(candidate))) missingImports.push(`${path.relative(root, file)} -> ${match[1]}`);
  }
}
missingImports.length ? fail(`unresolved relative imports: ${missingImports.slice(0, 8).join("; ")}`) : pass(`${files.length} frontend JS/JSX files with 0 unresolved relative imports`);

console.log(`\nPhase 42 account security audit: ${failed ? "FAIL" : "PASS"}`);
process.exitCode = failed ? 1 : 0;
