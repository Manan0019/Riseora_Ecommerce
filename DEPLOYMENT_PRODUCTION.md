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
- `verify:phase74` PASS
- `security:audit` reviewed
- `db:status:production` PASS
- verified recent backup exists
- Admin → System shows API ready / schema ready
- payment webhook tested
- email sender tested
- media storage tested
- maintenance mode tested
- `release:smoke` PASS against the deployed URL


## Phase 67 shop discovery acceptance

Before public traffic, confirm `npm run discovery:doctor` and `npm run verify:phase67` both pass. Guided collections and filters must remain derived from active catalogue data, approved customer ratings only, and live availability after safety stock. Catalogue discovery is shopping guidance, not medical diagnosis or a treatment promise.


## Phase 68 saved shopping acceptance

Before public traffic, confirm `npm run saved-shopping:doctor` and `npm run verify:phase68` both pass. Saving a product must never auto-subscribe a customer to price or stock alerts. Wishlist intelligence must use sellable stock after safety stock, alert creation must remain an explicit customer action, and Admin health must remain aggregate-only.


## Phase 69 cross-device Saved Bag acceptance

Phase 69 adds migration `20261006121500_phase69_account_saved_bag_v2`. Before public traffic, create a verified database backup, run committed migrations, regenerate Prisma Client, and confirm `npm run db:status` reports `AccountCart` with the Phase 69 migration as the applied head. Then confirm `npm run saved-bag:doctor` and `npm run verify:phase69` both pass. Signed-in bags must merge browser/account quantities without doubling duplicate variants, saved rows must persist only variant identity + quantity, and every restore must re-read current price, safety-stock-aware availability, and purchase limits. Saved Bag persistence is operational account functionality and must remain separate from cart-recovery marketing consent.


## Phase 70 multi-device Saved Bag conflict acceptance

Phase 70 adds no Prisma schema change. The database migration head remains `20261006121500_phase69_account_saved_bag_v2`. Before public traffic, confirm `npm run saved-bag-conflict:doctor` and `npm run verify:phase70` both pass. Stale Saved Bag writes must return an explicit revision conflict instead of overwriting a newer account bag; Cart and normal Checkout must require the customer to choose either the current account bag or the browser bag. Choosing the browser bag must revalidate current sellable stock and purchase limits before saving it. Buy Now stays session-scoped and outside this conflict flow. Clean signed-in tabs may refresh from a newer account revision when they regain focus, but unsynced local edits must never be overwritten automatically.


## Phase 71 cart organization and save-for-later acceptance

Phase 71 adds no Prisma schema change. The database migration head remains `20261006121500_phase69_account_saved_bag_v2`. Before public traffic, confirm `npm run cart-intent:doctor` and `npm run verify:phase71` both pass. Active bag and Save for Later intent must share the Phase 70 optimistic revision/conflict contract; a stale device must never overwrite either bucket silently. Persistent `AccountCart.items` rows may store only variant identity, requested quantity and the `LATER` intent marker—current price, MRP, product copy, images, safety-stock-aware availability and purchase limits must continue to be re-read from the live catalogue. Out-of-stock active lines must not enter Checkout, while an active product/variant may remain in Save for Later with current availability shown as zero. Checkout and order payloads must include only the active bag. Save for Later is operational shopping intent only: it must not create Wishlist membership, price/stock alerts, abandoned-cart consent, email, SMS or WhatsApp marketing subscriptions.


## Phase 72 cart quantity readiness acceptance

Phase 72 adds no Prisma schema change. The database migration head remains `20261006121500_phase69_account_saved_bag_v2`. Before public traffic, confirm `npm run quantity:doctor` and `npm run verify:phase72` both pass. Cart quantity guidance must re-read current selling price, MRP, public availability after safety stock, configured low-stock threshold and `maxPurchaseQuantity` from the live catalogue. Product-level purchase limits must be enforced across variants of the same product. When the current cart exceeds a live ceiling, the Cart must require an explicit **Apply safe quantities** action before Cart-level Checkout navigation can continue. This is an early shopping guard only; Phase 57 Checkout readiness remains the final server authority before order or payment mutation. Rolling Admin readiness counters must remain aggregate/in-memory and must not retain customer identity or cart contents.


## Phase 73 delivery promise intelligence acceptance

Phase 73 adds no Prisma schema change. The database migration head remains `20261006121500_phase69_account_saved_bag_v2`. Before public traffic, confirm `npm run delivery:doctor` and `npm run verify:phase73` both pass. Cart delivery previews must reuse the canonical Checkout preparation and Phase 44 shipping-zone/courier rules, including automatic promotions and parcel weight, while clearly remaining a pre-checkout estimate. Known unserviceable PIN codes may block Cart-level checkout navigation, but Phase 57 Checkout readiness remains the final server authority for shipping, COD/payment eligibility, coupons, stock and order/payment mutation. Signed-in customers may reuse only the default saved-address PIN in Cart; the delivery-preview telemetry must remain aggregate/in-memory and must not retain customer identity, PIN codes or cart contents. No new migration is permitted for Phase 73.

## Phase 74 payment readiness acceptance

Phase 74 adds no Prisma schema change. The database migration head remains `20261006121500_phase69_account_saved_bag_v2`. Before public traffic, confirm `npm run payment-readiness:doctor` and `npm run verify:phase74` both pass. The payment-readiness preview must reuse canonical Checkout preparation for both secure online payment and COD, must expose COD restriction reasons without creating payment-provider sessions, and must never claim Razorpay provider health before an actual payment session is created. Phase 57 Checkout readiness remains the final server authority before order/payment mutation. Rolling payment-readiness counters must remain aggregate/in-memory and must not retain customer identity, PIN codes, cart contents or payment credentials. No new migration is permitted for Phase 74.

