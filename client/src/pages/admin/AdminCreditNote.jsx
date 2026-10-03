import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../api/http";
import CreditNoteDocument from "../../components/CreditNoteDocument";

export default function AdminCreditNote() {
  const { id } = useParams(); const [data, setData] = useState(null); const [error, setError] = useState("");
  useEffect(() => { apiFetch(`/admin/finance/credit-note/${id}`).then((r) => setData(r.data)).catch((e) => setError(e.message)); }, [id]);
  if (error) return <div className="admin-page"><p className="alert error">{error}</p><Link to="/admin/finance">← Finance</Link></div>;
  if (!data) return <div className="admin-page"><p>Loading credit note…</p></div>;
  return <div className="admin-page"><div className="no-print"><Link className="back-link" to="/admin/finance">← Finance</Link></div><CreditNoteDocument data={data} admin /></div>;
}
