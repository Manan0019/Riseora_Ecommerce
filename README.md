# Riseora Ecommerce Phase 93

Cumulative overlay through **Phase 93 — MRP, Production Scheduling & Capacity Control V2**.

Phase 93 converts approved Phase 88 demand into warehouse-specific MRP, nets released stock/safety/open production/open supplier supply, explodes active Phase 92 BOMs, separates MAKE and BUY requirements, converts those requirements into Phase 92 production drafts and Phase 89 supplier PO drafts, and builds finite work-center schedules using warehouse-scoped routings, operation times, efficiency and daily capacity.

Planning and schedule publication do not mutate inventory. Material issue/production remains Phase 92 controlled, purchased receipt/QA remains Phase 89/91 controlled, and finished-goods sellable release remains Phase 91 controlled.

See `PHASE_93_RELEASE.md` and `PHASE_93_VERIFICATION.txt`.
