# Phase 96 — production cutover, go/no-go and recovery

## Objective
Ship one validated artifact to one production environment, maintain a tested rollback route, and keep customer order/payment/stock integrity authoritative. **Never** treat a static audit or a successful migration as proof the business is ready to go live.

## Freeze and change control
1. Agree on the release commit/package SHA, owner, maintenance window, production hostname and DB name. Stop feature changes during cutover.
2. Set and validate `server/.env.production`. Never place secrets in ZIP, chat, Git or release evidence.
3. Verify DNS, TLS certificate, public URL, upload storage, persistent data volume, email transport and payment-provider webhooks.
4. Confirm PostgreSQL backups and an **isolated successful restore drill**. Name on-call owner and a rollback decision maker.
5. Freeze public/marketing campaigns until payment and inventory UAT passes.

## Non-destructive planning
```powershell
npm run launch:plan
npm run launch:tests
npm run launch:schema
npm run launch:doctor
npm run dependency-security:doctor
npm run security:audit
```
`launch:plan` must NEVER modify the database. `launch:doctor` is static/local and does not establish runtime PASS.

## Stage build and test (must precede migration)
```powershell
npm run db:generate
npm run typecheck
npm run build
npm run performance:budget
npm run verify:phase96
```
Capture all output and build identity. Any failure is NO_GO. Do not attempt migration to 'see if it works'.

## Explicit production release
From a trusted operator machine with **approved production env**, run:
```powershell
npm run release:prepare -- --execute --confirm=RISEORA-LIVE
```
The guarded release runs env audit, release doctor, full verification/build, vulnerability audit, source checksum evidence, verified backup, then **only afterward** migration deploy and schema checks. No automatic app restart or blind rollback occurs. Backup and schema health must be checked before rerouting traffic.

## Restart and cutover
1. Restart the server using your chosen process supervisor. Confirm correct env and release version; do not start development `npm run dev` in production.
2. Check `/health/live`, `/health/ready`, and `/release` with:
```powershell
npm run launch:smoke -- --url=https://your-real-domain.example
```
You can supply `--system-prefix=/api/system` if autodetection differs behind the reverse proxy.
3. Open Admin → Fulfilment → Phase 96 Launch Readiness. NO_GO blocks launch; REVIEW requires documented operator approval.
4. Test account/auth, catalog, product page, cart, checkout, payment confirmation, invoice, tracking and support on dedicated test accounts. Only use provider-sanctioned test transactions or explicitly authorized low-value live transactions.
5. Complete `docs/PHASE96_ACCEPTANCE_TEMPLATE.json` with a real owner and evidence for every gate, and run `npm run launch:acceptance`.
6. Announce go-live only after owner approval and 30–60 minutes of observed readiness.

## Rollback decision matrix
**Application-only problem, database unchanged:** redeploy previous verified app artifact.

**Application problem after forward database migration:** first evaluate a forward application fix compatible with the new DB schema. Re-deploying an old app against a migrated DB may break it. Do not blindly downgrade migrations.

**Database corruption/failed migration:** freeze writes/traffic, record incident timeline, take a forensic snapshot, verify the exact backup and perform a controlled restore only with owner authorization and a recovery plan for transactions created after the backup. A restore can lose orders/payments submitted afterward.

**Payment provider outage:** disable online payment safely if supported by settings, keep COD only if operationally authorized, do not claim a payment succeeded before gateway verification.

**Stock/QA/recall discrepancy:** stop affected SKU sales, quarantine where required, reconcile with warehouse ledger. Never adjust physical stock by editing the DB manually.

## First 24 hours
- Monitor readiness, migration state, inventory negatives, reservation counts, payment webhook failures, failed refunds, dispatch SLA, image uploads, email queues and abnormal 4xx/5xx rates.
- Reconcile first 5–10 real orders with payment gateway and warehouse movement evidence.
- Verify a backup occurred **after** cutover and an on-call responder is reachable.
- Roll forward small fixes separately with their own audit rather than bundling untested changes directly in production.
