# Phase 97 — First 72 hours, incident operations and production alerts

## Mandatory alert owners

Assign an on-call primary and backup before accepting live orders. Alerts must have severity, escalation and acknowledgements; silent dashboards are insufficient.

| Alert | Suggested trigger for initial launch | Response |
|---|---|---|
| Availability | HTTP ready fails twice / 5xx spike | Pause campaigns, inspect release and DB, investigate immediately |
| Payment capture discrepancy | Any paid online order missing provider ID / duplicate capture | Stop affected online path; reconcile external gateway |
| Duplicate payment webhook | Any duplicate side effect (not harmless replay) | P0, inspect idempotency keys and settlement |
| Stock/batch drift | Any blocked QA/recall/expired free stock or negative quantity | Stop affected sale/dispatch; warehouse investigation |
| Refund mismatch | Any refunded > paid or duplicate provider refund | Suspend refund automation and account review |
| Backups | Missed daily validated backup or failed offsite retention | P0 recovery-risk, re-establish backups |
| Storage | Disk/uploads >80%, DB storage >75% | Add capacity; confirm backup viability |
| Delivery | Dispatch SLA breaches or tracking exception growth | Assign operations owner |
| Auth/security | Unexpected admin 200 without session, elevated 401/429/5xx | Restrict exposure and investigate immediately |
| Database | Connection saturation, migration failure, long locks | Freeze migration, inspect connections and DB health |

## Control cadence

- First hour: check health every few minutes, reconcile every test and first real order, verify gateway settlement and stored order money.
- First day: review checkout conversion failures, webhook retries, active recalls/QA holds, courier SLA, provider refunds, notification failures, and verified backup creation.
- First 72 hours: monitor trends, sample first 10–20 real orders with payment/stock lineage, escalate any P0 immediately; no large speculative feature deployments.

## Incident record

Capture timestamp UTC, affected release hash, operator, service/DB identity fingerprint (never secret), impact, evidence link, containment decision, external payments created after last backup, recovery choice and owner approval. A restore must not silently discard live orders/payments captured since backup.
