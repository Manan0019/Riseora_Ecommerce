import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
let failed = false;
const pass = (m) => console.log(`PASS  ${m}`);
const fail = (m) => { failed = true; console.log(`FAIL  ${m}`); };
const read = (p) => fs.readFileSync(path.join(root,p),"utf8");

const schema = read("server/prisma/schema.prisma");
schema.includes('inventoryMovements InventoryMovement[] @relation("InventoryMovementActor")') ? pass("User ↔ InventoryMovement actor relation repaired") : fail("User inventory movement actor relation missing");
schema.includes("inventoryMovements InventoryMovement[]") && schema.includes("variant ProductVariant @relation") ? pass("ProductVariant ↔ InventoryMovement relation repaired") : fail("ProductVariant inventory relation missing");
schema.includes('actorUser User? @relation("InventoryMovementActor"') ? pass("InventoryMovement actorUser reverse relation present") : fail("InventoryMovement actorUser relation missing");

for (const file of ["scripts/postgres-tools.mjs","scripts/db-doctor.mjs","server/src/utils/postgres-tools.ts","server/prisma/migrations/20261003153000_phase40_inventory_relation_integrity/migration.sql"]) {
  fs.existsSync(path.join(root,file)) ? pass(`${file} present`) : fail(`${file} missing`);
}
const backup = read("scripts/db-backup.mjs");
backup.includes('resolvePostgresTool("pg_dump"') && backup.includes('resolvePostgresTool("pg_restore"') ? pass("backup auto-discovers PostgreSQL client tools") : fail("backup tool discovery missing");
backup.includes("sha256") && backup.includes('"--list"') ? pass("backup checksum/archive verification present") : fail("backup integrity verification missing");

const pkg = JSON.parse(read("package.json"));
pkg.scripts?.["db:doctor"] ? pass("db:doctor command present") : fail("db:doctor missing");
pkg.scripts?.["security:audit"] ? pass("security audit command present") : fail("security:audit missing");
pkg.scripts?.["verify:phase40"] ? pass("verify:phase40 command present") : fail("verify:phase40 missing");

const client = JSON.parse(read("client/package.json"));
String(client.devDependencies?.vite || "").startsWith("8.") ? pass(`Vite ${client.devDependencies.vite} selected`) : fail("Vite 8 upgrade missing");
const viteConfig = read("client/vite.config.js");
!viteConfig.includes("manualChunks") && !viteConfig.includes("rollupOptions") ? pass("Vite 8 config avoids removed Rollup manualChunks object form") : fail("Vite config still contains legacy rollupOptions/manualChunks");

console.log(`\nPhase 40 operations audit: ${failed ? "FAIL" : "PASS"}`);
process.exitCode = failed ? 1 : 0;
