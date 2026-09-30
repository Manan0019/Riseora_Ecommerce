const labels = {
  PENDING: "Order placed",
  CONFIRMED: "Confirmed",
  PROCESSING: "Preparing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const normalSteps = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

function historyFor(order) {
  if (order.statusHistory?.length) return order.statusHistory;
  const fallback = [{ status: "PENDING", createdAt: order.createdAt, note: "Order placed" }];
  if (order.status !== "PENDING") fallback.push({ status: order.status, createdAt: order.updatedAt || order.createdAt });
  return fallback;
}

export default function OrderTimeline({ order, compact = false }) {
  const history = historyFor(order);
  const seen = new Map(history.map((entry) => [entry.status, entry]));
  const cancelled = order.status === "CANCELLED";
  const currentIndex = normalSteps.indexOf(order.status);

  return (
    <div className={compact ? "order-timeline compact" : "order-timeline"}>
      {normalSteps.map((status, index) => {
        const entry = seen.get(status);
        const done = !cancelled && currentIndex >= index;
        return (
          <div key={status} className={`timeline-step ${done ? "done" : ""} ${order.status === status ? "current" : ""}`}>
            <span className="timeline-dot">{done ? "✓" : index + 1}</span>
            <div><strong>{labels[status]}</strong>{entry?.createdAt && <small>{new Date(entry.createdAt).toLocaleString()}</small>}{entry?.note && !compact && <p>{entry.note}</p>}</div>
          </div>
        );
      })}
      {cancelled && <div className="timeline-step cancelled current"><span className="timeline-dot">×</span><div><strong>Cancelled</strong><small>{new Date(seen.get("CANCELLED")?.createdAt || order.updatedAt).toLocaleString()}</small>{seen.get("CANCELLED")?.note && !compact && <p>{seen.get("CANCELLED").note}</p>}</div></div>}
    </div>
  );
}
