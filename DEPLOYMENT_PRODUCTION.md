# Phase 91 deployment

Stop the development server, extract the contents of this Phase 91 folder over the Riseora ecommerce project root, then run:

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

npm run verify:phase91
npm run security:audit
npm run dev
```

Expected migration head:

`20261008023000_phase91_quality_assurance_supplier_compliance_v2`

Expected migration count: 44.
