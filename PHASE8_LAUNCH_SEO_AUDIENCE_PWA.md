# Phase 8 — Launch readiness, SEO, audience and PWA

## Added
- Dynamic page titles, descriptions, canonical URLs, Open Graph/Twitter metadata
- Product + organization JSON-LD
- Dynamic `/sitemap.xml` and `/robots.txt` from the Node server
- About and Contact pages
- Persisted contact inbox for Admin
- Newsletter signup + admin subscriber export
- Consent-gated optional GA4 and Meta Pixel
- Mobile PWA manifest, icons and service worker
- Route-level lazy loading/code splitting
- Production same-origin static client serving with `SERVE_CLIENT=true`
- Configurable CORS allow-list + proxy awareness
- Global API rate limiting
- Docker production starter
- Admin-editable SEO/social/about/contact/announcement fields

## Migration
Run:
```powershell
npm run db:migrate -- --name phase8_launch_seo_audience
npm run db:generate
npm run build
```

## Production note
When using one domain for API + storefront, set `SERVE_CLIENT=true` and `PUBLIC_SITE_URL=https://your-domain`. The server will serve the Vite build and expose `/sitemap.xml` + `/robots.txt` on that domain.

Analytics is disabled unless both the browser consent is accepted and the corresponding `VITE_*` ID exists at client build time.
