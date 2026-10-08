# Phase 97 — Choose infrastructure after code is staging-ready

No provider has been selected. Do not hardwire provider-specific credentials or runtime assumptions into application code. Selection should be based on measured requirements, not only initial hosting price.

| Model | Benefits | Must prove before selection |
| --- | --- | --- |
| Managed app + managed PostgreSQL | Simplest ongoing server maintenance | Region, database plan/backup retention, TLS/custom domains, persistent uploads, cron/jobs, limits and real monthly cost |
| VPS + managed PostgreSQL | More control, portable backend | Owner to patch OS, supervise processes, configure backups/logging/TLS, recover downtime |
| VPS + self-hosted PostgreSQL | Full control | Strong DBA backup/restore/PITR, DB isolation, security, monitoring and outage recovery |
| Own Windows PC | Reuses local hardware | Static IP/domain reachability, 24×7 power/network, firewall, noninteractive startup, offsite encrypted backups, physically secure hosting |

## Decision gate

Choose a provider only after the following are established: application builds cleanly on Node 24; staging checkout and payment-webhook tests pass; upload persistence and off-host database restore succeed; estimated storage/bandwidth and expected order traffic are known; payment/webhook/IP restrictions and customer data jurisdiction are confirmed.

**Recommended starting topology to evaluate:** managed application runtime with managed PostgreSQL and persistent asset storage; this reduces day-one operational burden compared with serving customers from a personal PC. It remains a recommendation pending actual cost, compliance and business requirements.
