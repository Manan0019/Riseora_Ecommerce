# 🌿 Riseora E-Commerce

Standalone full-stack e-commerce platform for **Riseora Herbals**.

This repository is intentionally independent from the Riseora ERP. The storefront, customer accounts, orders and catalogue are developed here first. ERP synchronization can be added later through a controlled API/sync layer.

## Current scope

- Responsive React storefront
- Product categories, products, variants and images
- Product search and category filters
- Persistent shopping cart
- Customer registration/login
- Guest or signed-in checkout
- COD order creation with transactional stock reduction
- Customer order history, detail timeline and guest order tracking
- Admin dashboard for catalogue, inventory, customers, promotions and order fulfilment
- PostgreSQL + Prisma 7
- Public-repository-safe environment templates

Online payment gateway, persistent cloud image storage, courier API integration and ERP sync remain later integrations because they require real provider credentials and business rules. Phase 5 includes local development image upload plus manual carrier/tracking management.

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
