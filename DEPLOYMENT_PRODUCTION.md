# Production deployment — Phase 95

1. Stop the development/production process.
2. Back up PostgreSQL before deploying migrations.
3. Overlay Phase 95 files onto the existing project.
4. Run `npm install` and `npm run deps:repair`.
5. Run `npm run dependency-security:doctor` and `npm run security:audit`.
6. Run `npm run db:backup`, then `npm run db:deploy`, `npm run db:generate`, `npm run db:status`, and `npm run db:doctor`.
7. Run `npm run maintenance:doctor` and `npm run verify:phase95`.
8. Run the final `npm run security:audit`.
9. Start the application and execute the Phase 95 runtime tests from `PHASE_95_VERIFICATION.txt`.

Expected migration count: **48**.
Expected head: `20261008094000_phase95_maintenance_reliability_spares_v2`.

Do not use `prisma migrate reset`, destructive DB reset commands, or manual stock edits as part of this deployment.
