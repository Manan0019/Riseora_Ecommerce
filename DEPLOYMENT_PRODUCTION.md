# Phase 94 deployment

**Do not reset or roll back the database.** Phase 93 migration `20261008063000_phase93_mrp_scheduling_capacity_v2` already applied successfully; Phase 94 fixes the Prisma schema contract forward and adds one new additive migration.

Stop the development server, extract the contents of this Phase 94 folder over the Riseora ecommerce project root, then run:

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

npm run cart-intent:doctor
npm run shop-floor:doctor
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

npm run verify:phase94
npm run security:audit
```

Expected full-project migration count after Phase 94: **47**.

Expected migration head:
`20261008083000_phase94_shopfloor_execution_oee_v2`

`npm run db:generate` and `npm run db:doctor` should no longer report the Phase 93 `ManufacturingBom.warehouseId` P1012 error. `npm run cart-intent:doctor` should accept the current migration head.

Then start development:

```powershell
npm run dev
```
