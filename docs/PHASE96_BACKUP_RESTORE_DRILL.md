# Verified PostgreSQL backup/restore drill (non-destructive)

A backup file existing is **not** proof it can be restored. Phase 96 requires a separate, isolated restore test before go-live.

1. Confirm `db:backup` reports PostgreSQL `pg_dump`/`pg_restore` and a verified non-empty dump with a SHA-256 value.
2. Record the dump's filename, creation UTC time, size, SHA, source database and responsible operator.
3. Create a **new isolated database** such as `riseora_restore_drill_20261008` on a staging PostgreSQL instance. Never target `riseora_ecommerce_dev`, `riseora_ecommerce_production`, or your live customer database for a drill.
4. Example outline (set host/user/database yourself; **do not put passwords in command arguments**):
```powershell
$env:PGPASSWORD = Read-Host "Restore drill DB password"
pg_restore --list "C:\path\to\backup.dump" | Select-Object -First 10
createdb -h 127.0.0.1 -U restore_operator riseora_restore_drill_20261008
pg_restore -h 127.0.0.1 -U restore_operator -d riseora_restore_drill_20261008 --no-owner --no-acl "C:\path\to\backup.dump"
Remove-Item Env:PGPASSWORD
```
5. Validate table count, `_prisma_migrations` head, `Order`, `Payment`, `ProductVariant`, `InventoryBatch`, `InventoryMovement`, `GoodsReceipt`, `ProductionOrder` counts where present, and critical integrity checks. Never manually edit production.
6. Confirm the isolated application can read required data without exposing customer information publicly.
7. Destroy the isolated database **only after recording evidence and approval**; keep the original verified backup according to retention policy.

### Restore readiness requirements
- File readable and checksum stable, restore exit code 0.
- Schema and migration head consistent.
- Foreign-key constraints valid; count/totals sampled.
- Recovery time (RTO) and maximum acceptable data loss (RPO) documented and approved.
- All backups encrypted and access-controlled. Database dumps contain customer PII and must not be uploaded to public issue trackers/chats.

A disaster restore that rewinds production may lose post-backup real transactions; inventory, payment gateway and shipping provider reconciliation is mandatory before traffic returns.
