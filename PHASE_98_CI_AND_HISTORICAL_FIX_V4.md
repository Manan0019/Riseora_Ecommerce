# Phase 98 — CI Database Environment + Historical Test Independence (Hotfix V4)

## Confirmed root causes

1. **Windows**: `npm run historical:tests` and `npm run verify:phase98` failed with `ENOENT` because `scripts/phase98-historical-migration-sweep.test.mjs` read `PHASE_98_HISTORICAL_AUDIT_FIX_MANIFEST.json` from the checkout root, but the local copy did not contain it. The historical source doctors already passed. The test now embeds the audited six source targets and SHA-256 digests directly, removing the fragile file dependency while preserving the full migration-invariant and source-integrity assertions. The human-readable manifest remains in this archive for provenance.
2. **GitHub Actions**: run `37739683897` (`ecb2fe64e7895ee20946b9043c18225c0688a720`) failed in `npm run db:generate` with PrismaConfigEnvError: `DATABASE_URL` missing. Two GitHub workflows now define a build-only, non-secret dummy `DATABASE_URL`, which Prisma requires to load its configuration. **No PostgreSQL connection is made by `prisma generate`; no migrations execute in CI**. The workflows now use `actions/checkout@v5` and `actions/setup-node@v5` (Node 24).

## Changed from V3

- `scripts/phase98-historical-migration-sweep.test.mjs`
- `.github/workflows/phase97-release-candidate.yml`
- `.github/workflows/phase96-release-gate.yml`
- New `scripts/phase98-ci-workflow.test.mjs` (five tests)

No Prisma schema or migration modification; no changes to checkout, payment, storefront, warehouse or admin flows.

## Verify on Windows

```powershell
cd "D:\Manan\Website\Riseora Herbals\riseora_ecommerce"
npm run historical:tests
node --test scripts/phase98-ci-workflow.test.mjs
npm run historical:doctor
npm run client:doctor
npm run verify:phase98
npm run security:audit
```

After local verification, commit/push the changed `.github/workflows/*.yml` files and test scripts to `main` to start a **new** CI run. The old failed run will not retroactively become green. Check that GitHub Actions `db:generate`, `typecheck`, and `build` complete in the new run.

GitHub repository connection available to the assistant is **read-only**; it cannot publish these changes. Do not use production DATABASE_URL or any live payment credentials in CI. Also do not run `db:deploy` or reset the local database—Phase 98's 49 migrations are already applied.
