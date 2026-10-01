RISEORA E-COMMERCE - PHASE 24
Production Release & Deployment Readiness

COPY/PASTE:
1. Copy every file/folder from this package into the current Riseora Ecommerce root.
2. Merge folders and replace matching files.
3. DO NOT replace or delete server\.env.
4. Run PHASE24_APPLY.bat.

AFTER PHASE24_APPLY PASSES:
- Open Admin -> System and confirm the page loads.
- For production, run PREPARE_PRODUCTION_ENV.bat, fill real values, then PHASE24_VERIFY_PRODUCTION.bat.
- PRODUCTION_DEPLOY.bat creates a backup BEFORE production migration/build.

IMPORTANT:
- Restore is CLI-only and requires typing RESTORE.
- No automatic database wipe/reset is included.
- Runtime PASS requires the Windows scripts to complete successfully on your machine.

Full guide: PHASE24_PRODUCTION_RELEASE.md
