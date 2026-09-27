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
- Customer order history
- Admin API + basic admin screen for catalogue/order operations
- PostgreSQL + Prisma 7
- Public-repository-safe environment templates

Online payment gateway, image upload/cloud storage, shipping-provider integration and ERP sync are intentionally left as later integrations because they require real provider credentials and business rules.

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
GET    /api/admin/orders
PATCH  /api/admin/orders/:id/status
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

## Future phases

1. Real Riseora catalogue and product photography
2. Cloud image upload/storage
3. Online payment gateway
4. Shipping/fulfilment integration
5. Customer address book
6. Coupons and offers
7. Email/WhatsApp notifications
8. Production deployment and domain setup
9. Riseora ERP product/stock/order synchronization

---

Copyright © Riseora Herbals. All rights reserved.
