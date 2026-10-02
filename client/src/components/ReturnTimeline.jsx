export default function ReturnTimeline({ item }) {
  const history = [...(item?.statusHistory || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const fallback = history.length ? history : item ? [{ id: "current", status: item.status, createdAt: item.requestedAt, note: item.details || item.reason }] : [];
  return <div className="return-timeline">
    {fallback.map((entry, index) => <div className="return-timeline-row" key={entry.id || `${entry.status}-${index}`}>
      <span className="return-timeline-dot" />
      {index < fallback.length - 1 && <span className="return-timeline-line" />}
      <div><small>{new Date(entry.createdAt).toLocaleString()}</small><strong>{String(entry.status || "").replaceAll("_", " ")}</strong>{entry.note && <p>{entry.note}</p>}</div>
    </div>)}
  </div>;
}
