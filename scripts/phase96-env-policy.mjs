import fs from "node:fs";
import path from "node:path";

/** Shared pure rules for production configuration; never return credential values. */
export function parseDotEnv(content) {
  const values = {};
  for (const raw of String(content).replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)$/.exec(raw.trim());
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    else value = value.replace(/\s+#.*$/, "").trim();
    values[match[1]] = value;
  }
  return values;
}
export function readEnvironmentFile(file) { return parseDotEnv(fs.readFileSync(path.resolve(file), "utf8")); }

const placeholder = (s) => /^(?:changeme|replace.?me|example|placeholder|test|secret|password|your[_-]|<|\$\{)/i.test(s||"");
export function evaluateProductionEnvironment(env) {
  const issues = [];
  const mark = (code, level, message) => issues.push({code, level, message});
  if (env.NODE_ENV !== "production") mark("PRODUCTION_MODE", "BLOCK", "NODE_ENV must be production.");
  if (!env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(env.DATABASE_URL)) mark("DATABASE_URL", "BLOCK", "A valid PostgreSQL DATABASE_URL is required.");
  else {
    try {
      const db = new URL(env.DATABASE_URL);
      if (!db.username || !db.password) mark("DATABASE_CREDENTIALS", "BLOCK", "Database URL must contain dedicated credentials.");
      if (/(?:_dev|_test|development|testdb)$/i.test(db.pathname.replace(/^\//,""))) mark("DEVELOPMENT_DATABASE", "BLOCK", "Production must not target a development/test database.");
      if (db.username === "postgres") mark("DB_SUPERUSER", "WARN", "Use an application database role instead of the postgres superuser.");
    } catch { mark("DATABASE_URL_FORMAT", "BLOCK", "DATABASE_URL could not be parsed."); }
  }
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || placeholder(env.JWT_SECRET) || new Set(env.JWT_SECRET).size < 8) mark("JWT_SECRET", "BLOCK", "JWT secret must be strong, unique and at least 32 characters.");
  let siteOrigin = "";
  try { const site = new URL(env.PUBLIC_SITE_URL || ""); if (site.protocol !== "https:" || !site.hostname || /^(localhost|127\.|0\.0\.0\.0)/.test(site.hostname)) throw Error(); siteOrigin=site.origin; }
  catch { mark("PUBLIC_SITE_URL", "BLOCK", "Public site URL must be a real HTTPS domain."); }
  const origins = String(env.ALLOWED_ORIGINS || "").split(",").map(s=>s.trim()).filter(Boolean);
  if (!origins.length || origins.some(s=>s === "*" || s.includes("*"))) mark("CORS_WILDCARD", "BLOCK", "Explicit non-wildcard origins are required.");
  if (siteOrigin && !origins.includes(siteOrigin)) mark("CORS_SITE_ORIGIN", "BLOCK", "ALLOWED_ORIGINS must contain PUBLIC_SITE_URL origin.");
  if (origins.some(s => !s.startsWith("https://") || /localhost|127\.0\.0\.1/.test(s))) mark("CORS_INSECURE", "BLOCK", "Production browser origins must be HTTPS and public.");
  const razor = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"].map(k => String(env[k] || ""));
  if (razor.some(Boolean) && razor.some(s=>!s)) mark("PAYMENT_PAIR", "BLOCK", "Provide both Razorpay credential fields when online payments are enabled.");
  if (razor[0] && (/^rzp_test_/.test(razor[0]) || placeholder(razor[1]))) mark("PAYMENT_TEST_MODE", "BLOCK", "Production payment credentials must not be test/example keys.");
  if (!razor[0]) mark("PAYMENT_NOT_CONFIGURED", "WARN", "Online-payment credentials were not detected; separately confirm whether COD-only launch is intentional.");
  if (!env.RELEASE_VERSION && !env.RELEASE_COMMIT) mark("RELEASE_IDENTITY", "WARN", "Set a release version/commit for auditability.");
  const blocked = issues.filter(i=>i.level === "BLOCK").length;
  return { decision:blocked?"NO_GO":issues.length?"REVIEW":"GO", blocked, warnings:issues.length-blocked, issues };
}
