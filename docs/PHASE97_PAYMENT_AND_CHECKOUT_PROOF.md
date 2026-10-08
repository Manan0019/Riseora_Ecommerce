# Phase 97 — Payment, checkout and refund launch-proof procedure

**All checkout mutations below require an isolated staging DB, authorized sandbox payment merchant and dedicated test identity. Never use real customer card/UPI credentials here.** Preserve gateway event IDs and signed event envelopes in protected internal evidence, not in the public issue tracker/chat.

## End-to-end success

1. Capture product SKU/price/GST/safety-stock and `InventoryBatch` free quantity before checkout.
2. Submit checkout using a unique idempotency/request key. Re-submit the same request after simulated network timeout; verify ONE immutable order, ONE payment intent and no double reservation.
3. Complete sandbox payment with provider-approved test method. Confirm `PAID` is set only from verified server/provider evidence, and order total equals payment total exactly.
4. Deliver webhook twice; ensure the second delivery is handled as an already-seen event with no duplicated inventory/reward/coupon side effects.
5. Dispatch and fulfill; inspect batch allocation lineage, courier event chronology, customer notification, invoice total and gateway settlement reference.

## Negative and adversarial scenarios

- Tamper with payment amount or provider ID in browser callback; reject mismatch without changing payment/order.
- Send invalid signature; reject. Reorder webhook sequence so failed/cancelled arrives after paid and confirm paid order is not incorrectly reversed.
- Payment timeout with eventual successful capture; reconcile existing payment instead of creating new customer charge.
- Force gateway failure, user abandonment and duplicate tab submission; no stock leakage or over-ordering.
- Refund full amount, partial then remaining, and retry the same refund ID. Never exceed captured amount or issue duplicate provider refund.
- COD order in a non-COD zone; reject and do not fall back to COD silently. Confirm COD collections never masquerade as provider-verified online payments.
- Coupon exhaustion, expired codes, rewards overspend and automatic promotion edge cases must never produce a negative total.

## Before gateway LIVE keys

Record staging merchant configuration identity, callback URL, event signature verification and replay test logs, test SKU/order keys, stock/money before and after, refund reconciliation, approval owner and timestamp. Keep real secret values out of evidence. Disable live traffic until failure cases and manual accounting reconciliation pass.
