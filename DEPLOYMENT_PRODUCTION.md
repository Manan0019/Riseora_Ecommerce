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
- `verify:phase78` PASS
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



## Phase 75 address readiness acceptance

Phase 75 adds no Prisma schema change. The database migration head remains `20261006121500_phase69_account_saved_bag_v2`. Before public traffic, confirm `npm run address:doctor` and `npm run verify:phase75` both pass. Address readiness must keep canonical required fields separate from non-blocking quality guidance, reuse configured shipping-zone city/state only as an explicit customer-approved correction, and never silently rewrite the delivery address. Phase 73 remains the shipping/serviceability authority and Phase 57 remains the final Checkout authority before order/payment mutation. New or updated saved addresses must use a 6-digit PIN. Rolling address-readiness counters must remain aggregate/in-memory and must not retain customer identity, phone numbers, PIN codes or address text. No new migration is permitted for Phase 75.


## Phase 76 final order review acceptance

Phase 76 adds no Prisma schema change. The database migration head remains `20261006121500_phase69_account_saved_bag_v2`. Before public traffic, confirm `npm run final-review:doctor` and `npm run verify:phase76` both pass. Checkout must generate a canonical server-side final-review digest only after the existing address, delivery, payment and Phase 57 readiness checks are satisfied. The customer must explicitly confirm that review before COD order creation or online-payment reservation can begin. Both mutation paths must recompute the digest and reject stale confirmation with `CHECKOUT_REVIEW_CHANGED` rather than silently accepting changed stock, pricing, promotions, delivery, payment method or delivery details. Final-review telemetry must remain aggregate/in-memory and must not retain customer identity, address, cart contents or review digests. Phase 57 remains the final stock/serviceability/pricing authority and no new migration is permitted for Phase 76.


## Phase 77 protected checkout submission acceptance

Phase 77 adds no Prisma schema change. The database migration head remains `20261006121500_phase69_account_saved_bag_v2`. Before public traffic, confirm `npm run submission-safety:doctor` and `npm run verify:phase77` both pass. COD and Online mutation requests must carry the existing protected checkout key, exact retries must remain idempotent, and the same key must never silently reuse an Order or CheckoutSession when account/contact/address/coupon/item intent differs. Razorpay provider-order creation for one CheckoutSession must be serialized so parallel requests reuse the attached provider order. Duplicate payment finalization must return the already-created order. Submission-safety telemetry must remain aggregate/in-memory and must not retain customer identity, address, cart contents or checkout request keys. Phase 57 and Phase 76 remain the pricing/stock/final-review authorities, and no new migration is permitted for Phase 77.

## Phase 78 payment confirmation reconciliation acceptance

Phase 78 adds no Prisma schema change. The database migration head remains `20261006121500_phase69_account_saved_bag_v2`. Before public traffic, confirm `npm run payment-confirmation:doctor` and `npm run verify:phase78` both pass. Customer **Check status** and Retry Payment must query Razorpay for a captured payment before encouraging another attempt. A recovered capture must match the CheckoutSession amount before finalization. Webhook event IDs must be reserved before processing, duplicate deliveries must remain idempotently re-processable for crash recovery, and a failed newly-reserved webhook must release its event marker so Razorpay can retry. Admin → Payments must support manual reconciliation of provider-backed pending sessions before operational release. Phase 78 rolling counters must remain aggregate/in-memory and must not retain customer identity, addresses, cart contents, provider payment IDs or webhook bodies. No new migration is permitted for Phase 78.


## Phase 79 order integrity / fulfilment handoff acceptance

Phase 79 adds no Prisma schema change. The database migration head remains `20261006121500_phase69_account_saved_bag_v2`. Before public traffic, confirm `npm run order-integrity:doctor` and `npm run verify:phase79` both pass. Admin → Fulfilment must show the Phase 79 order-integrity health panel, and Admin order detail must show each order's PASS / REVIEW / BLOCK integrity result. Critical payment, stored-total, coupon-redemption or contradictory inventory-reservation mismatches must return `ORDER_INTEGRITY_BLOCKED` before forward fulfilment status changes; legacy/missing trace evidence must remain REVIEW-only so historical orders are not hard-blocked without contradictory evidence. Cancellation/refund paths must remain operable. The Phase 79 integrity service is read-only and must not mutate payment, coupon, inventory or order data. No new migration is permitted for Phase 79.

## Phase 80 dispatch readiness

Phase 80 adds no Prisma schema change. Migration head remains `20261006121500_phase69_account_saved_bag_v2` with 35 migrations. Run `npm run dispatch-readiness:doctor` and `npm run verify:phase80`. A SHIPPED transition must be rejected with `DISPATCH_READINESS_BLOCKED` when address, courier, tracking uniqueness or parcel/courier constraints are critically invalid. A DELIVERED transition must be rejected with `DELIVERY_EVIDENCE_BLOCKED` when persisted shipment handoff evidence is missing or contradictory. Cancellation/refund workflows remain unchanged.

## Phase 81 verification

Before production release, Phase 81 requires `npm run verify:phase81`. The phase adds no Prisma migration; database head remains `20261006121500_phase69_account_saved_bag_v2`.


## Phase 82 RTO recovery / reconciliation acceptance

Phase 82 adds no Prisma schema change. The database migration head remains `20261006121500_phase69_account_saved_bag_v2` with 35 migrations. Before public traffic, confirm `npm run rto-recovery:doctor` and `npm run verify:phase82` both pass. RTO stock must never be restored merely because `RTO_INITIATED` exists; physical `RTO_DELIVERED` evidence is required. Completed COD RTO closure must atomically restore item stock, roll back coupon redemption where applicable, cancel an uncollected COD payment and close the order. A prepaid shipped order may use the provider refund path only after Phase 82 confirms completed RTO evidence. Cancelled RTO orders must retain inventory-restoration and payment evidence; contradictory collected COD or missing prepaid refund evidence is a blocking reconciliation issue.

## Phase 83 — Return Resolution Center V2
Phase 83 introduces database migration `20261007123000_phase83_returns_resolution_inspection_v2`. Expected migration count becomes 36. Run `npm run db:deploy`, `npm run db:generate`, `npm run db:status`, `npm run returns-resolution:doctor`, and `npm run verify:phase83` before public traffic. Do not mark returned merchandise sellable merely because a return reached RECEIVED; Phase 83 inspection must explicitly classify restock, quarantine and write-off quantities. Replacement dispatch must allocate inventory atomically and preserve safety stock. Refunds must not bypass inspection approval.
