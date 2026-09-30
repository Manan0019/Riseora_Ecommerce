import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../api/http";
import InvoiceDocument from "../../components/InvoiceDocument";

export default function AdminInvoice() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch(`/admin/invoices/${id}`).then((response) => setData(response.data)).catch((e) => setError(e.message)); }, [id]);
  if (error) return <><p className="alert error">{error}</p><Link to={`/admin/orders/${id}`}>← Back to order</Link></>;
  if (!data) return <div className="admin-panel"><div className="skeleton-card tall" /></div>;
  return <><div className="no-print"><Link className="back-link" to={`/admin/orders/${id}`}>← Back to order</Link></div><InvoiceDocument data={data} admin /></>;
}
