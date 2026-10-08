# Phase 97 — Launch candidate, staging and cutover runbook

## Rule 0

This phase is a candidate build, **not certification that Riseora is live**. There is no Phase 97 database migration; if Phase 95 was the last applied migration, head is `20261008094000_phase95_maintenance_reliability_spares_v2` (48 total). Do not reset the database, modify production tables directly, or assume a source-level audit proves a payment path.

## Step 1: full checkout and developer verification

Overlay this ZIP's inner folder over your complete Windows project. In PowerShell:

```powershell
cd "D:\Manan\Website\Riseora Herbals\riseora_ecommerce"
npm install
npm run deps:repair
npm run candidate:doctor
npm run candidate:tests
npm run candidate:layout
npm run launch:tests
npm run db:generate
npm run db:status
npm run db:doctor
npm run verify:phase97
npm run security:audit
```

`candidate:layout` intentionally rejects a ZIP-only extraction because historic full project files are required to typecheck, build and run.

## Step 2: isolated staging

Create staging application + PostgreSQL DB + secrets + persistent uploads. Keep staging identity, data, sandbox payment provider and communication provider credentials isolated from both personal development and live production. Run the 60-scenario UAT matrix and record real evidence.

```powershell
npm run candidate:rehearse -- --full
npm run candidate:public -- --url=https://your-staging-domain.example
npm run candidate:latency -- --url=https://your-staging-domain.example --requests=12 --interval-ms=1000
```

The public probes never place orders; use dedicated staging accounts and sandbox gateway for transaction tests. Unauthenticated admin check expects 401/403 and fails for SPA fallback, public 200 or ambiguous 404.

## Step 3: prepare production environment only AFTER hosting selected

Do not copy local `.env` verbatim to production. Configure protected `server/.env.production` on trusted operator host. `PHASE97_TARGET_FINGERPRINT` must match the expected target reported by `candidate:target` after a human reviews hostname, database name, schema and backup. Do not publish connection URLs or passwords. Run:

```powershell
npm run launch:env
npm run candidate:target
npm run launch:plan
```

If production DB is intentionally local, target review requires an explicit `--allow-local`. If using a pooled `DATABASE_URL` and direct host `DIRECT_URL`, verify they target the same physical DB with the owner before modifying target-policy rules; the default guard blocks mismatched host identities.

## Step 4: cutover

1. Freeze new code changes, tag immutable source release and collect source SHA-256 evidence.
2. Verify the full test/build gate, signed staging payment captures, webhook retry behavior, refund reconciliation, 32 acceptance gates, and rollback owner.
3. Confirm verified production backup AND isolated restore evidence; include uploaded-assets backup separately.
4. Acquire a maintenance/traffic freeze if required and log incident/rollback contacts.
5. Only now, from a trusted operator machine, execute `npm run release:prepare -- --execute --confirm=RISEORA-LIVE`.
6. Restart/repoint production process with the chosen host supervisor, confirm process env and DB identity.
7. Run `launch:smoke`, `candidate:public`, `candidate:latency` against the final domain; review Admin → Fulfilment Phase 96 and Phase 97 (aggregate commerce) panels.
8. Record post-deploy smoke evidence, actual owner acceptance and declare GO only if all required gates are true.

## Failure and rollback

- Prior to migration: halt immediately; no database write should have occurred from Phase 97 tests or plan steps.
- Schema migration begun: do not blindly restore or redeploy an older app that may be incompatible. Freeze writes, take forensic snapshot, compare migration head and decide forward fix versus controlled restore with authorized owner.
- Payment mismatch: suspend affected provider/checkout path, cross-check gateway ledger and signed webhook events; don't manually mark paid.
- SKU, batch, QA, expiry or recall failure: prevent affected sales and investigate exact warehouse batch movements before changes.
- Broken public admin isolation/HTTPS: do not launch regardless of customer UI appearance.

## Monitoring and next action

Track checkout failure rates, paid-but-not-confirmed orders, webhook retries, duplicate provider ids, stock-batch drift, negative/refunded money, return and dispatch SLAs, uptime, disk space, database connections and backups for the first 72 hours. During rollout do not simultaneously activate new large marketing campaigns.
