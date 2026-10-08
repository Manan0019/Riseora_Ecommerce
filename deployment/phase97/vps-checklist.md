# Phase 97: VPS / self-hosted server (provider-independent)

This is a preparation template, not an automated production installation.

- Host: supported Linux + Node 24, or rootless Docker image built from the full project. Provide CPU/RAM sized to real load and reserve disk for growth/backups.
- DNS/TLS: use a validated certificate, HTTPS-only redirects and HSTS only after certificate/domain readiness. Keep ports 5432, 5000, admin panels and metrics private; expose only reverse-proxy 80/443 as needed.
- Database: prefer managed off-host PostgreSQL. If self-hosted, bind to a private interface and enable TLS/auth, encrypted off-host backups, limited role permissions, WAL/point-in-time recovery only if configured and verified.
- Reverse proxy: adapt `deployment/nginx/riseora.conf.example` to your real domain and static/API serving architecture. Verify SPA fallback never intercepts `/api/system` and admin APIs.
- Process: use Docker Compose or systemd under a non-root service account with restart policy, graceful stop and logs. Do not run Vite dev server in production.
- Persist uploaded assets and any other runtime files in a dedicated volume with correct permissions. Backups must include both DB and asset storage.
- Staging: separate database, credentials, payment sandbox, image storage, domain and application process; never run customer payment tests against live production.
- Cutover: pin DB fingerprint, run full verify, dependency audit, backup+restore evidence, deploy migrations with explicit approval, restart app, prove public contract and payment flows; record owner acceptance.
- Rollback: old app may be incompatible with new schema; prefer forward fix. Any DB restore requires write freeze, transaction-loss assessment, owner approval and verified backup.
