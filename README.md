# Riseora E-commerce — Phase 97 cumulative deployment candidate overlay

**Phase 97 focuses on launch completion**, not new ERP subsystems. This ZIP contains overlay sources to COPY into the original full Windows project; it is **not** a standalone installable repository.

Start: `PHASE_97_RELEASE.md` and `docs/PHASE97_RELEASE_RUNBOOK.md`.

Main changes: read-only Admin Commerce Safety Center, operator-pinned production database target gate, 44 isolated candidate tests, strict public/API/security probes, 32 mandatory owner sign-off gates, backup archive inspection, client-bundle secret scan, migration source integrity and two neutral deployment templates (VPS/container and managed platform guidance). See `docs/PHASE97_STAGING_UAT_MATRIX.md` for 68 staging UAT scenarios.

**No Phase97 migration.** Never reset PostgreSQL to apply this overlay. On Windows the authoritative full app `npm run verify:phase97` includes `candidate:layout`, Prisma generate, typecheck, build and budget. The overlay alone intentionally cannot pass the full-checkout file and migrations checks.

Docker usage: the root `.dockerignore` excludes secrets and backups. Dockerfile/Compose files under `deployment/phase97` are templates, not a live service preconfigured to your infrastructure.

# Riseora E-commerce — Phase 96 Production Launch Readiness MEGA V2

This is a **cumulative overlay** on top of your existing Riseora E-commerce checkout. It does not contain all original client/server source files or `node_modules`.

The goal is to **finish and deploy**, not extend feature count: live admin go/no-go checks, production environment guard, build-first migration-safe cutover, read-only public smoke/SEO probes, schema regressions, source provenance, restore drills, legal/security/UAT signoff, process-manager and reverse-proxy examples.

1. Stop development server, extract the **contents** of this folder over your existing project.
2. Read `PHASE_96_RELEASE.md` and `docs/PHASE96_CUTOVER_RUNBOOK.md`.
3. Run `npm run launch:tests`, `npm run launch:doctor`, and then `npm run verify:phase96` in the full Windows checkout.
4. **Do not run a real production migration until the owner has signed off.** `npm run launch:plan` is non-destructive; actual guarded release requires explicit confirmation.
5. Phase 96 adds **no database migration**.

No external hosting, provider connection, paid transaction or database restore was performed in this packaging environment.
