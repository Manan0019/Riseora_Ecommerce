import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/http";
import AdminDemandIntelligenceCenter from "../../components/AdminDemandIntelligenceCenter";
import AdminProcurementCenter from "../../components/AdminProcurementCenter";
import AdminWarehouseControlCenter from "../../components/AdminWarehouseControlCenter";
import AdminQualityControlCenter from "../../components/AdminQualityControlCenter";
import AdminManufacturingControlCenter from "../../components/AdminManufacturingControlCenter";
import AdminMrpCapacityCenter from "../../components/AdminMrpCapacityCenter";
import AdminShopFloorExecutionCenter from "../../components/AdminShopFloorExecutionCenter";
import AdminMaintenanceReliabilityCenter from "../../components/AdminMaintenanceReliabilityCenter";
import AdminLaunchReadinessCenter from "../../components/AdminLaunchReadinessCenter";
import AdminCommerceSafetyCenter from "../../components/AdminCommerceSafetyCenter";
import AdminVisualStudio from "../../components/AdminVisualStudio";

function relativeDeadline(value) {
  if (!value) return "No SLA";
  const ms = new Date(value).getTime() - Date.now();
  const hours = Math.round(Math.abs(ms) / 36e5);
  if (ms < 0) return `${hours}h overdue`;
  if (hours < 24) return `due in ${hours}h`;
  return `due in ${Math.ceil(hours / 24)}d`;
}

