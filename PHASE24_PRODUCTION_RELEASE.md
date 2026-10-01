# Riseora E-Commerce — Phase 24
## Production Release & Deployment Readiness

Phase 24 converts the Phase 23 application into an operator-ready production release without changing catalogue, checkout, order, coupon or wishlist business rules.

## What Phase 24 adds

### Health and readiness
- `GET /api/health/live` — process liveness, no database dependency.
- `GET /api/health/ready` — readiness check including PostgreSQL.
- Existing `GET /api/health` remains backwards compatible.
- Admin-only `GET /api/admin/system/health` exposes safe operational status only; it never returns secrets.

### Admin → System
The admin panel now shows:
- overall health
- database connectivity and latency
- upload-directory write access
- backup-directory write access
- `pg_dump` availability
- Razorpay / Cloudinary / transactional-email configuration presence
- backup retention and backup history
- manual **Backup now** action

Database restore is intentionally not exposed to the browser.

### PostgreSQL backups
Backups use PostgreSQL custom format (`pg_dump --format=custom`) and are stored under `server/backups` by default.

Production retention is controlled by:

```env
BACKUP_DIR=backups
BACKUP_RETENTION_COUNT=14
```

Backups are excluded from Git.

### Safe restore
`RESTORE_DATABASE.bat` uses `pg_restore --clean --if-exists --exit-on-error` and requires typing `RESTORE` exactly after displaying the target host/database.

Always create a fresh backup before restoring another backup.

## Copy-paste/apply flow

1. Copy this Phase 24 package into the current project root and merge/replace files.
2. Keep your existing `server/.env` unchanged.
3. Run:

```bat
PHASE24_APPLY.bat
```

This performs:
1. `npm ci`
2. Prisma client generation
3. committed migration deployment against the **current `server/.env` database**
4. server typecheck
5. server + client production build

It does **not** use the production database.

## Preparing production environment

Run once:

```bat
PREPARE_PRODUCTION_ENV.bat
```

It only creates missing files from examples. Existing production env files are never overwritten.

Then fill:
- `server/.env.production`
- `client/.env.production`

Do not use example credentials in production.

## Production preflight without DB mutation

```bat
PHASE24_VERIFY_PRODUCTION.bat
```

This validates production env safety, generates Prisma, typechecks and builds. It does not migrate the live database.

Warnings for optional services do not fail the build, but online payments/email/image-hosting should not be advertised as ready until their warnings are resolved.

## Safe production deploy

```bat
PRODUCTION_DEPLOY.bat
```

The script requires typing `DEPLOY` and then:
1. creates a production database backup
2. runs production preflight
3. generates Prisma
4. runs `prisma migrate deploy` using `server/.env.production`
5. typechecks
6. creates the production build

If backup fails, migration does not start.

## Start production

```bat
PRODUCTION_START.bat
```

Then verify:
- `http://localhost:5000/api/health/live`
- `http://localhost:5000/api/health/ready`
- storefront loads
- `/admin/system` is healthy

For a public deployment, use the canonical HTTPS domain from `PUBLIC_SITE_URL` behind your trusted reverse proxy or hosting platform.

## Manual backup

```bat
BACKUP_DATABASE.bat
```

If `server/.env.production` exists it is used by default; otherwise `server/.env` is used. To force a target:

```bat
BACKUP_DATABASE.bat --env=server/.env
BACKUP_DATABASE.bat --env=server/.env.production
```

## Manual restore

```bat
RESTORE_DATABASE.bat server\backups\riseora-YYYY-MM-DDTHH-MM-SS-mmmZ.dump --env=server/.env.production
```

After restore:

```bat
npm run db:deploy
npm run verify:phase24
```

For a production target, rerun `PRODUCTION_DEPLOY.bat` rather than using the development migration command.

## PostgreSQL client requirement
`pg_dump` and `pg_restore` must be available in PATH for local Windows backup/restore. The Phase 24 Docker image installs PostgreSQL client tools automatically.

If PostgreSQL 18 is installed locally, add its `bin` folder to PATH if Windows cannot find these commands.

## Docker changes
The Phase 24 Docker image:
- uses Node 24 Alpine
- installs `postgresql-client`
- exposes readiness health checks
- creates uploads + backup directories

The production compose example persists:
- product uploads
- database backup files

Database backups are still not a replacement for an off-machine backup policy. Copy production backups to a separate secured location according to your hosting policy.

## Phase 24 launch acceptance
Do not mark production launch PASS until all relevant checks below have been manually verified:

- `PHASE24_APPLY.bat` PASS
- `PHASE24_VERIFY_PRODUCTION.bat` PASS
- fresh production backup succeeds
- `PRODUCTION_DEPLOY.bat` PASS
- `/api/health/live` HTTP 200
- `/api/health/ready` HTTP 200 with database ready
- Admin → System reports healthy
- admin login works
- product listing/detail works
- cart quantity/price totals correct
- product/category coupons still enforce configured restrictions
- COD eligibility/serviceability still works
- Razorpay test transaction works before live-key switch
- order confirmation created correctly
- invoice renders correctly
- order admin status changes work
- return/refund flow works
- Buy Again uses current product/variant state
- shared wishlist handles valid, expired and invalid links correctly
- transactional email verified
- Cloudinary upload verified if used
- mobile storefront/admin smoke test completed
- a test backup has been restored into a disposable database successfully

## No automatic destructive cleanup
Phase 24 deliberately does not contain a production-data reset or wipe command. Test-data cleanup must be reviewed separately because deleting orders/payments/customers can damage audit and accounting history.
