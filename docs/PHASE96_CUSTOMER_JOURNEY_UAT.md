# Phase 96 — end-to-end customer journey acceptance

Use two dedicated customer accounts plus an admin account; use separate test SKUs, addresses and production-safe gateway sandbox/test arrangements. Never send test refunds or recalls against live buyers.

| ID | Workflow | Expected evidence / pass condition |
|---|---|---|
| UAT-01 | Register and verify account | No duplicate users, correct session/cookie handling |
| UAT-02 | Wrong password/rate limiting | No account enumeration, throttling/lockout |
| UAT-03 | Forgot/reset password | One-time token, expiry, old token invalidated |
| UAT-04 | Admin role versus customer | Customer cannot call admin endpoints |
| UAT-05 | Search/filters and no-results rescue | Correct catalog visibility and stable navigation |
| UAT-06 | Product gallery and variants | Product images load; inactive/raw/spares hidden |
| UAT-07 | Cart saved-for-later + reload | Correct persisted quantities and no checkout leakage |
| UAT-08 | Address and pincode serviceability | Delivery restriction enforced server-side |
| UAT-09 | COD eligibility and fees | Total matches item/fee/discount ledger |
| UAT-10 | Gateway order initiation | One payment/order pair, tamper-proof amounts |
| UAT-11 | Payment confirmed via provider | Only verified paid orders advance |
| UAT-12 | Duplicate webhook/payment retry | Idempotent outcome, no double stock reserve |
| UAT-13 | Abandoned/failed payment | No false paid order; inventory released safely |
| UAT-14 | Coupon limits and account ownership | Coupon cannot be used by another account |
| UAT-15 | Reward points | No double earn/redeem; refund reversal correct |
| UAT-16 | Invoice and GST | Customer totals and financial document agree |
| UAT-17 | Fulfilment / courier handoff | Integrity/readiness gates pass before SHIPPED |
| UAT-18 | Batch-traced shipment | FEFO valid QA release, batch lineage committed |
| UAT-19 | Customer delivery | DELIVERED evidence, tracking, COD reconciliation |
| UAT-20 | Cancellation before shipment | Stock reserved release once only |
| UAT-21 | RTO event and return | Physical RTO evidence before restock/refund |
| UAT-22 | Return with product damage | Inspection required, damaged units not sellable |
| UAT-23 | Refund to payment provider | Reference stored; amounts and taxes reconciled |
| UAT-24 | Replacement | Stock/safety and tracking constraints enforced |
| UAT-25 | Support ticket and internal note | Customer sees replies, never internal notes |
| UAT-26 | Retention campaign | Holdout no benefit, consent and fatigue respected |
| UAT-27 | Supplier GRN to QA | New physical stock blocked until QA release |
| UAT-28 | Manufacturing to QA | Material issue, completion and QA hold validated |
| UAT-29 | Recall | Active recalled batch cannot ship |
| UAT-30 | Mobile Safari/Chrome/Firefox | Checkout, OTP, navigation, images and scroll all usable |

For every case record tester, date, order/reference (test only), expected, observed, screenshot/log evidence and PASS/FAIL. Treat any P0 or P1 failure as launch-blocking. Do not declare overall PASS merely because build/typecheck succeeds.
