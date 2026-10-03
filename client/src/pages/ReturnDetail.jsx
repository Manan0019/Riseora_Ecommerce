import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import ReturnTimeline from "../components/ReturnTimeline";

function money(value) { return `₹${Number(value || 0).toFixed(0)}`; }

export default function ReturnDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { apiFetch(`/returns/${id}`).then((r) => setItem(r.data)).catch((e) => setError(e.message)); }, [id]);

  if (error && !item) return <div className="container page-space"><p className="alert error">{error}</p><Link to="/returns">← Returns</Link></div>;
  if (!item) return <div className="container page-space"><div className="skeleton-card tall" /></div>;

  return <div className="container page-space return-detail-page">
    <div className="page-heading-row"><div><Link className="back-link" to="/returns">← Returns & refunds</Link><p className="eyebrow">{item.returnNumber}</p><h1>Return journey</h1><p>Order {item.order?.orderNumber}</p></div><span className={`return-pill return-${item.status.toLowerCase().replaceAll("_", "-")}`}>{item.status.replaceAll("_", " ")}</span></div>

    <div className="postpurchase-grid">
      <section className="order-detail-card"><h2>Status history</h2><ReturnTimeline item={item} /></section>
      <section className="order-detail-card"><h2>Refund</h2><div className="postpurchase-stat"><span>Expected value</span><strong>{money(item.refundAmount)}</strong></div>{item.refundMethod && <div className="postpurchase-stat"><span>Method</span><strong>{item.refundMethod.replaceAll("_", " ")}</strong></div>}{item.refundReference && <div className="postpurchase-stat"><span>Reference</span><strong>{item.refundReference}</strong></div>}{item.refundedAt && <><p className="muted">Refunded {new Date(item.refundedAt).toLocaleString()}</p><Link className="button button-secondary phase45-credit-link" to={`/credit-note/${item.returnNumber}`}>View credit note</Link></>}</section>
    </div>

    <section className="order-detail-card"><h2>Items</h2>{item.items.map((line) => <div className="summary-row" key={line.id}><span>{line.orderItem.productName} {line.orderItem.variantName ? `/ ${line.orderItem.variantName}` : ""} × {line.quantity}</span><strong>{money(Number(line.unitRefundAmount) * line.quantity)}</strong></div>)}</section>

    {(item.evidence || []).length > 0 && <section className="order-detail-card"><h2>Evidence shared</h2><div className="return-evidence-grid">{item.evidence.map((image) => <a href={mediaUrl(image.url)} target="_blank" rel="noreferrer" key={image.id}><img src={mediaUrl(image.url)} alt={image.originalName || "Return evidence"} /></a>)}</div></section>}

    {item.reverseTrackingNumber && <section className="order-detail-card"><h2>Return pickup</h2><div className="shipment-box"><span>{item.reverseCarrier || "Return courier"}</span><strong>{item.reverseTrackingNumber}</strong>{item.reverseTrackingUrl && <a href={item.reverseTrackingUrl} target="_blank" rel="noreferrer">Track return ↗</a>}</div></section>}
  </div>;
}
