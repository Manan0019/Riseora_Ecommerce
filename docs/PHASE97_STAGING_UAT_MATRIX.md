# Phase 97 — 66 staging and deployment acceptance scenarios

Use a dedicated staging database, merchant sandbox, test accounts and test notifications. **Never** run these mutation scenarios against live customer data without separate written authorization. The checklists below are instructions, not executed test evidence. Mark individual runs with environment, operator, source commit, actual/expected result, UTC time and screenshots/log references.

## Authentication / accounts

| ID | Test | Required evidence / assertion |
|---|---|---|
| A01 | New customer account | Register a staging customer, verify validation and account ownership |
| A02 | Duplicate identity rejection | Register existing email/phone and verify duplicates cannot overwrite records |
| A03 | Incorrect login / rate controls | Repeated incorrect password attempts cannot create a session |
| A04 | Reset token security | Expired or reused reset tokens are rejected |
| A05 | Session revocation | Log out and confirm old session cannot use protected API |
| A06 | Admin access denial | Anonymous/customer account receives 401/403 for admin API |
| A07 | User data isolation | Two customers cannot view each other’s addresses, orders or returns |
| A08 | Analytics consent | Reject analytics consent and confirm no nonessential analytics are sent |

## Catalog / inventory / merchandising

| ID | Test | Required evidence / assertion |
|---|---|---|
| C01 | Product and variant visibility | Active sellable finished goods visible on shop and detail pages |
| C02 | Hidden manufacturing SKU | Active raw materials, spares and packaging remain hidden from shop |
| C03 | Pricing and GST | Cart sums match product/variant price, tax and configured shipping policy |
| C04 | Out-of-stock protection | Checkout cannot order more than sellable minus safety stock |
| C05 | Expiry / recall | Expired/recalled/QA-held batches excluded from FEFO and public available stock |
| C06 | Product media persistence | Image uploads and product thumbnails survive app restart |
| C07 | Search and suggestions | Search, no-results rescue, related products and product recommendations work |
| C08 | Coupon guard | Invalid/expired/exhausted coupons are rejected without changing total |

## Cart / address / checkout

| ID | Test | Required evidence / assertion |
|---|---|---|
| K01 | Guest to login cart | Guest bag persists or merges according to defined policy |
| K02 | Saved-for-later isolation | Saved-for-later lines never enter checkout order payload |
| K03 | Concurrent cart version | Conflict from two browser tabs does not silently overwrite bag |
| K04 | Address PIN coverage | Serviceability, state/GST and delivery promise use a valid test PIN |
| K05 | Invalid address | Missing phone/address/invalid PIN blocked before order persistence |
| K06 | Checkout idempotency | Replaying same request key returns one order and one reservation |
| K07 | Failed checkout no stock leak | Client failure before order confirmation leaves no double reservation |
| K08 | COD restrictions | COD permitted only in allowed service areas/order amounts |

## Online payment / finance

| ID | Test | Required evidence / assertion |
|---|---|---|
| P01 | Gateway sandbox payment | Successful sandbox payment follows gateway verified capture, not client claim |
| P02 | Invalid signature | Forged webhook/signature cannot mark order PAID |
| P03 | Duplicate webhook | Repeated legitimate event does not double credit, inventory or reward |
| P04 | Out-of-order webhook | Older payment event cannot undo a valid newer terminal state |
| P05 | Failed payment | Declined/aborted gateway leaves order unpaid and recoverable |
| P06 | Payment timeout | Browser timeout and provider success reconcile without duplicate charge |
| P07 | Refund full | Approved full refund records provider ref and never exceeds original amount |
| P08 | Refund partial | Partial refund and retry never double-refund or exceed payment |
| P09 | COD collection | Collection evidence is distinguishable from online provider settlement |
| P10 | Coupon+shipping+GST | Amounts charged and payment ledger equal immutable order totals |

## Fulfilment / returns / care

| ID | Test | Required evidence / assertion |
|---|---|---|
| F01 | Dispatch safety | Processing to shipped requires courier/tracking and inventory evidence |
| F02 | Shipping/ETA | Carrier tracking events retain chronology and customer-visible updates |
| F03 | Double tracking prevention | Duplicate tracking ID on incompatible shipment is blocked |
| F04 | Cancellation release | Releasing reservation cannot make recalled or expired goods sellable |
| F05 | RTO handoff | RTO parcel physically returned before appropriate sellable restock |
| F06 | Return inspection | Only inspected sellable returns can restock |
| F07 | Refund timing | Refund waits for eligible return/RTO evidence and respects settlement |
| F08 | Support SLA | Customer/support messages, assignment and customer notification work |
| F09 | Invoice/credit note | Fiscal documents show correct tax/discount/refund history |
| F10 | Transactional email | Order/payment/dispatch/return communications render and deliver to test addresses |

## Supplier / manufacturing / QA

| ID | Test | Required evidence / assertion |
|---|---|---|
| M01 | Supplier sourcing | HOLD suppliers not chosen by procurement PO planner |
| M02 | GRN idempotency | Repeated receipt key posts accepted stock once |
| M03 | Inbound QA hold | New accepted GRN batch remains blocked until QA released |
| M04 | Failed COA requirement | Missing required certificate blocks QA release |
| M05 | FEFO reservation | Earliest valid expiry allocated first for same SKU |
| M06 | Batch recall | Active recall blocks free stock; reserved affected orders cannot ship |
| M07 | Cycle-count stale state | Count cannot post if stock changed after snapshot |
| M08 | BOM+MRP | Demand produces correct MAKE/BUY without modifying stock on approval |
| M09 | Production reconciliation | Issued=consumed+waste+returned before finished output QA hold |
| M10 | Shop-floor dispatch | Routing steps executed sequentially, downtime and labour accounted |
| M11 | Maintenance hold | Broken equipment blocks operation resume until maintenance release |
| M12 | End-to-end lot genealogy | Customer shipped lot traces back to manufactured/raw supplier batches |

## Deployment / security / recovery

| ID | Test | Required evidence / assertion |
|---|---|---|
| D01 | Prisma/schema/build | Prisma validates and generates, full server/client build and bundle budget pass |
| D02 | Security audit | Zero unapproved high/critical runtime dependencies; pin and lock evidence |
| D03 | Secret isolation | No JWT, DB password or live payment secret in client JS or public endpoints |
| D04 | Data target lock | Staging and prod DB fingerprints distinct from dev, pin confirmed |
| D05 | Restorable PostgreSQL dump | Isolated restore drill reconciles schema, rows, critical money invariants |
| D06 | Persistent uploads | Product media survive restart, redeploy and host instance replacement |
| D07 | HTTPS/CORS | TLS, HSTS, exact CORS, no public admin/DB/metrics access |
| D08 | Public API contract | Readiness/live/release GET are JSON; anonymous admin is 401/403 |
| D09 | Latency baseline | Bounded readiness sampling p95/failures inside approved limit |
| D10 | Rollback decision | Simulated failed release with owner decision and no blind downgrade |
| D11 | Cutover monitoring | Logs/alerts for availability, gateway webhook, stock, disk and backups |
| D12 | Postdeploy verification | Actual new release hash matches deployed release identity and smoke evidence |

## Launch rule

Any failed P0 auth, money, refund, inventory, QA, recall, privacy, migration, restore or TLS scenario is an immediate NO_GO until resolved and retested. A completed checklist without test artifacts or owner approval is NOT evidence. Phase 97 electronic sign-off is in `docs/PHASE97_CUTOVER_ACCEPTANCE.json`.
