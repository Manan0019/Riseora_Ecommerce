import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "client/src/components/AdminLayout.jsx",
  "client/src/pages/admin/AdminDashboard.jsx",
  "client/src/pages/admin/AdminReports.jsx",
  "server/src/routes/admin.routes.ts",
  "server/src/services/checkout.service.ts",
  "server/prisma/schema.prisma",
  "server/prisma/migrations/20261002190000_phase34_admin_bi_cost_snapshot/migration.sql",
];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) throw new Error(`Phase 34 missing ${rel}`);
const css = fs.readFileSync(path.join(root,"client/src/styles.css"),"utf8");
if (!css.includes("position: fixed; inset: 0 auto 0 0") || !css.includes("--phase34-admin-rail")) throw new Error("Phase 34 fixed desktop Admin rail is missing");
const schema = fs.readFileSync(path.join(root,"server/prisma/schema.prisma"),"utf8");
if (!schema.includes("unitCost  Decimal?")) throw new Error("OrderItem cost snapshot missing");
const checkout = fs.readFileSync(path.join(root,"server/src/services/checkout.service.ts"),"utf8");
if (!checkout.includes("unitCost: variant.costPrice") || !checkout.includes("unitCost: item.unitCost")) throw new Error("Checkout cost snapshot wiring missing");
const reports = fs.readFileSync(path.join(root,"client/src/pages/admin/AdminReports.jsx"),"utf8");
for (const marker of ["Estimated gross profit","Repeat customer rate","Slow stock","Export full CSV"]) if (!reports.includes(marker)) throw new Error(`Reports V2 marker missing: ${marker}`);
console.log("Phase 34 admin/BI audit PASS");
console.log("- fixed full-height desktop admin rail present");
console.log("- checkout-time cost snapshots present");
console.log("- BI comparison, margin, repeat-customer and inventory analytics present");
