# 🌿 Riseora E-Commerce

Standalone full-stack e-commerce platform for **Riseora Herbals**.

This repository is intentionally independent from the Riseora ERP. The storefront, customer accounts, orders and catalogue are developed here first. ERP synchronization can be added later through a controlled API/sync layer.

## Current scope

- Responsive React storefront
- Product categories, products, variants and images
- Advanced product search, category/price/stock filters and sorting
- Persistent shopping cart
- Customer registration/login
- Guest or signed-in checkout
- COD plus optional Razorpay checkout with transactional stock reservation/reduction
- Customer order history, detail timeline and guest order tracking
- Admin dashboard for catalogue, product content, inventory, customers, promotions, reviews, returns, audience and order fulfilment
- PostgreSQL + Prisma 7
- Public-repository-safe environment templates

Razorpay payments, Cloudinary image storage and Resend email are optional integrations controlled by environment credentials. Local image upload and COD continue to work without those providers. Direct courier API automation and ERP synchronization remain later integrations.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React + Vite |
| Routing | React Router |
| Backend | Node.js + Express + TypeScript |
| Validation | Zod |
| Database | PostgreSQL |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| Authentication | JWT + bcrypt |

## Project structure

```text
riseora_ecommerce/
├── client/
│   ├── src/
│   ├── .env.example
│   └── package.json
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   ├── .env.example
│   ├── prisma.config.ts
│   └── package.json
├── .gitignore
├── package.json
└── README.md
```

## Important before replacing your current project

If you already created the PostgreSQL database and ran Prisma migrations, **back up these items first**:

```text
server/.env
server/prisma/migrations/
```

Do not publish `server/.env`. It contains credentials.

This ZIP deliberately does **not** include a migrations folder, so extracting/copying it over your existing project will not overwrite your current migration history. If you are creating a fresh database, Prisma will create migrations when you run `npm run db:migrate`.

## Windows setup

From the project root:

```powershell
npm install
```

Create the server environment file:

```powershell
Copy-Item server\.env.example server\.env
```

Create the client environment file:

```powershell
Copy-Item client\.env.example client\.env
```

Edit `server/.env` and set your real local values. Example:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
DATABASE_URL=postgresql://riseora_app:YOUR_PASSWORD@127.0.0.1:5432/riseora_ecommerce_dev
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-characters
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-strong-admin-password
```

Never commit the real `.env` file.

## Database

Make sure PostgreSQL is running first. Then generate Prisma Client:

```powershell
npm run db:generate
```

If your existing Riseora e-commerce database already has the current schema and migration history, keep its migration folder and use the appropriate Prisma migration workflow.

For a fresh development database:

```powershell
npm run db:migrate -- --name initial_ecommerce_schema
```

Create/update the admin user configured in `server/.env`:

```powershell
npm run db:seed
```

Open Prisma Studio if needed:

```powershell
npm run db:studio
```

## Run development

Start both API and frontend from the root:

```powershell
npm run dev
```

Defaults:

```text
Frontend: http://localhost:5173
API:      http://localhost:5000
Health:   http://localhost:5000/api/health
```

## Build

```powershell
npm run build
```

Run the compiled API:

```powershell
npm run start --workspace server
```

Preview the production frontend build:

```powershell
npm run preview --workspace client
```

## Main API routes

```text
GET    /api/health
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
GET    /api/categories
GET    /api/products
GET    /api/products/:slug
POST   /api/orders
GET    /api/orders/my
GET    /api/orders/my/:orderNumber
GET    /api/orders/track
GET    /api/admin/orders
GET    /api/admin/orders/:id
PATCH  /api/admin/orders/:id/fulfilment
POST   /api/admin/uploads/products
POST   /api/admin/categories
POST   /api/admin/products
```

Admin routes require a JWT belonging to a user whose role is `ADMIN`.

## Product data model

```text
Category
  └─ Product
       ├─ ProductImage
       └─ ProductVariant
            ├─ SKU
            ├─ Size / Unit
            ├─ MRP
            ├─ Selling Price
            └─ Stock Quantity
