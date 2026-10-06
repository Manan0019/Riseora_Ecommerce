import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const serverRoot = path.join(root, "server");
const envFile = fs.existsSync(path.join(serverRoot, ".env.production")) && process.argv.includes("--production")
  ? path.join(serverRoot, ".env.production")
  : path.join(serverRoot, ".env");

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[line.slice(0, index).trim()] = value;
  }
  return out;
}

export async function inspectSchemaContract() {
  const values = { ...parseEnv(envFile), ...process.env };
  if (!values.DATABASE_URL) return { ok: false, errors: ["DATABASE_URL is missing"], migrations: [] };
  const serverRequire = createRequire(path.join(serverRoot, "package.json"));
  const { Client } = serverRequire("pg");
  const client = new Client({ connectionString: values.DATABASE_URL });
  await client.connect();
  try {
    const checks = await client.query(`
      SELECT
        to_regclass('public."RefillReminder"') IS NOT NULL AS "refillReminder",
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name='replenishmentEnabled') AS "replenishmentEnabled",
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name='replenishmentDays') AS "replenishmentDays",
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name='replenishmentLabel') AS "replenishmentLabel",
        to_regclass('public."PriceAlert"') IS NOT NULL AS "priceAlert",
        to_regclass('public."AuthSession"') IS NOT NULL AS "authSession",
        to_regclass('public."Campaign"') IS NOT NULL AS "campaign",
        to_regclass('public."CreditNote"') IS NOT NULL AS "creditNote",
        to_regclass('public."ConsentEvent"') IS NOT NULL AS "consentEvent",
        to_regclass('public."SystemJobState"') IS NOT NULL AS "systemJobState",
        to_regclass('public."AccountCart"') IS NOT NULL AS "accountCart"
    `);
    const row = checks.rows[0] || {};
    const requirements = [
      ["RefillReminder table", row.refillReminder],
      ["Product.replenishmentEnabled", row.replenishmentEnabled],
      ["Product.replenishmentDays", row.replenishmentDays],
      ["Product.replenishmentLabel", row.replenishmentLabel],
      ["PriceAlert table", row.priceAlert],
      ["AuthSession table", row.authSession],
      ["Campaign table", row.campaign],
      ["CreditNote table", row.creditNote],
      ["ConsentEvent table", row.consentEvent],
      ["SystemJobState table", row.systemJobState],
      ["AccountCart table", row.accountCart],
    ];

    const migrationResult = await client.query(`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      ORDER BY started_at ASC
    `);
    const applied = migrationResult.rows.filter((item) => item.finished_at && !item.rolled_back_at).map((item) => item.migration_name);
    const requiredMigrations = [
      "20261003024500_phase38_refill_replenishment_v2",
      "20261004160000_phase48_schema_integrity_job_orchestration",
      "20261006121500_phase69_account_saved_bag_v2",
    ];
    const errors = requirements.filter(([, ok]) => !ok).map(([label]) => `${label} missing`);
    for (const migration of requiredMigrations) if (!applied.includes(migration)) errors.push(`Migration ${migration} not applied`);
    return { ok: errors.length === 0, errors, migrations: applied, latest: applied.at(-1) || null };
  } finally {
    await client.end();
  }
}

if (import.meta.url === new URL(`file:///${process.argv[1]?.replace(/\\/g, "/")}`).href || process.argv[1]?.endsWith("db-schema-status.mjs")) {
  try {
    const status = await inspectSchemaContract();
    if (status.ok) {
      console.log(`PASS  Database schema contract · ${status.migrations.length} applied migrations · latest ${status.latest}`);
    } else {
      console.log("FAIL  Database schema contract");
      for (const error of status.errors) console.log(`      ${error}`);
      console.log("      Run: npm run db:backup && npm run db:deploy && npm run db:generate");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`FAIL  Database schema contract · ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
