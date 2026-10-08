# Finishing Riseora: release focus and definition of DONE

## Freeze feature scope
Further admin ERP modules are **not** part of the launch critical path unless a real dependency blocks paid orders. Work only on P0/P1 issues:
- P0: data corruption, security bypass, payment amount/status mismatch, sell recalled stock, repeated inventory deduction, destructive migration, missing legal blockers.
- P1: checkout fails on common mobile devices, invoice errors, unusable shipping/return, unhandled outage, severe production performance.
- P2: minor UI defects, low-frequency admin inconveniences, noncritical analytics; record for post-launch.
- P3: future features and optimizations; do not delay launch.

## Definition of DONE
A reliable production release has: real TLS and domain; verified production environment; no critical security findings; verified backup **and** isolated restore; successful schema validation, typecheck, build, bundle budget; real payment + order + stock + invoice UAT; operational email/OTP; shipping & refund trials; policies/legal approvals; monitoring and named escalation owners; observed post-restart health; manual sign-off.

## Explicit exclusions
- Phase 96 does not create new PostgreSQL migrations.
- No hosted service is automatically provisioned or purchased.
- No real Razorpay, carrier, OTP, social provider, or email account is connected by this ZIP.
- No external payment, warehouse stock or customer order is written by the launch dashboard.
- The release automation does not automatically roll back a migrated production database.

## Five workstreams to finish (in parallel)
1. **Technical:** eliminate build/schema defects and validate infrastructure, CSP/CORS, assets and API.
2. **Commerce:** run UAT-01 through UAT-24 and reconcile first real transactions.
3. **Operations:** finish shipping, returns, QA and production/SKU opening stock.
4. **Compliance:** shipping/refund/terms/privacy policy, GST details, safe product claims and invoices approved by the owner.
5. **Cutover:** backups/restore, DNS/TLS, alerts, smoke, runbook and go/no-go decision.

After completion, new work should be production bugfixes or measured post-launch enhancements, not numbered feature phases for their own sake.
