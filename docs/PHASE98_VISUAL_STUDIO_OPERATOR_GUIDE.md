# Riseora E-commerce — Phase 98: Premium Customer Experience & Visual Studio MEGA V2

## Purpose
Production-grade customer storefront look-and-feel and administrator-owned content editing, without replacing the existing home route or touching financial/order/warehouse stock logic. Phase 98 is cumulative on Phase 97. It also fixes BOTH confirmed Phase 97 terminal blockers (Prisma P1012 relation errors, Windows phase95 maintenance auditor URL-path bug).

## Terminal blockers fixed
1. `ManufacturingBom.maintenanceSpareUsages` was an invalid relation with no matching field on `MaintenanceSpareUsage`; it has been deleted from that wrong model. Its legitimate `ProductVariant.maintenanceSpareUsages` relation remains.
2. `ProductionOrder.routingOperations` had no matching relation on `ProductionRoutingOperation`; the incorrect field is removed. The valid `ProductionRouting.routingOperations` link is preserved. The real `ProductionOrder.operationExecutions` link is preserved.
3. Phase95 maintenance auditor was using `new URL(..).pathname` with Windows drives and `%20` escaping, producing `D:\D:\...Riseora%20Herbals`; it now uses `fileURLToPath(import.meta.url)`.
4. Phase94/95/96 verification chain supports Phase98 as the latest, while retaining historical gates.
5. A new complete Prisma relation-graph static audit prevents orphan typed relations from passing source-only checks. This complements rather than replaces Prisma CLI validation.

## Visual experience
- Premium cinematic hero and editorial split sections, brand storytelling, featured category/product-link cards, features, curated product shelves, image galleries, testimonials, FAQ, animated marquee, newsletter/account invite and campaign countdown (12 section kinds).
- Brand presets: sage, gold, terracotta, rose, midnight; typography editorial/modern/classic; corner profiles, density and adjustable off/subtle/immersive motion.
- Scroll reveal using IntersectionObserver, cinematic typography, soft floating/orb animations, image hover transitions, marquee and staggered tiles. Reduced-motion users see non-animated content.
- Mobile image override, image alt text, lazy images, mobile responsive card layouts and focus-visible states.
- Existing Shop/product/cart site surfaces receive safe premium visual refinements without touching their business logic.

## Administrator control
Open `Admin → Fulfilment → Phase98 Premium Visual Studio → Open Visual Studio`.
- Edit content per section: titles, eyebrow, descriptions, CTAs/links, desktop/mobile images, image ALT, alignment, backgrounds, dimensions, animation.
- Create/duplicate/remove/reorder/hide sections and create unlimited designs within the server cap (35 sections / 18 cards per section).
- Existing banner/media image-picker and link to existing uploaded assets. Upload binary media through the established site CMS/Media facility, then select its URL; Phase98 does NOT replace the security-validated upload server.
- Desktop/mobile preview of draft; save draft separately; publish explicitly; revision conflict detection; immutable publication history; restore any historic publication **to a draft**, then publish separately.
- Configure storewide brand identity/logo/tagline/announcements/social links/SEO via existing protected settings API; editing policies, price, inventory, coupons and payments remains in dedicated existing admin modules.
- Export draft configuration to a local JSON backup.
- Published homepage title/description metadata applied at runtime; original global SEO remains intact outside homepage.

## Publish safety
- Until first publish, the existing customer homepage stays unchanged. Server public GET returns only validated published content, no draft or editor identities.
- Editor API is under existing `requireAuth + requireAdmin`; public GET `/api/admin/experience/published` is registered before admin authorization inside the admin router. Verify actual mount prefix on Windows/staging.
- Whitelisted display types/palettes and strict zod payloads. No arbitrary HTML, script embed, user CSS, unsafe protocols or browser code execution.
- Staged publication uses `revision` compare-and-swap, a transaction and append-only publication snapshots.
- Homepage integration uses `scripts/phase98-home-mount.mjs` to safely insert a component into the existing `client/src/pages/Home.jsx` via the installed TypeScript parser; it writes an original-file backup and refuses unrecognizable source. Idempotent; no replacement of Home.jsx shipped in the overlay.

## New schema / migration
`20261008113000_phase98_visual_storefront_studio_v2` is additive (expected migration #49 after Phase95's #48):
- StorefrontExperience: draft JSON / published JSON / independent revision and publishedRevision / admin actor IDs and time.
- StorefrontExperiencePublication: immutable versioned snapshot and actor/timestamp.
No change to stock, orders, payments, returns or existing migrations.

## Install
1. Stop dev server. Copy **contents of the enclosed Phase98 folder** over full Windows project at `D:\Manan\Website\Riseora Herbals\riseora_ecommerce`.
2. Run from project root:
```
npm install
npm run deps:repair
npm run experience:mount
npm run experience:mount:check
npm run experience:doctor
npm run experience:tests
npm run db:generate
npm run db:backup
npm run db:deploy
npm run db:generate
npm run db:status
npm run db:doctor
npm run verify:phase98
npm run security:audit
npm run dev
```
3. Expected applied migrations after `db:deploy`: 49, latest `20261008113000_phase98_visual_storefront_studio_v2`.
4. DO NOT run `prisma migrate reset` or delete the existing database. If `db:generate` fails, STOP before `db:deploy` and paste the exact Prisma error.

## Runtime UAT
1. Open homepage before any Phase98 publish: old home should still work, with no new site content automatically shown.
2. Log in as admin; open Fulfilment → Visual Studio. Verify desktop/mobile instant preview.
3. Create a hero banner with real desktop/mobile images from existing banner library. Create additional collection, FAQ, gallery and story sections. Edit links, typography, palette and motion.
4. Save draft; public homepage must remain unchanged. Confirm anonymous `GET /api/admin/experience/published` returns `document: null` until publication.
5. Publish the saved draft. Verify public homepage renders the new design with working CTA links; no draft data/identity should be in the response. Cache may last ~30 seconds.
6. Try publishing stale revisions in a second browser session: expect HTTP 409 `STUDIO_REVISION_CONFLICT`.
7. Check History → Restore as draft: published homepage must NOT change. Explicitly publish to change live version.
8. Open phone and test 320–390px viewport; verify keyboard navigation, reduced-motion mode, image alt, FAQ, no layout overflow.
9. Verify products/cart/checkout/stock operations remain unchanged.
10. Test `/admin/experience/published` is public and draft routes return unauthorized for guests (correct actual API prefix `/api/admin/...` depending dev proxy).

## Verification evidence/limits
Isolated source audits, parser-level TypeScript/JSX transpilation, Schema/index and reciprocal relation graph, Windows-path-maintenance doctor, homepage mount fixtures (9/9 executable unit tests), and retained Phase79–95 audits have passed in the packaging environment. A cumulative overlay alone contains 14 migration folders, while the user's full checkout contains 48 prior migrations; thus overlay-only `candidate:migrations` correctly FAILS and must pass against the full checkout. Full Prisma CLI generation, runtime server/client typecheck and builds, security audit, database migration and browser tests **must be run on Windows**. Do not infer LIVE GO from this source-level release.

## Next
Treat Phase98 as a major frontend/UI milestone. The next priority is collecting `verify:phase98` output, resolving any full checkout errors, evaluating the live customer experience and finishing staging/payments/backup sign-offs rather than adding another large operations module.
