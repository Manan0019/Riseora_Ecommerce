import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const serverEnvPath = path.join(root, "server", ".env.production");
const clientEnvPath = path.join(root, "client", ".env.production");

function parseEnv(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

const errors = [];
const warnings = [];
const ok = (label) => console.log(`PASS  ${label}`);
const warn = (label) => { warnings.push(label); console.log(`WARN  ${label}`); };
const fail = (label) => { errors.push(label); console.log(`FAIL  ${label}`); };

console.log("Riseora Phase 24 production preflight\n");
const [major, minor] = process.versions.node.split(".").map(Number);
const nodeSupported = (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22;
if (nodeSupported) ok(`Node ${process.version}`); else fail(`Node ${process.version}; Vite 7 requires Node 20.19+ or 22.12+ (Node 24 recommended)`);

if (!fs.existsSync(serverEnvPath)) fail("server/.env.production is missing (copy server/.env.production.example and fill real values)");
if (!fs.existsSync(clientEnvPath)) fail("client/.env.production is missing (copy client/.env.production.example and fill real values)");

if (errors.length === 0) {
  const server = parseEnv(serverEnvPath);
  const client = parseEnv(clientEnvPath);
  const required = ["DATABASE_URL", "JWT_SECRET", "CLIENT_URL", "PUBLIC_SITE_URL"];
  for (const key of required) server[key] ? ok(`${key} configured`) : fail(`${key} is required in server/.env.production`);
  if (server.NODE_ENV === "production") ok("NODE_ENV=production"); else fail("NODE_ENV must be production");
  if (["true", "1", "yes", "on"].includes(String(server.SERVE_CLIENT || "").toLowerCase())) ok("SERVE_CLIENT enabled"); else fail("SERVE_CLIENT must be true for the single-origin production build");
  if ((server.JWT_SECRET || "").length >= 48 && !/replace|example|change/i.test(server.JWT_SECRET || "")) ok("JWT_SECRET strength check"); else fail("JWT_SECRET must be a real unique secret of at least 48 characters");
  if ((server.DATABASE_URL || "").startsWith("postgresql://") || (server.DATABASE_URL || "").startsWith("postgres://")) ok("PostgreSQL DATABASE_URL format"); else fail("DATABASE_URL must be PostgreSQL");
  for (const key of ["CLIENT_URL", "PUBLIC_SITE_URL"]) {
    const value = server[key] || "";
    if (/^https:\/\//i.test(value) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value)) ok(`${key} uses HTTPS/localhost`); else fail(`${key} must use HTTPS in production`);
  }
  if ((client.VITE_API_URL || "") === "/api") ok("VITE_API_URL uses same-origin /api"); else warn("VITE_API_URL is not /api; verify CORS and canonical-domain configuration");
  if (client.VITE_PUBLIC_SITE_URL) ok("VITE_PUBLIC_SITE_URL configured"); else warn("VITE_PUBLIC_SITE_URL is blank");

  const paymentReady = server.RAZORPAY_KEY_ID && server.RAZORPAY_KEY_SECRET && server.RAZORPAY_WEBHOOK_SECRET;
  paymentReady ? ok("Razorpay production variables present") : warn("Razorpay is not fully configured; online payment launch is not ready");
  const cloudReady = server.CLOUDINARY_CLOUD_NAME && server.CLOUDINARY_API_KEY && server.CLOUDINARY_API_SECRET;
  cloudReady ? ok("Cloudinary variables present") : warn("Cloudinary is not fully configured; production image uploads may remain local");
  const emailReady = server.RESEND_API_KEY && server.EMAIL_FROM;
  emailReady ? ok("Transactional email variables present") : warn("Transactional email is not fully configured");
}

for (const relative of ["package-lock.json", "Dockerfile", "server/prisma/schema.prisma", "server/backups/.gitkeep"]) {
  fs.existsSync(path.join(root, relative)) ? ok(`${relative} present`) : fail(`${relative} missing`);
}

console.log(`\nResult: ${errors.length ? "FAIL" : "PASS"} · ${errors.length} error(s) · ${warnings.length} warning(s)`);
if (warnings.length) console.log("Warnings do not block the build, but review them before accepting real customer orders.");
process.exitCode = errors.length ? 1 : 0;
