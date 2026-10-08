# Phase 97: managed hosting configuration (Render / Railway / equivalent)

**NOT deployed**. Adapt these requirements to whichever provider is selected; do not assume product availability/pricing or provider-specific commands.

1. Use Node.js 24 and a persistent managed PostgreSQL instance. Create isolated staging and production databases and users; assign least privilege. Never paste the DATABASE_URL into client Vite variables.
2. Set build command `npm ci && npm run db:generate && npm run typecheck && npm run build`. Check the platform's workspace and generated Prisma binary/system-library compatibility. Do not run migrations in the public build step.
3. Use start command `npm run start:production` or the independently validated server workspace production entrypoint. Verify the web static build is served either by your server or a separate static-web service before declaring success.
4. Add production configuration only as protected secrets: `DATABASE_URL`, `JWT_SECRET`, payment credentials, email transport, `PUBLIC_SITE_URL`, `ALLOWED_ORIGINS`, and release identity. Use `launch:env` and `candidate:target` from a trusted operator machine; never expose these values as logs.
5. Configure persistent uploads or object storage. A deployment restart must preserve files; `server/uploads` may require a volume or object-storage adapter.
6. Configure HTTPS, custom domain, DNS, safe CORS origins, reverse proxy forwarding and appropriate app trust-proxy settings. Do not use wildcard CORS.
7. Ensure background jobs/cron execution are singleton or idempotent: do not allow two independent instances to execute non-coordinated jobs blindly.
8. Create backups with validated retention, off-platform copies, an isolated restore drill, and explicit owner for RPO/RTO.
9. Verify Razorpay sandbox webhooks use a publicly reachable HTTPS callback with authentic signatures; live secret/callback configuration comes only after staging sign-off.
10. Verify email, SMS and other messaging integrations with permitted test accounts. Confirm platform outbound network rules and webhook retry behaviour.
11. Check database pools/connection limits, app instance autoscaling and host health. Ensure `DIRECT_URL` and `DATABASE_URL` refer to the same logical database or explicitly review pooling differences; target guard blocks drift by default.
12. Run all Phase 97 UAT gates and record evidence against one immutable source revision; manually trigger migration only after a verified backup and successful build.
