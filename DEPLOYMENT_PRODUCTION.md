# Riseora Production Deployment

The e-commerce application remains standalone. ERP synchronization is still deferred until production web workflows are verified.

## Recommended release shape
Use one canonical HTTPS origin:
- Express serves `/api/*`, `/sitemap.xml`, `/robots.txt` and the built Vite SPA.
- PostgreSQL is separately backed up.
- Cloudinary stores production product/media uploads when configured.
- Razorpay handles online payments.
- Resend handles transactional email.

Set `SERVE_CLIENT=true` and use the same canonical HTTPS origin for `CLIENT_URL` and `PUBLIC_SITE_URL` unless your hosting architecture explicitly separates them.

## Phase 24 deployment commands

Prepare missing env files only:

```bat
PREPARE_PRODUCTION_ENV.bat
```

Verify env + builds without touching the production database:

```bat
PHASE24_VERIFY_PRODUCTION.bat
```

Safe deployment with pre-migration backup:

```bat
PRODUCTION_DEPLOY.bat
```

Start the built server:

```bat
PRODUCTION_START.bat
```

## Health endpoints
- `/api/health/live` — Node process liveness
- `/api/health/ready` — PostgreSQL readiness
- `/api/health` — backwards-compatible health response

Use `/api/health/ready` for load-balancer/container readiness checks.

## Production controls
- `NODE_ENV=production`
- unique `JWT_SECRET` (48+ characters recommended; never example text)
- HTTPS only for public URLs
- `TRUST_PROXY=true` only behind a trusted reverse proxy/load balancer
- explicit canonical origins
- production PostgreSQL user with required privileges only
- Razorpay webhook secret configured before enabling live payments
- Cloudinary enabled before relying on durable uploaded media
- verified transactional-email sender
- PostgreSQL client tools available for backup/restore
- database backups retained and copied off-machine
- tested restore into a disposable database
- never commit `.env.production`
- deploy migrations with `prisma migrate deploy`, not `migrate dev`

## Backup safety
`PRODUCTION_DEPLOY.bat` stops if the pre-deployment backup fails. Browser admin may create backups, but database restore is intentionally CLI-only via `RESTORE_DATABASE.bat`.

See `PHASE24_PRODUCTION_RELEASE.md` for the complete acceptance checklist and restore procedure.

## SEO / business launch checks
Before public launch confirm canonical URL, SEO metadata, real policy content, legal name, GSTIN, invoice address, HSN/GST rates, shipping/COD rules, support contacts, Search Console/analytics configuration and consent behavior.

## ERP later
Never expose the ERP database publicly. Future synchronization should use authenticated APIs/jobs with shared SKU identity, idempotency and explicit conflict handling.
