# Phase 92 deployment

Stop the development server, extract the contents of this Phase 92 folder over the Riseora ecommerce project root, then run:

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

npm run verify:phase92
npm run security:audit
npm run dev
```

Expected migration head:

`20261008043000_phase92_manufacturing_bom_production_traceability_v2`

Expected migration count in the user's full project after Phase 92: **45**.

Important production boundary: completing a production order creates a physical finished batch on Phase 91 QA hold. It must not increase customer-sellable finished stock until QA releases that batch.
