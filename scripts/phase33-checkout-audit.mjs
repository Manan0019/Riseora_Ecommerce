import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "client/src/analytics.js",
  "client/src/pages/Checkout.jsx",
  "client/src/pages/admin/AdminPayments.jsx",
  "server/src/routes/payment.routes.ts",
  "server/src/routes/admin-payment.routes.ts",
  "server/prisma/migrations/20261002165000_phase33_checkout_payment_reliability/migration.sql",
];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) throw new Error(`Phase 33 missing required file: ${rel}`);
const schema = fs.readFileSync(path.join(root, "server/prisma/schema.prisma"), "utf8");
for (const needle of ["checkoutRequestKey String? @unique", "paymentAttemptCount Int @default(0)", "lastPaymentStatus String?"]) if (!schema.includes(needle)) throw new Error(`Phase 33 Prisma requirement missing: ${needle}`);
const checkout = fs.readFileSync(path.join(root, "client/src/pages/Checkout.jsx"), "utf8");
if (checkout.includes("../lib/analytics")) throw new Error("Checkout still imports legacy lib/analytics path");
for (const needle of ["Duplicate-order protected", "Retry payment", "addresses/from-checkout", "checkoutRequestKey"]) if (!checkout.includes(needle)) throw new Error(`Checkout reliability marker missing: ${needle}`);
const payment = fs.readFileSync(path.join(root, "server/src/routes/payment.routes.ts"), "utf8");
if (!payment.includes('router.get("/razorpay/session/:sessionId/status"')) throw new Error("Payment status recovery endpoint missing");
if (/ondismiss[\s\S]{0,300}razorpay\/cancel/.test(checkout)) throw new Error("Razorpay modal dismiss must not release the checkout reservation");
console.log("Phase 33 checkout/payment audit PASS");
console.log("- idempotent checkout request keys present");
console.log("- recoverable online payment status endpoint present");
console.log("- modal dismiss no longer cancels reserved checkout");
console.log("- checkout address persistence and Admin Payments present");
