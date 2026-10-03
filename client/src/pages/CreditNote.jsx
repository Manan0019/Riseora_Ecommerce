import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import CreditNoteDocument from "../components/CreditNoteDocument";

export default function CreditNote() {
  const { returnNumber } = useParams();
  const [data, setData] = useState(null); const [error, setError] = useState("");
  useEffect(() => { apiFetch(`/invoices/credit-note/my/${encodeURIComponent(returnNumber)}`).then((r) => setData(r.data)).catch((e) => setError(e.message)); }, [returnNumber]);
  if (error) return <div className="container page-space"><p className="alert error">{error}</p><Link to="/returns">← Returns</Link></div>;
  if (!data) return <div className="container page-space"><div className="skeleton-card tall" /></div>;
  return <div className="container page-space"><div className="no-print"><Link className="back-link" to={`/returns/${data.returnRequest.id}`}>← Back to return</Link></div><CreditNoteDocument data={data} /></div>;
}
