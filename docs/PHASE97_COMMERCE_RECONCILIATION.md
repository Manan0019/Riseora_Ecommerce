# Phase 97 — Live commerce integrity signals

Admin → Fulfilment → Phase 97 is a **read-only aggregate report**. The database remains authoritative. Signals use controlled SQL with bounded single COUNT aggregates (no customer names, phone numbers, shipping addresses, coupon tokens or provider IDs returned). Each query exception is a blocker rather than a false zero.

| Signal | Severity when nonzero | What to do |
|---|---|---|
| ORDER_NEGATIVE_MONEY | BLOCK | Review immutable order totals, discount and shipping fee calculations |
| ORDER_ITEMS_INVALID | BLOCK | Investigate zero/negative quantity, prices and line discounts |
| PAYMENT_DUPLICATE_PROVIDER_ID | BLOCK | Reconcile signed provider events and payment idempotency |
| ONLINE_DISPATCH_UNPAID | BLOCK | Stop online dispatch until gateway and order state agree |
| CAPTURED_PAYMENT_NO_PROVIDER | BLOCK | Check authoritative provider capture rather than browser callbacks |
| PAYMENT_OVERREFUND | BLOCK | Inspect refunds, settlement and retry paths |
| SHIPMENT_CHRONOLOGY | BLOCK | Correct courier event history using audited path, not direct SQL |
| SHIPPED_WITHOUT_SHIPMENT_EVIDENCE | REVIEW | Some legacy shipments may lack history; confirm current code is safe |
| BATCH_IMPOSSIBLE_QUANTITIES | BLOCK | Stop stock mutation while warehouse is reconciled |
| EXPIRED_STOCK_SELLABLE | BLOCK | Expiry hold/quarantine and aggregate reconciliation |
| RECALLED_STOCK_SELLABLE | BLOCK | Isolate recall batches immediately and inspect outstanding reservations |
| QA_PENDING_STOCK_SELLABLE | BLOCK | Review QA release and GRN/manufacturing source |
| AGGREGATE_BATCH_DRIFT | REVIEW | Distinguish legacy data differences from true available-stock mismatch |

**Never auto-repair financial, order or physical-stock inconsistencies** based on a dashboard count. Every repair needs independently verified evidence and an auditable business operation. A REVIEW is not automatically GO; document resolution in the 32-gate owner acceptance record. A PASS indicates only that the specific SELECT query found no violation at that instant.

## Validation caveats

- This does not inspect payment gateway's external ledger, payment webhook signatures, double charge risk under real concurrency, or unknown legacy order-processing code. Those require provider sandbox reconciliation.
- Batch/variant drift is marked REVIEW because legacy Phase 90 migrations and reservation transitions may need manual baseline reconciliation; do not silently rewrite `stockQuantity`.
- Incomplete or inaccessible schemas fail closed, and this report is available only through authenticated admin middleware with `Cache-Control: no-store`.
- Checks do not include PII or produce CSV of individual at-risk orders. Drill down using existing protected order/payment/warehouse tools on a restricted account.
