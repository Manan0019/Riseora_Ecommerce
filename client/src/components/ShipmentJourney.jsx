function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

export default function ShipmentJourney({ shipment, compact = false }) {
  if (!shipment) return <div className="postpurchase-empty">Tracking starts after the order is handed to the courier.</div>;
  const events = [...(shipment.events || [])].sort((a, b) => new Date(a.eventAt) - new Date(b.eventAt));
  return <div className={compact ? "shipment-journey compact" : "shipment-journey"}>
    {shipment.estimatedDeliveryAt && <div className="shipment-eta"><small>ESTIMATED DELIVERY</small><strong>{new Date(shipment.estimatedDeliveryAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</strong></div>}
    {events.length === 0 ? <div className="postpurchase-empty">Courier events will appear here as the parcel moves.</div> : <div className="shipment-event-list">
      {events.map((event, index) => <div className="shipment-event" key={event.id}>
        <span className="shipment-event-dot" aria-hidden="true" />
        {index < events.length - 1 && <span className="shipment-event-line" aria-hidden="true" />}
        <div><small>{formatDate(event.eventAt)}{event.location ? ` • ${event.location}` : ""}</small><strong>{event.title}</strong>{event.note && <p>{event.note}</p>}</div>
      </div>)}
    </div>}
  </div>;
}
