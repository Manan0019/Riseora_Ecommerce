# Riseora Production Deployment Preparation

The e-commerce system remains standalone. ERP synchronization stays deferred until production web workflows are verified.

## Recommended launch shape
For the first production release, a **single HTTPS origin** is easiest:
- Node/Express serves `/api/*`, `/sitemap.xml`, `/robots.txt` and the built Vite SPA
- PostgreSQL runs as a managed/separately backed-up database
- Cloudinary stores uploaded product imagery
- Razorpay handles online payments
- Resend handles transactional email

Set `SERVE_CLIENT=true`, `PUBLIC_SITE_URL=https://www.your-domain.com`, and keep `CLIENT_URL` on the same canonical origin.

## Production controls
- `NODE_ENV=production`
- strong unique `JWT_SECRET`
- HTTPS only
- `TRUST_PROXY=true` only behind a trusted reverse proxy/load balancer
- explicit `CLIENT_URL` / `ALLOWED_ORIGINS`
- production PostgreSQL application user with only required privileges
- Cloudinary enabled before relying on uploaded images
- Razorpay webhook secret configured on the HTTPS endpoint
- transactional email domain verified
- database backups + tested restore procedure
- do not commit `.env`
- deploy migrations with `prisma migrate deploy`, not `migrate dev`

## Build/deploy order
```text
1. Provision production PostgreSQL
2. Configure server/.env.production
3. Configure client production VITE_* variables
4. npm install
5. npm run db:generate
6. npm run db:deploy
7. npm run build
8. Start server/dist with SERVE_CLIENT=true
9. Verify /api/health
10. Verify /robots.txt and /sitemap.xml
11. Test COD checkout
12. Test Razorpay in test mode
13. Test emails and Cloudinary
14. Test fulfilment, invoice and return/refund
15. Validate contact/newsletter inbox
16. Verify analytics is OFF before consent and ON after consent
17. Verify mobile install/PWA behavior
18. Only then switch payment credentials to live
```

## SEO launch checklist
- canonical `siteUrl` in Admin → Settings
- SEO title + description
- About and Contact content
- product images + descriptions
- real policy text
- social links
- Search Console / analytics only after domain ownership is established

## Legal/business data
Owner/accountant must confirm legal business name, GSTIN, invoice address, HSN/SAC, GST rates, shipping/COD rules and all legal/policy copy.

## ERP later
Never expose the ERP database publicly. Future sync should use authenticated APIs/jobs with shared SKU identity and explicit conflict handling.
