# Phase 97 — Read this first for deployment

Use `docs/PHASE97_RELEASE_RUNBOOK.md` and `docs/PHASE97_ENV_AND_PINNING.md` before running the Phase 96/97 guarded release. The production cutover now requires an **operator-reviewed `PHASE97_TARGET_FINGERPRINT`** before any DB migration. It executes `verify:phase97` rather than the older last-phase gate. Phase 97 ships **no migration**. The initial hosting platform remains deliberately unselected; see `docs/PHASE97_DEPLOYMENT_CHOICES.md`.

Do not expose developer `.env` files in Docker/build contexts. The supplied project `.dockerignore` covers sensitive defaults; verify it before any image build. Full checkout tests, actual staging business flows, restored backup, upload persistence, live payment controls and 32 signed gates remain mandatory before declaring GO.

---

# Production deployment — Phase 96 MEGA release

For full instructions use `docs/PHASE96_CUTOVER_RUNBOOK.md` and `PHASE_96_RELEASE.md`.

**Critical change:** full typecheck/build/security verification must pass **before** production migration; the previous release sequence migrated first. The new command is guarded and non-destructive by default:

```powershell
npm run launch:plan
npm run launch:tests
npm run launch:doctor
npm run verify:phase96
```

An actual production release is a separate conscious action after an isolated restore drill, confirmed production env and signed UAT:

```powershell
npm run release:prepare -- --execute --confirm=RISEORA-LIVE
```

No automatic rollback, payment mutation, stock correction, or automated production restart. Operator must restart and run public smoke/SEO checks.

Phase 96 has **no migration**; if Phase 95 was deployed, the expected migration count remains **48**, head `20261008094000_phase95_maintenance_reliability_spares_v2`.
