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
