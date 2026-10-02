import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../api/http";
import OrderTimeline from "../../components/OrderTimeline";
import ShipmentJourney from "../../components/ShipmentJourney";

const nextByStatus = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export default function AdminOrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [form, setForm] = useState({ status: "", note: "", carrier: "", trackingNumber: "", trackingUrl: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [partners, setPartners] = useState([]);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [shipmentEvent, setShipmentEvent] = useState({ type: "IN_TRANSIT", title: "In transit", note: "", location: "", customerVisible: true });
  const [shipmentSaving, setShipmentSaving] = useState(false);

  async function load() {
    const [response, partnerResponse] = await Promise.all([apiFetch(`/admin/orders/${id}`), apiFetch("/admin/shipping-partners")]);
    setOrder(response.data); setPartners(partnerResponse.data.filter((item) => item.isActive));
    setForm((current) => ({ ...current, status: response.data.status, carrier: response.data.shipment?.carrier || "", trackingNumber: response.data.shipment?.trackingNumber || "", trackingUrl: response.data.shipment?.trackingUrl || "" }));
    setDeliveryDate(response.data.shipment?.estimatedDeliveryAt ? String(response.data.shipment.estimatedDeliveryAt).slice(0, 10) : "");
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, [id]);

  function chooseCarrier(name) {
    const partner = partners.find((item) => item.name === name);
    const trackingUrl = partner?.trackingUrlTemplate && form.trackingNumber ? partner.trackingUrlTemplate.replaceAll("{trackingNumber}", encodeURIComponent(form.trackingNumber)) : form.trackingUrl;
    setForm((current) => ({ ...current, carrier: name, trackingUrl }));
  }

  function updateTrackingNumber(value) {
    const partner = partners.find((item) => item.name === form.carrier);
    const trackingUrl = partner?.trackingUrlTemplate ? partner.trackingUrlTemplate.replaceAll("{trackingNumber}", encodeURIComponent(value)) : form.trackingUrl;
    setForm((current) => ({ ...current, trackingNumber: value, trackingUrl }));
  }

  const statusOptions = useMemo(() => {
    if (!order) return [];
    const next = nextByStatus[order.status] || [];
    const filtered = order.paymentMethod === "ONLINE" && order.payment?.status === "PAID" ? next.filter((status) => status !== "CANCELLED") : next;
    return [order.status, ...filtered];
  }, [order]);

  async function save(event) {
    event.preventDefault(); setMessage(""); setError("");
    try {
      await apiFetch(`/admin/orders/${id}/fulfilment`, { method: "PATCH", body: JSON.stringify(form) });
      setMessage("Order fulfilment updated."); setForm((current) => ({ ...current, note: "" })); await load();
    } catch (e) { setError(e.message); }
  }

  async function refundAndCancel() {
    if (!order || !window.confirm(`Refund ₹${Number(order.totalAmount).toFixed(0)} and cancel ${order.orderNumber}?`)) return;
    setRefunding(true); setMessage(""); setError("");
    try {
      await apiFetch(`/admin/orders/${id}/refund`, { method: "POST" });
      setMessage("Online payment refunded and order cancelled.");
      await load();
    } catch (e) { setError(e.message); } finally { setRefunding(false); }
  }

  async function saveDeliveryEstimate() {
    if (!deliveryDate) return setError("Choose an estimated delivery date.");
    setShipmentSaving(true); setError(""); setMessage("");
    try {
      await apiFetch(`/admin/orders/${id}/shipment-estimate`, { method: "PATCH", body: JSON.stringify({ estimatedDeliveryAt: new Date(`${deliveryDate}T18:00:00`).toISOString() }) });
      setMessage("Estimated delivery date updated."); await load();
    } catch (e) { setError(e.message); } finally { setShipmentSaving(false); }
  }

  async function addShipmentEvent(event) {
    event.preventDefault(); setShipmentSaving(true); setError(""); setMessage("");
    try {
      await apiFetch(`/admin/orders/${id}/shipment-events`, { method: "POST", body: JSON.stringify(shipmentEvent) });
      setShipmentEvent({ type: "IN_TRANSIT", title: "In transit", note: "", location: "", customerVisible: true });
      setMessage("Shipment journey updated."); await load();
    } catch (e) { setError(e.message); } finally { setShipmentSaving(false); }
  }

  if (error && !order) return <><p className="alert error">{error}</p><Link to="/admin/orders">← Back to orders</Link></>;
  if (!order) return <div className="admin-panel"><div className="skeleton-card" /></div>;
  const address = order.shippingAddress || {};
  const fulfilmentBlocked = order.cancellationRequest && ["REQUESTED", "APPROVED"].includes(order.cancellationRequest.status);

  return <>
    <div className="admin-page-heading"><div><Link className="back-link" to="/admin/orders">← Orders</Link><p className="eyebrow">{order.orderNumber}</p><h1>Order fulfilment</h1><p>Placed {new Date(order.createdAt).toLocaleString()}</p><div className="order-detail-actions">{!["PENDING","CANCELLED"].includes(order.status) && <Link className="button button-secondary" to={`/admin/orders/${order.id}/invoice`}>Tax invoice</Link>}</div></div><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status}</span></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    {order.cancellationRequest && ["REQUESTED", "APPROVED"].includes(order.cancellationRequest.status) && <section className="admin-cancellation-alert"><div><small>CUSTOMER CANCELLATION REQUEST</small><strong>{order.cancellationRequest.reason}</strong>{order.cancellationRequest.customerNote && <p>{order.cancellationRequest.customerNote}</p>}</div><Link className="button" to="/admin/cancellations">Review request</Link></section>}

    <div className="admin-order-detail-grid">
      <section className="admin-panel"><div className="admin-panel-head"><div><h2>Customer & delivery</h2><p>Shipping snapshot captured at checkout.</p></div></div><div className="admin-detail-stack"><strong>{order.customerName}</strong><span>{order.customerPhone}</span>{order.customerEmail && <span>{order.customerEmail}</span>}<p>{[address.line1, address.line2, address.landmark, address.city, address.state, address.postalCode, address.country].filter(Boolean).join(", ")}</p>{(order.shippingZoneName || order.deliveryEstimate) && <div className="phase21-order-zone admin"><span><b>Delivery zone</b>{order.shippingZoneName || "Store-wide rules"}</span>{order.deliveryEstimate && <span><b>Checkout ETA</b>{order.deliveryEstimate.deliveryMinDays}–{order.deliveryEstimate.deliveryMaxDays} days + {order.deliveryEstimate.dispatchWithinDays || 0} dispatch day(s)</span>}</div>}</div></section>
      <section className="admin-panel"><div className="admin-panel-head"><div><h2>Payment</h2><p>{order.paymentMethod}</p></div></div><div className="admin-payment-summary"><span>Status <strong>{order.payment?.status || "PENDING"}</strong></span><span>Total <strong>₹{Number(order.totalAmount).toFixed(0)}</strong></span>{order.payment?.providerPaymentId && <span>Payment ID <strong>{order.payment.providerPaymentId}</strong></span>}{order.payment?.refundId && <span>Refund ID <strong>{order.payment.refundId}</strong></span>}{order.couponCode && <span>Coupon <strong>{order.couponCode}</strong></span>}</div>{order.paymentMethod === "ONLINE" && order.payment?.status === "PAID" && !["SHIPPED","DELIVERED","CANCELLED"].includes(order.status) && <button type="button" className="button button-danger admin-refund-button" disabled={refunding} onClick={refundAndCancel}>{refunding ? "Refunding…" : "Refund payment & cancel order"}</button>}</section>
    </div>

    <div className="admin-order-detail-grid fulfilment-grid">
      <section className="admin-panel"><div className="admin-panel-head"><div><h2>Progress</h2><p>Customer sees this timeline.</p></div></div><OrderTimeline order={order} /></section>
      <form className="admin-panel admin-form" onSubmit={save}><div className="admin-panel-head"><div><h2>Update fulfilment</h2><p>Move orders forward and add courier details.</p></div></div><label>Status<select disabled={fulfilmentBlocked} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>{form.status === "SHIPPED" && <><div className="admin-field-grid two"><label>Courier / carrier<input required list="riseora-couriers" value={form.carrier} onChange={(e) => chooseCarrier(e.target.value)} placeholder="e.g. Delhivery" /><datalist id="riseora-couriers">{partners.map((partner) => <option key={partner.id} value={partner.name} />)}</datalist></label><label>Tracking number<input required value={form.trackingNumber} onChange={(e) => updateTrackingNumber(e.target.value)} /></label></div><label>Tracking URL<input type="url" value={form.trackingUrl} onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })} placeholder="https://..." /></label></>}<label>Customer-visible note<textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional update, e.g. Packed and ready for dispatch" /></label><button className="button" disabled={fulfilmentBlocked}>{fulfilmentBlocked ? "Resolve cancellation first" : "Save fulfilment update"}</button></form>
    </div>

    {order.shipment && <div className="admin-order-detail-grid postpurchase-admin-grid">
      <section className="admin-panel"><div className="admin-panel-head"><div><h2>Shipment journey</h2><p>Customer-visible courier history and delivery estimate.</p></div></div><ShipmentJourney shipment={order.shipment} /><div className="admin-field-grid two shipment-estimate-editor"><label>Estimated delivery<input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></label><button type="button" className="button button-secondary" disabled={shipmentSaving || !deliveryDate} onClick={saveDeliveryEstimate}>Save ETA</button></div></section>
      <form className="admin-panel admin-form" onSubmit={addShipmentEvent}><div className="admin-panel-head"><div><h2>Add courier event</h2><p>Use this for in-transit, out-for-delivery, exception and RTO updates.</p></div></div><div className="admin-field-grid two"><label>Event<select value={shipmentEvent.type} onChange={(e) => setShipmentEvent({ ...shipmentEvent, type: e.target.value })}>{["LABEL_CREATED","PICKED_UP","IN_TRANSIT","OUT_FOR_DELIVERY","DELIVERED","EXCEPTION","RTO_INITIATED","RTO_DELIVERED","NOTE"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Location<input value={shipmentEvent.location} onChange={(e) => setShipmentEvent({ ...shipmentEvent, location: e.target.value })} placeholder="e.g. Surat Hub" /></label></div><label>Headline<input required value={shipmentEvent.title} onChange={(e) => setShipmentEvent({ ...shipmentEvent, title: e.target.value })} /></label><label>Details<textarea value={shipmentEvent.note} onChange={(e) => setShipmentEvent({ ...shipmentEvent, note: e.target.value })} placeholder="Optional customer-facing detail" /></label><label className="admin-check-row"><input type="checkbox" checked={shipmentEvent.customerVisible} onChange={(e) => setShipmentEvent({ ...shipmentEvent, customerVisible: e.target.checked })} /> Visible to customer</label><button className="button" disabled={shipmentSaving}>{shipmentSaving ? "Saving…" : "Add shipment event"}</button></form>
    </div>}

    <section className="admin-panel"><div className="admin-panel-head"><div><h2>Order items</h2><p>{order.items.length} line item(s)</p></div></div><div className="admin-order-line-items">{order.items.map((item) => <div key={item.id}><span><strong>{item.productName}</strong><small>{item.variantName || item.sku} × {item.quantity}{item.isComplimentary ? ` • FREE • ${item.promotionLabel || "Offer"}` : ""}</small></span><strong>{item.isComplimentary ? "FREE" : `₹${Number(item.lineTotal).toFixed(0)}`}</strong></div>)}</div><div className="admin-order-totals"><span>Subtotal <strong>₹{Number(order.subtotal).toFixed(0)}</strong></span>{Number(order.discountAmount) > 0 && <span>Discount <strong>−₹{Number(order.discountAmount).toFixed(0)}</strong></span>}<span className="total">Total <strong>₹{Number(order.totalAmount).toFixed(0)}</strong></span></div></section>
  </>;
}
