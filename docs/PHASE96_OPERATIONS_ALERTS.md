# First 72 hours operations dashboard / alerts

Monitor every 5 minutes or via your external uptime monitor:
- Public HTTPS `/health/live`, `/health/ready`, `/release` with a defined incident response when ready fails.
- Process restarts, response latency, 5xx rates, event-loop lag, disk saturation, uploads, database connections and migration state.
- Online paid orders without payment-provider reference, failed/refunding payments, webhook retries/replays and unmatched refund balances.
- Unshipped overdue orders, tracking EXCEPTION/RTO, courier integration failures, COD collection discrepancy.
- Negative sellable stock, impossible batch reserved/blocked quantities, unapproved QA stock offered for sale, recalled orders not held.
- Return/refund aging, support SLA misses, equipment breakdowns that block production and overdue preventive maintenance.
- Backup age and offsite copy verification; document retention/encryption and run an isolated restore drill.

Suggested severity: P0 payments/stock/recall/security/data loss; P1 checkout down/TLS expired/ready failed; P2 SLA/demand forecast issues. Never run automated stock-fixing SQL from alerts. Record incident ticket, owner, time, customer impact, mitigation and reconciliation evidence.
