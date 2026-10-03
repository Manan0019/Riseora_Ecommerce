import { prisma } from "../config/prisma";

export const EXPECTED_MIGRATION_HEAD = "20261004160000_phase48_schema_integrity_job_orchestration";

type CheckRow = {
  refill_table: boolean;
  replenishment_enabled: boolean;
  replenishment_days: boolean;
  replenishment_label: boolean;
  price_alert_table: boolean;
  auth_session_table: boolean;
  campaign_table: boolean;
  credit_note_table: boolean;
  consent_event_table: boolean;
  system_job_table: boolean;
};

export async function databaseSchemaStatus() {
  try {
    const rows = await prisma.$queryRawUnsafe<CheckRow[]>(`
      SELECT
        to_regclass('public."RefillReminder"') IS NOT NULL AS refill_table,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name='replenishmentEnabled') AS replenishment_enabled,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name='replenishmentDays') AS replenishment_days,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Product' AND column_name='replenishmentLabel') AS replenishment_label,
        to_regclass('public."PriceAlert"') IS NOT NULL AS price_alert_table,
        to_regclass('public."AuthSession"') IS NOT NULL AS auth_session_table,
        to_regclass('public."Campaign"') IS NOT NULL AS campaign_table,
        to_regclass('public."CreditNote"') IS NOT NULL AS credit_note_table,
        to_regclass('public."ConsentEvent"') IS NOT NULL AS consent_event_table,
        to_regclass('public."SystemJobState"') IS NOT NULL AS system_job_table
    `);
    const row = rows[0];
    const requirements = [
      ["RefillReminder table", row?.refill_table],
      ["Product.replenishmentEnabled", row?.replenishment_enabled],
      ["Product.replenishmentDays", row?.replenishment_days],
      ["Product.replenishmentLabel", row?.replenishment_label],
      ["PriceAlert table", row?.price_alert_table],
      ["AuthSession table", row?.auth_session_table],
      ["Campaign table", row?.campaign_table],
      ["CreditNote table", row?.credit_note_table],
      ["ConsentEvent table", row?.consent_event_table],
      ["SystemJobState table", row?.system_job_table],
    ] as const;

    const migrationRows = await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>(`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      ORDER BY started_at ASC
    `);
    const applied = migrationRows.filter((item) => item.finished_at && !item.rolled_back_at).map((item) => item.migration_name);
    const missing = requirements.filter(([, ok]) => !ok).map(([label]) => label);
    const headApplied = applied.includes(EXPECTED_MIGRATION_HEAD);
    if (!headApplied) missing.push(`Migration ${EXPECTED_MIGRATION_HEAD}`);

    return {
      ok: missing.length === 0,
      expectedMigrationHead: EXPECTED_MIGRATION_HEAD,
      appliedMigrationCount: applied.length,
      latestAppliedMigration: applied.at(-1) || null,
      missing,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      expectedMigrationHead: EXPECTED_MIGRATION_HEAD,
      appliedMigrationCount: 0,
      latestAppliedMigration: null,
      missing: [error instanceof Error ? error.message : String(error)],
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function assertDatabaseSchemaReady() {
  const status = await databaseSchemaStatus();
  if (!status.ok) {
    const error = new Error(`DATABASE_SCHEMA_NOT_READY: ${status.missing.join("; ")}`);
    (error as Error & { code?: string; schemaStatus?: unknown }).code = "DATABASE_SCHEMA_NOT_READY";
    (error as Error & { code?: string; schemaStatus?: unknown }).schemaStatus = status;
    throw error;
  }
  return status;
}
