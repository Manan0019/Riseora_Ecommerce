# Phase 97 — Isolated database/asset restoration rehearsal

A backup archive header and `pg_restore --list` is **not proof of restore**. The Phase 97 `candidate:backup-inspect` command only validates archive integrity, size and checksum; it cannot claim that schema and order/payment/stock contents restore successfully.

## Read-only archive inspection

```powershell
npm run candidate:backup-inspect -- --file="D:\backup\riseora-verified.dump" --sha256=EXPECTED_SHA256
```

If `pg_restore.exe` is not on PATH, supply its path using `--pg-restore=...` for list validation; this still does not restore anything.

## Isolated restore requirements

1. Create a **new empty staging-only PostgreSQL database** with isolated credentials. Explicitly compare its normalized host/database identity against production and development. Never choose the source production database as a target.
2. Restore only a trusted verified custom-format dump under a DBA's control. Do not run a chat-supplied destructive command without verifying every flag and database name. Use `pg_restore --list` before restore.
3. Compare schema/migration head and approximate table/row counts of Order, OrderItem, Payment, InventoryBatch, ProductVariant, InventoryMovement, PurchaseOrder, GoodsReceipt and supplier/customer data. Reconcile key financial totals with decimals, not floats.
4. Start a staging app using the restored DB with **payment/email/SMS/webhook outbound actions disabled or sandboxed**. Avoid sending real customer communications or reprocessing jobs against production provider accounts.
5. Check read-only Phase 96 and Phase 97 integrity dashboards and representative historical orders; ensure lookup and tracing work.
6. Verify file uploads/assets from their separately backed-up persistent volume or object store, not merely the DB dump.
7. Record time-to-restore, RPO/RTO observed, dump SHA256, applied migration head, operator/owner, data checks, and evidence. Destroy the isolated restored DB only with explicit local owner approval after evidence is saved.

**Critical:** a restore during live operations can lose orders, payments, refunds and stock movements created after the backup. Freeze writes, capture external gateway activity and obtain owner approval before any real production restore.
