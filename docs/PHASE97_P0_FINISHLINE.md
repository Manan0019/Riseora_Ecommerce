# Phase 97 — Finish-line work, not unlimited feature expansion

## P0: prevents public release

1. Any Prisma schema/generation/typecheck/build failure on the actual full checkout.
2. Any unverified provider-paid order, duplicate payment capture/refund, negative money, or missing signed webhook evidence.
3. Any stock/warehouse availability inconsistency enabling sale of recalled, expired, QA-held or non-existent goods.
4. Any exposure of private admin endpoints or secrets, missing HTTPS/auth controls, or invalid privacy/terms shipping/refund policies.
5. Production migration pointing at wrong DB, insufficient backup, missing isolated restore drill, or unverified asset persistence.
6. Missing mandatory staging UAT, human sign-off, or post-deploy monitoring/rollback owner.

## P1: can be scheduled after controlled launch only with owner approval

- Non-blocking admin spacing/visual polish, optional merchandising experiment views, extra analytics charts, low-priority automation and reporting requests.
- Performance improvements once measured p95 and customer checkout metrics are stable and meeting requirements.

## Launch cadence

No new major ERP subsystems until P0 closes. Use a staging release candidate, fix real failures with a reproducible test, then rerun full verification. Candidate status remains **REVIEW/NO_GO** until payment sandbox, restore drill, 32 acceptance gates and actual public smoke pass. Hosting provider can be decided after this code phase without changing the application feature scope.
