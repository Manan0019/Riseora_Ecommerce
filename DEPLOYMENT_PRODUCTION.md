# Riseora Production Deployment — Phase 49

Riseora remains a standalone e-commerce application. ERP synchronization stays deferred until the standalone web release is verified in production.

## Recommended deployment shape

Use one canonical HTTPS origin when practical:

```text
Browser
  ↓ HTTPS
Trusted reverse proxy / platform ingress
  ↓
Express
  ├─ /api/*
  ├─ /uploads/*
  ├─ SEO routes
  └─ Vite client/dist SPA
       ↓
PostgreSQL
```

Set `SERVE_CLIENT=true` for the single-origin deployment. A separate frontend deployment remains supported; if used, configure explicit HTTPS origins and verify CORS carefully.

## Environment

Create `server/.env.production` from its example. Never commit it.

Important values include:

- `NODE_ENV=production`
- `DATABASE_URL`
- a unique 48+ character `JWT_SECRET`
- `CLIENT_URL`
- `PUBLIC_SITE_URL`
- explicit `ALLOWED_ORIGINS`
- `TRUST_PROXY=true` only behind a trusted proxy
- `SERVE_CLIENT=true` for same-origin hosting
- `RELEASE_NAME`
- `RELEASE_SHA`
- `RELEASE_BUILD_TIME`

Payment, media and email values must either be complete or intentionally left disabled.

## Release workflow

Run:

```text
npm run release:doctor
npm run release:prepare
```

`release:prepare` enforces:

```text
doctor
→ verified backup
→ committed migration deploy
→ Prisma generate
→ schema verification
→ source/security verification
→ TypeScript
→ server build
→ client build
```

Never replace this with `prisma migrate dev`, `prisma migrate reset`, or `prisma db push` in production.

## Start

```text
npm run start:production
```

Use `/api/health/live` for liveness and `/api/health/ready` for readiness.

## Smoke test

Local production simulation:

```text
npm run release:smoke
```

Remote deployment:

```powershell
$env:API_BASE_URL="https://your-domain.example/api"
$env:SITE_BASE_URL="https://your-domain.example"
npm run release:smoke
```

## Database commands

Local development commands target `server/.env` by default:

```text
npm run db:doctor
npm run db:status
npm run db:backup
```

Production commands are explicit:

```text
npm run db:doctor:production
npm run db:status:production
npm run db:backup:production
```

Restore always requires typed confirmation. Use `--production` or an explicit `--env` when the intended target is production.

## Rollback/recovery

Automatic migration rollback is intentionally not implemented. Restore from a verified backup or use a forward-fix migration. Confirm the target database before any restore operation.

## Release acceptance

Before public traffic:

- `release:doctor` PASS
- `verify:phase64` PASS
- `security:audit` reviewed
- `db:status:production` PASS
- verified recent backup exists
- Admin → System shows API ready / schema ready
- payment webhook tested
- email sender tested
- media storage tested
- maintenance mode tested
- `release:smoke` PASS against the deployed URL
