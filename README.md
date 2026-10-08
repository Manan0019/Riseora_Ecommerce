# Riseora E-commerce — Phase 96 Production Launch Readiness MEGA V2

This is a **cumulative overlay** on top of your existing Riseora E-commerce checkout. It does not contain all original client/server source files or `node_modules`.

The goal is to **finish and deploy**, not extend feature count: live admin go/no-go checks, production environment guard, build-first migration-safe cutover, read-only public smoke/SEO probes, schema regressions, source provenance, restore drills, legal/security/UAT signoff, process-manager and reverse-proxy examples.

1. Stop development server, extract the **contents** of this folder over your existing project.
2. Read `PHASE_96_RELEASE.md` and `docs/PHASE96_CUTOVER_RUNBOOK.md`.
3. Run `npm run launch:tests`, `npm run launch:doctor`, and then `npm run verify:phase96` in the full Windows checkout.
4. **Do not run a real production migration until the owner has signed off.** `npm run launch:plan` is non-destructive; actual guarded release requires explicit confirmation.
5. Phase 96 adds **no database migration**.

No external hosting, provider connection, paid transaction or database restore was performed in this packaging environment.
