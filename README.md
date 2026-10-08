# Riseora Ecommerce Phase 94

Cumulative overlay through **Phase 94 — Shop-Floor Execution, Downtime & OEE Control V2**.

Phase 94 repairs the Phase 93 Prisma `ManufacturingBom.warehouseId` index regression and the historical Phase 71 migration-head audit regression, then adds executable routed shop-floor operations, downtime capture, labour costing, OEE, work-center shifts, schedule adherence and a strict Phase 92 production-completion gate.

Inventory ownership remains unchanged: Phase 92 controls manufacturing material/output, Phase 90 controls warehouse batches and Phase 91 controls finished-goods commercial QA release.

See `PHASE_94_RELEASE.md` and `PHASE_94_VERIFICATION.txt`.