export default function AdminFulfilment() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("attention");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const response = await apiFetch("/admin/fulfilment/overview");
    setData(response.data);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const orders = useMemo(() => {
    const rows = data?.orders || [];
    if (filter === "overdue") return rows.filter((row) => row.overdue);
    if (filter === "due") return rows.filter((row) => row.dueSoon);
    if (filter === "confirmed") return rows.filter((row) => row.status === "CONFIRMED");
    if (filter === "processing") return rows.filter((row) => row.status === "PROCESSING");
    if (filter === "integrity") return rows.filter((row) => row.integrity?.status === "BLOCK" || row.integrity?.status === "REVIEW");
    if (filter === "dispatch") return rows.filter((row) => row.dispatchReadiness?.status === "BLOCK" || row.dispatchReadiness?.status === "REVIEW");
    if (filter === "all") return rows;
    return rows.filter((row) => row.overdue || row.dueSoon || row.cancellationPending || row.integrity?.status === "BLOCK" || row.dispatchReadiness?.status === "BLOCK");
  }, [data, filter]);

  if (!data && !error) return <div className="admin-panel"><div className="skeleton-card tall" /></div>;
  const counts = data?.counts || {};

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">OPERATIONS CONTROL</p><h1>Fulfilment</h1><p>Dispatch SLA, courier preference, shipment exceptions and orders that need attention.</p></div><button type="button" className="button button-secondary" onClick={() => load().catch((e) => setError(e.message))}>Refresh</button></div>
    {error && <p className="alert error">{error}</p>}

    <AdminVisualStudio />
    <AdminLaunchReadinessCenter />
    <AdminCommerceSafetyCenter />
    <AdminMaintenanceReliabilityCenter />
    <AdminShopFloorExecutionCenter />
    <AdminMrpCapacityCenter />
    <AdminManufacturingControlCenter />
    <AdminQualityControlCenter />
    <AdminWarehouseControlCenter />
    <AdminDemandIntelligenceCenter />
    <AdminProcurementCenter />

    <section className="phase44-kpi-grid">
      <button type="button" onClick={() => setFilter("confirmed")}><small>AWAITING PROCESSING</small><strong>{counts.awaiting || 0}</strong><span>Confirmed orders</span></button>
      <button type="button" onClick={() => setFilter("processing")}><small>PROCESSING</small><strong>{counts.processing || 0}</strong><span>Being prepared</span></button>
      <button type="button" className={(counts.overdue || 0) > 0 ? "danger" : ""} onClick={() => setFilter("overdue")}><small>DISPATCH OVERDUE</small><strong>{counts.overdue || 0}</strong><span>Past promised dispatch</span></button>
      <button type="button" onClick={() => setFilter("due")}><small>DUE NEXT 24H</small><strong>{counts.dueSoon || 0}</strong><span>Protect the SLA</span></button>
      <div><small>IN TRANSIT</small><strong>{counts.inTransit || 0}</strong><span>Shipped orders</span></div>
      <div className={(counts.exceptions || 0) > 0 ? "danger" : ""}><small>SHIPMENT EXCEPTIONS</small><strong>{counts.exceptions || 0}</strong><span>Last 14 days</span></div>
      <button type="button" className={(counts.integrityBlocked || 0) > 0 ? "danger" : ""} onClick={() => setFilter("integrity")}><small>INTEGRITY HOLD</small><strong>{counts.integrityBlocked || 0}</strong><span>{counts.integrityReview || 0} review warning(s)</span></button>
      <button type="button" className={(counts.dispatchBlocked || 0) > 0 ? "danger" : ""} onClick={() => setFilter("dispatch")}><small>DISPATCH HOLD</small><strong>{counts.dispatchBlocked || 0}</strong><span>{counts.dispatchReview || 0} readiness review(s)</span></button>
      <div className={(counts.trackingBlocked || 0) > 0 ? "danger" : ""}><small>TRACKING HOLD</small><strong>{counts.trackingBlocked || 0}</strong><span>{counts.trackingReview || 0} review · {counts.trackingStale || 0} stale</span></div>
      <div className={(counts.rtoBlocked || 0) > 0 || (counts.rtoReadyToClose || 0) > 0 || (counts.rtoRefundRequired || 0) > 0 ? "danger" : ""}><small>RTO RECOVERY</small><strong>{(counts.rtoReadyToClose || 0) + (counts.rtoRefundRequired || 0)}</strong><span>{counts.rtoInTransit || 0} returning · {counts.rtoBlocked || 0} blocked</span></div>
    </section>

    {data?.deliveryPromiseHealth && <section className="admin-panel phase73-delivery-health">
      <div className="admin-panel-head"><div><p className="eyebrow">PHASE 73 · DELIVERY PROMISE</p><h2>Pre-checkout delivery health</h2><p>Live configuration coverage plus rolling Cart delivery-preview signals. Customer PIN codes and cart contents are not retained in these counters.</p></div><span className={`phase73-strict-chip ${data.deliveryPromiseHealth.strictServiceability ? "strict" : "fallback"}`}>{data.deliveryPromiseHealth.strictServiceability ? "STRICT ZONES" : "FALLBACK ENABLED"}</span></div>
      <div className="phase73-delivery-health-grid">
        <article><small>ACTIVE ZONES</small><strong>{data.deliveryPromiseHealth.activeZones ?? 0}</strong><span>{data.deliveryPromiseHealth.configuredPostalPrefixes ?? 0} PIN prefixes</span></article>
        <article><small>ACTIVE COURIERS</small><strong>{data.deliveryPromiseHealth.activePartners ?? 0}</strong><span>{data.deliveryPromiseHealth.zonesWithPreferredPartner ?? 0} zones with preferred courier</span></article>
        <article><small>PREVIEWS · 60M</small><strong>{data.deliveryPromiseHealth.engagement?.previewChecks ?? 0}</strong><span>Cart delivery checks</span></article>
        <article><small>SERVICEABLE · 60M</small><strong>{data.deliveryPromiseHealth.engagement?.serviceableRatePercent ?? 0}%</strong><span>{data.deliveryPromiseHealth.engagement?.serviceablePreviews ?? 0} previews ready</span></article>
        <article><small>COD BLOCKED · 60M</small><strong>{data.deliveryPromiseHealth.engagement?.codBlockedPreviews ?? 0}</strong><span>Online checkout may still be available</span></article>
        <article><small>FALLBACK QUOTES · 60M</small><strong>{data.deliveryPromiseHealth.engagement?.fallbackPreviews ?? 0}</strong><span>{data.deliveryPromiseHealth.strictServiceability ? "Unmatched PINs are blocked" : "Store-wide rules used"}</span></article>
        <article><small>WEIGHT BLOCKS · 60M</small><strong>{data.deliveryPromiseHealth.engagement?.weightBlockedPreviews ?? 0}</strong><span>{data.deliveryPromiseHealth.zonesWithWeightLimit ?? 0} zones have parcel caps</span></article>
        <article><small>PREPAID-ONLY ZONES</small><strong>{data.deliveryPromiseHealth.prepaidOnlyZones ?? 0}</strong><span>COD intentionally disabled</span></article>
      </div>
    </section>}

    {data?.addressReadinessHealth && <section className="admin-panel phase75-address-health">
      <div className="admin-panel-head"><div><p className="eyebrow">PHASE 75 · ADDRESS QUALITY</p><h2>Saved-address & checkout readiness</h2><p>Saved-address hygiene plus rolling checkout address checks. The telemetry is aggregate only and does not retain customer names, phone numbers, PIN codes or address text.</p></div></div>
      <div className="phase75-address-health-grid">
        <article><small>SAVED ADDRESSES</small><strong>{data.addressReadinessHealth.savedAddresses ?? 0}</strong><span>{data.addressReadinessHealth.defaultAddresses ?? 0} marked default</span></article>
        <article><small>6-DIGIT PIN READY</small><strong>{data.addressReadinessHealth.sixDigitPinPercent ?? 0}%</strong><span>Saved-address records</span></article>
        <article><small>CONTACT READY</small><strong>{data.addressReadinessHealth.contactReadyPercent ?? 0}%</strong><span>Saved delivery numbers</span></article>
        <article><small>UPDATED · 30D</small><strong>{data.addressReadinessHealth.updated30d ?? 0}</strong><span>Saved-address records</span></article>
        <article><small>CHECKS · 60M</small><strong>{data.addressReadinessHealth.engagement?.checks ?? 0}</strong><span>Checkout address checks</span></article>
        <article><small>READY · 60M</small><strong>{data.addressReadinessHealth.engagement?.readyRatePercent ?? 0}%</strong><span>{data.addressReadinessHealth.engagement?.readyChecks ?? 0} structurally ready</span></article>
        <article><small>REVIEW · 60M</small><strong>{data.addressReadinessHealth.engagement?.reviewChecks ?? 0}</strong><span>Non-blocking quality review</span></article>
        <article><small>AREA MISMATCH · 60M</small><strong>{data.addressReadinessHealth.engagement?.zoneMismatchChecks ?? 0}</strong><span>City/state differed from configured zone</span></article>
      </div>
      <p className="phase75-admin-note">{data.addressReadinessHealth.privacy}</p>
    </section>}

    {data?.orderIntegrityHealth && <section className="admin-panel phase79-integrity-health">
      <div className="admin-panel-head"><div><p className="eyebrow">PHASE 79 · ORDER INTEGRITY</p><h2>Order-to-fulfilment handoff</h2><p>Read-only consistency checks across payment, line/order totals, coupon redemption, inventory reservation trace and status history. Review warnings remain operable; critical mismatches are held before fulfilment moves forward.</p></div></div>
      <div className="phase79-integrity-health-grid">
        <article><small>CHECKED ORDERS</small><strong>{data.orderIntegrityHealth.checkedOrders ?? 0}</strong><span>Pending / confirmed / processing</span></article>
        <article><small>PASS</small><strong>{data.orderIntegrityHealth.pass ?? 0}</strong><span>Ready for fulfilment</span></article>
        <article><small>REVIEW</small><strong>{data.orderIntegrityHealth.review ?? 0}</strong><span>{data.orderIntegrityHealth.reviewIssues ?? 0} non-blocking issue(s)</span></article>
        <article className={(data.orderIntegrityHealth.blocked || 0) > 0 ? "danger" : ""}><small>BLOCKED</small><strong>{data.orderIntegrityHealth.blocked ?? 0}</strong><span>{data.orderIntegrityHealth.blockingIssues ?? 0} critical mismatch(es)</span></article>
      </div>
      <p className="phase79-integrity-note">{data.orderIntegrityHealth.note}</p>
    </section>}

    {data?.dispatchReadinessHealth && <section className="admin-panel phase80-dispatch-health">
      <div className="admin-panel-head"><div><p className="eyebrow">PHASE 80 · DISPATCH READINESS</p><h2>Courier handoff & shipment evidence</h2><p>Operational checks cover shipping-address completeness, parcel weight, courier constraints, tracking uniqueness and persisted shipment evidence before shipped/delivered transitions.</p></div></div>
      <div className="phase80-dispatch-health-grid">
        <article><small>PROCESSING CHECKED</small><strong>{data.dispatchReadinessHealth.checkedOrders ?? 0}</strong><span>Orders preparing for dispatch</span></article>
        <article><small>READY</small><strong>{data.dispatchReadinessHealth.ready ?? 0}</strong><span>Base dispatch checks clear</span></article>
        <article><small>REVIEW</small><strong>{data.dispatchReadinessHealth.review ?? 0}</strong><span>{data.dispatchReadinessHealth.reviewIssues ?? 0} non-blocking issue(s)</span></article>
        <article className={(data.dispatchReadinessHealth.blocked || 0) > 0 ? "danger" : ""}><small>BLOCKED</small><strong>{data.dispatchReadinessHealth.blocked ?? 0}</strong><span>{data.dispatchReadinessHealth.blockingIssues ?? 0} blocking issue(s)</span></article>
      </div>
      <p className="phase80-dispatch-note">{data.dispatchReadinessHealth.note}</p>
    </section>}

    {data?.shipmentTrackingHealth && <section className="admin-panel phase81-tracking-health">
      <div className="admin-panel-head"><div><p className="eyebrow">PHASE 81 · SHIPMENT TRACKING HEALTH</p><h2>Post-dispatch delivery control</h2><p>Read-only tracking health checks shipped/delivered orders for chronological courier events, stale movement, overdue ETA, unresolved exceptions and return-to-origin evidence.</p></div></div>
      <div className="phase81-tracking-health-grid">
        <article><small>CHECKED ORDERS</small><strong>{data.shipmentTrackingHealth.checkedOrders ?? 0}</strong><span>Last 90 days · shipped / delivered</span></article>
        <article><small>HEALTHY</small><strong>{data.shipmentTrackingHealth.healthy ?? 0}</strong><span>Tracking lifecycle coherent</span></article>
        <article><small>REVIEW</small><strong>{data.shipmentTrackingHealth.review ?? 0}</strong><span>{data.shipmentTrackingHealth.reviewIssues ?? 0} warning(s)</span></article>
        <article className={(data.shipmentTrackingHealth.blocked || 0) > 0 ? "danger" : ""}><small>BLOCKED</small><strong>{data.shipmentTrackingHealth.blocked ?? 0}</strong><span>{data.shipmentTrackingHealth.blockingIssues ?? 0} contradiction(s)</span></article>
        <article><small>STALE MOVEMENT</small><strong>{data.shipmentTrackingHealth.stale ?? 0}</strong><span>No movement / OFD stale</span></article>
        <article><small>ETA OVERDUE</small><strong>{data.shipmentTrackingHealth.overdue ?? 0}</strong><span>Still shipped after promise</span></article>
        <article className={(data.shipmentTrackingHealth.activeExceptions || 0) > 0 ? "danger" : ""}><small>ACTIVE EXCEPTION / RTO</small><strong>{data.shipmentTrackingHealth.activeExceptions ?? 0}</strong><span>Needs operations follow-up</span></article>
      </div>
      <p className="phase81-tracking-note">{data.shipmentTrackingHealth.note}</p>
    </section>}

    {data?.rtoRecoveryHealth && <section className="admin-panel phase82-rto-health">
      <div className="admin-panel-head"><div><p className="eyebrow">PHASE 82 · RTO RECOVERY</p><h2>Returned-parcel reconciliation</h2><p>RTO orders stay operationally separate from ordinary delivery: physical return must complete before stock restoration, COD closure is atomic, and prepaid returns require refund evidence.</p></div></div>
      <div className="phase82-rto-health-grid">
        <article><small>RTO CHECKED</small><strong>{data.rtoRecoveryHealth.checkedOrders ?? 0}</strong><span>Last 120 days</span></article>
        <article><small>RETURNING</small><strong>{data.rtoRecoveryHealth.inTransit ?? 0}</strong><span>Awaiting RTO delivery</span></article>
        <article className={(data.rtoRecoveryHealth.readyToClose || 0) > 0 ? "danger" : ""}><small>COD READY TO CLOSE</small><strong>{data.rtoRecoveryHealth.readyToClose ?? 0}</strong><span>Returned stock can be reconciled</span></article>
        <article className={(data.rtoRecoveryHealth.refundRequired || 0) > 0 ? "danger" : ""}><small>PREPAID REFUND</small><strong>{data.rtoRecoveryHealth.refundRequired ?? 0}</strong><span>Provider refund required</span></article>
        <article><small>RECONCILED</small><strong>{data.rtoRecoveryHealth.reconciled ?? 0}</strong><span>Stock/payment/order aligned</span></article>
        <article className={(data.rtoRecoveryHealth.blocked || 0) > 0 ? "danger" : ""}><small>BLOCKED</small><strong>{data.rtoRecoveryHealth.blocked ?? 0}</strong><span>Manual contradiction review</span></article>
      </div>
      <p className="phase82-rto-note">{data.rtoRecoveryHealth.note}</p>
    </section>}

    <section className="admin-panel phase44-fulfilment-queue">
      <div className="admin-panel-head"><div><h2>Dispatch queue</h2><p>Orders are sorted by promised dispatch time. Open an order to pack, ship and add tracking.</p></div><div className="phase44-filter-row">{[["attention","Attention"],["integrity","Integrity"],["dispatch","Dispatch"],["overdue","Overdue"],["due","Due soon"],["confirmed","Confirmed"],["processing","Processing"],["all","All"]].map(([value,label]) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
      {orders.length === 0 ? <div className="admin-empty"><strong>Nothing in this queue</strong><p>There are no orders matching the selected fulfilment view.</p></div> : <div className="phase44-fulfilment-list">{orders.map((order) => <article key={order.id} className={`${order.overdue ? "overdue" : order.dueSoon ? "due" : ""}`}>
        <div><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status}</span><strong>{order.orderNumber}</strong><small>{order.customerName} · {order.shippingZoneName || "Store-wide delivery"}</small></div>
        <div className="phase44-fulfilment-facts"><span><b>{relativeDeadline(order.dispatchDueAt)}</b>Dispatch SLA</span><span><b>{order.totalWeightGrams ? `${(Number(order.totalWeightGrams) / 1000).toFixed(2)} kg` : "—"}</b>Parcel weight</span><span><b>{order.preferredShippingPartnerName || "Any active courier"}</b>Suggested courier</span><span><b>{order.paymentMethod}</b>{order.paymentStatus}</span></div>
        <div className="phase44-fulfilment-actions">{order.integrity && <span className={`phase79-integrity-badge ${String(order.integrity.status || "pass").toLowerCase()}`}>{order.integrity.status === "BLOCK" ? "Integrity hold" : order.integrity.status === "REVIEW" ? "Integrity review" : "Integrity pass"}</span>}{order.dispatchReadiness && <span className={`phase80-dispatch-badge ${String(order.dispatchReadiness.status || "ready").toLowerCase()}`}>{order.dispatchReadiness.status === "BLOCK" ? "Dispatch hold" : order.dispatchReadiness.status === "REVIEW" ? "Dispatch review" : "Dispatch ready"}</span>}{order.cancellationPending && <span className="phase44-warning">Cancellation pending</span>}<Link className="button button-secondary" to={`/admin/orders/${order.id}`}>Open order</Link></div>
      </article>)}</div>}
    </section>

    {(data?.exceptions || []).length > 0 && <section className="admin-panel">
      <div className="admin-panel-head"><div><h2>Courier exceptions</h2><p>Recent exception and RTO events that may need follow-up.</p></div></div>
      <div className="phase44-exception-list">{data.exceptions.map((event) => <article key={event.id}><span>{event.type.replaceAll("_", " ")}</span><div><strong>{event.orderNumber} · {event.title}</strong><small>{event.customerName}{event.location ? ` · ${event.location}` : ""} · {new Date(event.eventAt).toLocaleString()}</small>{event.note && <p>{event.note}</p>}</div><Link to={`/admin/orders/${event.orderId}`}>Review →</Link></article>)}</div>
    </section>}
  </>;
}
