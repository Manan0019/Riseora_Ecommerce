# Phase 93 deployment

Stop the development server, extract the contents of this Phase 93 folder over the Riseora ecommerce project root, then run:

```powershell
cd "D:\Manan\Website\Riseora Herbals\riseora_ecommerce"

npm install
npm run deps:repair
npm run dependency-security:doctor
npm run security:audit

npm run db:backup
npm run db:deploy
npm run db:generate
npm run db:status
npm run db:doctor

npm run mrp-capacity:doctor
npm run manufacturing:doctor
npm run quality-assurance:doctor
npm run warehouse-control:doctor
npm run procurement:doctor
npm run demand-intelligence:doctor
npm run growth-attribution:doctor
npm run retention-growth:doctor
npm run release-chain:doctor
npm run service-recovery:doctor
npm run support-operations:doctor
npm run returns-resolution:doctor

npm run verify:phase93
npm run security:audit
```

Expected migration count in the full project after Phase 93: **46**.

Expected migration head:
`20261008063000_phase93_mrp_scheduling_capacity_v2`

Then start development:

```powershell
npm run dev
```

Do not treat MRP approval, PO-draft generation, production-draft generation or schedule publication as inventory receipts/issues. Phase 89/91/92 execution boundaries remain authoritative.