```

Orders snapshot product name, SKU, variant and selling price so historical invoices do not change when the catalogue changes later.

## Public repository security

Do not commit:

- database passwords
- JWT secrets
- admin passwords
- payment gateway keys
- SMTP credentials
- production customer/order exports
- cloud-storage secrets

This repository does not include an open-source license. Public visibility does not by itself grant permission to reuse or redistribute the source code.

## Phase 9 additions

- Advanced storefront filtering and sorting
- Related and recently viewed products
- Product benefits, ingredients, usage, suitability and FAQs
- Review moderation workflow
- Cart recovery signal foundation (no automatic recovery email yet)

See `PHASE9_DISCOVERY_CONTENT_RECOVERY.md` for the migration and runtime checklist.

## Next production phases

1. Real Riseora catalogue, photography and copy
2. Persistent cloud image storage (replace Phase 5 local-disk uploads)
3. Online payment gateway
4. Courier/shipping-provider API integration
5. Email/WhatsApp order notifications
6. Returns/refunds policy workflow
7. Production deployment, domain, backups and observability
8. Riseora ERP product/stock/order synchronization

---

Copyright © Riseora Herbals. All rights reserved.

---

## Mobile-first Phase 2

The customer storefront is now designed mobile-first while remaining responsive on desktop. Mobile users receive thumb-friendly navigation, horizontal category/featured-product browsing, a two-column shop catalogue, and a sticky product purchase bar.

The admin experience is intentionally separated from the customer storefront and now includes Dashboard, Catalog, Orders, and Promotions areas. Promotions support storefront offers and checkout coupon codes.

When updating an existing local installation, preserve `server/.env` and `server/prisma/migrations/`, then run a new Prisma migration for the promotion models. See `MOBILE_PHASE2_UPDATE.md` for exact commands.


## Phase 5 — uploads, fulfilment and tracking

Phase 5 adds direct local product-image upload for development, customer order timelines, public order tracking by order number + phone, admin shipping/courier fields, status history, stock restoration on pre-shipment cancellation, and COD payment completion on delivery.

Apply the update and run:

```powershell
npm install
npm run db:generate
npm run db:migrate -- --name phase5_fulfilment_tracking
npm run build
```

See `PHASE5_UPLOADS_FULFILMENT_TRACKING.md` for the runtime test sequence.

## Phase 6 — online payments, cloud media and email

Phase 6 adds optional Razorpay checkout with server-side signature verification and webhooks, checkout stock/coupon reservations, prepaid refunds before shipment, optional Cloudinary product-image storage, and optional Resend transactional order emails.

The integrations are feature-gated by environment variables, so local development continues to work with COD + local uploads when no external credentials are configured.

Apply with:

```powershell
npm install
npm run db:migrate -- --name phase6_payments_cloud_email
npm run db:generate
npm run build
```

See `PHASE6_PAYMENTS_CLOUD_EMAIL.md` for environment variables and runtime tests.

## Phase 7 — Store Operations

The current development build also includes:

- configurable shipping/free-shipping/COD fees
- admin-managed courier partners and dispatch CSV export
- customer + admin printable GST-ready invoices
- HSN/SAC and GST rate snapshot per order item
- item-level return requests and reverse tracking
- inventory restock on received returns
- Razorpay partial refunds for eligible online returns
- manual refund references for COD returns
- owner-managed shipping, returns, privacy and terms pages
- production deployment checklist

See `PHASE7_RETURNS_INVOICES_STOREOPS.md` and `DEPLOYMENT_PRODUCTION.md`.

> Tax classifications are not inferred by the application. Riseora should enter GSTIN, HSN/SAC and GST rates only after confirmation from its accountant/tax adviser.


## Phase 8 — Production launch preparation
SEO metadata/sitemap, About/Contact, newsletter + admin inbox, consent-gated analytics, PWA/mobile performance, security hardening and deployable same-origin production serving are now included. See `PHASE8_LAUNCH_SEO_AUDIENCE_PWA.md`.


## Phase 10 — Reports & back-in-stock alerts

Phase 10 adds date-range business reports with CSV export plus customer back-in-stock requests for sold-out product variants. Pending demand is visible in Admin → Audience and can be notified automatically after restock when Resend email is configured.

Apply with:

```powershell
npm run db:migrate -- --name phase10_reports_stock_alerts
npm run db:generate
npm run build
```

See `PHASE10_REPORTS_STOCK_ALERTS.md` for the runtime checklist.


## Phase 11 — Account security & consent-based cart recovery

Phase 11 adds secure forgot/reset-password flows, customer password change with older-session invalidation, single-use reset tokens, recoverable cart links using current stock/pricing, explicit recovery-email consent, admin manual reminder controls, and optional two-step automated abandoned-cart reminders.

Apply with:

```powershell
npm run db:migrate -- --name phase11_account_security_cart_recovery
npm run db:generate
npm run build
```

See `PHASE11_ACCOUNT_SECURITY_CART_RECOVERY.md` for configuration and runtime tests.

## Phase 12 — Brand media & image merchandising

Phase 12 adds owner-managed Riseora logo assets, a multi-slide mobile/desktop homepage campaign carousel, direct campaign image upload, slideshow reordering/editing, product multi-image reordering, desktop hover image slideshows and a smoother swipeable product gallery.

Apply with:

```powershell
npm run db:migrate -- --name phase12_brand_media_slideshow
npm run db:generate
npm run build
```

See `PHASE12_BRAND_MEDIA_SLIDESHOW.md` for the runtime checklist.

## Phase 13 — Default logos & automatic merchandising

Phase 13 makes the two Riseora PNG files in `client/src/assets` the default brand identity while preserving Admin-uploaded overrides. It also introduces server-validated combo discounts, Buy-X-Get-Y, and gift-with-purchase merchandising through the new Admin → Merchandising workspace.

Apply with:

```powershell
npm run db:migrate -- --name phase13_brand_merchandising
npm run db:generate
npm run build
```

See `PHASE13_BRAND_MERCHANDISING.md` for the exact logo filenames and runtime checklist.

## Phase 14 — Routine Discovery & Mini Cart

Phase 14 adds a customer-controlled Routine Builder, a slide-in mini cart, automatic-offer progress messaging, and a Frequently Bought Together experience backed by delivered-order co-purchase history with a same-category fallback for new stores. No database migration is required for this phase.



## Phase 15 — Mobile Sticky Navigation & Conversion Polish

The storefront now has a persistent safe-area mobile bottom dock, mobile filter sheet, sticky cart checkout action, route scroll reset, cart cross-sells, and a compact five-item mobile Admin dock with a More sheet. No database migration is required. See `PHASE15_MOBILE_STICKY_NAV_POLISH.md` for runtime checks.

## Phase 16 — Predictive Search & Product Quick View

Phase 16 adds live product/category suggestions in the global search, recent-search and recently-viewed discovery, and a responsive product Quick View (desktop modal / mobile bottom sheet) with fresh variant, stock, gallery, wishlist and Add-to-Cart controls. No database migration is required. See `PHASE16_PREDICTIVE_SEARCH_QUICK_VIEW.md` for runtime checks.

## Phase 17 — Instant Buy, Delivery Promise & Mobile Checkout

Phase 17 adds a session-scoped Buy Now path that leaves the normal cart untouched, configurable dispatch/delivery estimates, remembered PIN preference, low-stock urgency messaging, product sharing, and a sticky mobile Checkout completion dock.

Apply with:

```powershell
npm run db:migrate -- --name phase17_instant_buy_delivery_checkout
npm run db:generate
npm run build
```

See `PHASE17_INSTANT_BUY_DELIVERY_CHECKOUT.md` for the runtime checklist.

## Phase 18 — Mobile Visual Hierarchy, Category Media & Purchase Guardrails

Phase 18 replaces the branded route-loading interstitial with a restrained route fade, moves image-led category circles above the campaign on mobile, compresses the first mobile viewport so product discovery starts sooner, stacks product education vertically on phones, adds category image upload/reordering, and adds an optional per-product order quantity limit enforced by both the cart UI and backend checkout.

Apply with:

```powershell
npm run db:migrate -- --name phase18_mobile_category_purchase_limits
npm run db:generate
npm run build
```

See `PHASE18_MOBILE_CATEGORY_GUARDRAILS.md` for the runtime checklist.

## Phase 19 — Content Controls, Quick View Repair & Targeted Coupons

Phase 19 adds reusable Suitable For options, safe rich-text product/campaign authoring, campaign typography controls, a portal-based Quick View fix, smooth FAQ accordions, product/category/order coupon targeting, editable per-customer coupon usage limits, and line-level discount snapshots for accurate new-order invoice/return calculations.

Apply the included migration with:

```powershell
npm run db:deploy
npm run db:generate
npm run build
```

See `PHASE19_CONTENT_COUPON_CONTROLS.md` for the runtime checklist.


## Phase 20 — COD Safety & Checkout Trust

Phase 20 adds owner-configurable Cash on Delivery safeguards, prepaid-only product controls, active-COD-order limits per customer identity, server-side COD enforcement, customer-facing COD eligibility reasons and compact checkout trust messaging.

Apply the included migration with:

```powershell
npm run db:deploy
npm run db:generate
npm run build
```

See `PHASE20_COD_SAFETY_CHECKOUT_TRUST.md` for the runtime checklist.

## Phase 21 — PIN Serviceability & Delivery Zones

Phase 21 turns the earlier generic PIN preference into a real server-enforced delivery system. Admin can define active PIN-prefix zones with optional shipping-fee, free-shipping, COD and ETA overrides. Product Details and Checkout can verify a six-digit Indian PIN, and Checkout stores the matched zone/ETA snapshot on new orders.

The strict serviceability switch is **OFF by default**. Keep it off while building your zone list; unmatched PIN codes continue using the store-wide shipping rules. Turn it on only after the serviceable area is fully configured.

Apply the included migration with:

```powershell
npm run db:deploy
npm run db:generate
npm run build
```

See `PHASE21_DELIVERY_ZONES_SERVICEABILITY.md` for zone-matching examples and the runtime checklist.


## Phase 22 — Visual Reviews & Product Q&A

Phase 22 adds moderated customer review photos, a rating-distribution/filter experience, and a customer product-question workflow with admin draft/publish moderation. Customer review uploads reuse the existing local/Cloudinary media layer and remain hidden until the review is approved.

Apply the included migration with:

```powershell
npm run db:deploy
npm run db:generate
npm run build
```

See `PHASE22_VISUAL_REVIEWS_PRODUCT_QA.md` for the runtime checklist.

## Phase 23 — Repeat Purchase & Private Wishlist Sharing

Phase 23 adds a safe **Buy Again** experience based on delivered purchases and private 30-day wishlist share links. Reorders are rebuilt from the current catalog, so old order prices, stock and limits are never blindly reused. Shared wishlists store only product IDs and an unguessable expiring token—no customer identity data.

Apply the included migration with:

```powershell
npm run db:deploy
npm run db:generate
npm run build
```

See `PHASE23_REPEAT_PURCHASE_SHARED_WISHLIST.md` for the runtime checklist.

## Phase 24 — Production Release & Deployment Readiness

Phase 24 adds production liveness/readiness endpoints, an Admin → System health/backup dashboard, PostgreSQL backup/restore tooling, production env preflight, safe Windows deployment scripts and Docker health/backup persistence.

Start with `README_PHASE24_FIRST.txt` and `PHASE24_PRODUCTION_RELEASE.md`. Runtime production PASS requires the Phase 24 verification/deployment scripts to complete successfully in the target Windows/hosting environment.

## Phase 42 — Account Security, Sessions & Privacy V2

Phase 42 introduces managed per-device login sessions, account-specific failed-login protection, customer security history, password-confirmed account data export and Admin sign-in visibility. It also repairs the Windows `db:doctor` Prisma invocation and moves the storefront to the patched React Router 7.18.4 line.

Useful commands:

```powershell
npm run db:doctor
npm run security:tree
npm run verify:phase42
npm run security:audit:prod
npm run security:audit
```

After deployment, existing JWTs without a managed session ID remain valid until their normal expiry. New sign-ins are represented in **My Account → Security & privacy** and can be individually revoked.

## Phase 76 — Final Order Review & Pre-Payment Change Detection V2

Phase 76 adds a server-generated final checkout snapshot and explicit customer confirmation before COD order creation or Razorpay reservation. A SHA-256 review digest is recomputed again at mutation time, so changed stock, pricing, promotion, delivery, payment or address details cannot silently pass under an older confirmation. Use `npm run final-review:doctor` and `npm run verify:phase76`. No new database migration is required.

## Phase 79 — Post-Payment Order Integrity & Fulfilment Handoff V2

Phase 79 adds a read-only integrity gate between checkout/order creation and physical fulfilment. Admin → Fulfilment and Order Detail now verify payment consistency, line/order totals, coupon redemption, checkout inventory-reservation trace and status history. Critical contradictions block forward fulfilment server-side, while legacy/missing evidence is surfaced as non-blocking REVIEW guidance. Use `npm run order-integrity:doctor` and `npm run verify:phase79`. No new database migration is required.

## Phase 80 — Dispatch Readiness & Courier Handoff V2

Phase 80 extends the Phase 79 fulfilment boundary with server-authoritative dispatch checks. Before SHIPPED, Riseora validates shipping-address completeness, courier/COD/weight constraints, tracking uniqueness and tracking URL hygiene. Before DELIVERED, persisted shipment handoff evidence must remain coherent. Admin → Fulfilment and Order Detail show READY / REVIEW / BLOCK dispatch readiness. Use `npm run dispatch-readiness:doctor` and `npm run verify:phase80`. No new database migration is required.
