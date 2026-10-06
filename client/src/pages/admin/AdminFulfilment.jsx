import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/http";

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
    if (filter === "all") return rows;
    return rows.filter((row) => row.overdue || row.dueSoon || row.cancellationPending);
  }, [data, filter]);

  if (!data && !error) return <div className="admin-panel"><div className="skeleton-card tall" /></div>;
  const counts = data?.counts || {};

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">OPERATIONS CONTROL</p><h1>Fulfilment</h1><p>Dispatch SLA, courier preference, shipment exceptions and orders that need attention.</p></div><button type="button" className="button button-secondary" onClick={() => load().catch((e) => setError(e.message))}>Refresh</button></div>
    {error && <p className="alert error">{error}</p>}

    <section className="phase44-kpi-grid">
      <button type="button" onClick={() => setFilter("confirmed")}><small>AWAITING PROCESSING</small><strong>{counts.awaiting || 0}</strong><span>Confirmed orders</span></button>
      <button type="button" onClick={() => setFilter("processing")}><small>PROCESSING</small><strong>{counts.processing || 0}</strong><span>Being prepared</span></button>
      <button type="button" className={(counts.overdue || 0) > 0 ? "danger" : ""} onClick={() => setFilter("overdue")}><small>DISPATCH OVERDUE</small><strong>{counts.overdue || 0}</strong><span>Past promised dispatch</span></button>
      <button type="button" onClick={() => setFilter("due")}><small>DUE NEXT 24H</small><strong>{counts.dueSoon || 0}</strong><span>Protect the SLA</span></button>
      <div><small>IN TRANSIT</small><strong>{counts.inTransit || 0}</strong><span>Shipped orders</span></div>
      <div className={(counts.exceptions || 0) > 0 ? "danger" : ""}><small>SHIPMENT EXCEPTIONS</small><strong>{counts.exceptions || 0}</strong><span>Last 14 days</span></div>
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

    <section className="admin-panel phase44-fulfilment-queue">
      <div className="admin-panel-head"><div><h2>Dispatch queue</h2><p>Orders are sorted by promised dispatch time. Open an order to pack, ship and add tracking.</p></div><div className="phase44-filter-row">{[["attention","Attention"],["overdue","Overdue"],["due","Due soon"],["confirmed","Confirmed"],["processing","Processing"],["all","All"]].map(([value,label]) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
      {orders.length === 0 ? <div className="admin-empty"><strong>Nothing in this queue</strong><p>There are no orders matching the selected fulfilment view.</p></div> : <div className="phase44-fulfilment-list">{orders.map((order) => <article key={order.id} className={`${order.overdue ? "overdue" : order.dueSoon ? "due" : ""}`}>
        <div><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status}</span><strong>{order.orderNumber}</strong><small>{order.customerName} · {order.shippingZoneName || "Store-wide delivery"}</small></div>
        <div className="phase44-fulfilment-facts"><span><b>{relativeDeadline(order.dispatchDueAt)}</b>Dispatch SLA</span><span><b>{order.totalWeightGrams ? `${(Number(order.totalWeightGrams) / 1000).toFixed(2)} kg` : "—"}</b>Parcel weight</span><span><b>{order.preferredShippingPartnerName || "Any active courier"}</b>Suggested courier</span><span><b>{order.paymentMethod}</b>{order.paymentStatus}</span></div>
        <div className="phase44-fulfilment-actions">{order.cancellationPending && <span className="phase44-warning">Cancellation pending</span>}<Link className="button button-secondary" to={`/admin/orders/${order.id}`}>Open order</Link></div>
      </article>)}</div>}
    </section>

    {(data?.exceptions || []).length > 0 && <section className="admin-panel">
      <div className="admin-panel-head"><div><h2>Courier exceptions</h2><p>Recent exception and RTO events that may need follow-up.</p></div></div>
      <div className="phase44-exception-list">{data.exceptions.map((event) => <article key={event.id}><span>{event.type.replaceAll("_", " ")}</span><div><strong>{event.orderNumber} · {event.title}</strong><small>{event.customerName}{event.location ? ` · ${event.location}` : ""} · {new Date(event.eventAt).toLocaleString()}</small>{event.note && <p>{event.note}</p>}</div><Link to={`/admin/orders/${event.orderId}`}>Review →</Link></article>)}</div>
    </section>}
  </>;
}
