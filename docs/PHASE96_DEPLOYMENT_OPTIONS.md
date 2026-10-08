# Hosting patterns (choose one before cutover)

Riseora is a Node + Vite/React + PostgreSQL application. Choose an environment that supports persistent PostgreSQL, uploads, TLS, background jobs and deterministic restarts.

### Managed platform + managed PostgreSQL
Deploy the built API with same-origin `/api`, serve React dist through the existing production server or an appropriately configured static host. Configure secrets via hosting provider; confirm file uploads need persistent object storage or persistent volume. Set webhook public URL and process uptime monitoring. Check database SSL requirements.

### Ubuntu VPS
Use systemd example and Nginx template in `deployment/`. Create an unprivileged `riseora` OS user, store files in `/opt/riseora/app`, restrict env file to the runtime user, keep TLS certificate renewal active and expose only Nginx ports 80/443. Use managed PostgreSQL or separately hardened DB. Never allow PostgreSQL 5432 publicly without controls.

### Windows Server
Build from a release workspace, configure `server/.env.production`, run under a supervised Windows service manager or your chosen service platform (not a transient interactive PowerShell terminal). Use IIS/ARR or another TLS proxy. Verify automatic restart, uploads permissions, event log, OS firewall, certificate renewal and PostgreSQL backup/restore.

**Do not deploy using `npm run dev`**. Use the project's production start command after successful build. Templates are examples and must be adapted to your actual host/path/domain. None of them provisions paid infrastructure or secrets.
