import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import InvoiceDocument from "../components/InvoiceDocument";

export default function Invoice() {
  const { orderNumber } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch(`/invoices/my/${orderNumber}`).then((response) => setData(response.data)).catch((e) => setError(e.message)); }, [orderNumber]);
  if (error) return <div className="container page-space"><p className="alert error">{error}</p><Link to={`/orders/${orderNumber}`}>← Back to order</Link></div>;
  if (!data) return <div className="container page-space"><div className="skeleton-card tall" /></div>;
  return <div className="container page-space"><div className="no-print"><Link className="back-link" to={`/orders/${orderNumber}`}>← Back to order</Link></div><InvoiceDocument data={data} /></div>;
}
