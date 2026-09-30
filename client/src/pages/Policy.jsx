import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";

const definitions = {
  shipping: { title: "Shipping policy", field: "shippingPolicy" },
  returns: { title: "Return & refund policy", field: "returnPolicy" },
  privacy: { title: "Privacy policy", field: "privacyPolicy" },
  terms: { title: "Terms & conditions", field: "termsPolicy" },
};

export default function Policy() {
  const { type } = useParams();
  const definition = definitions[type] || definitions.terms;
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch("/store/config").then((response) => setConfig(response.data)).catch((e) => setError(e.message)); }, []);
  const paragraphs = useMemo(() => String(config?.[definition.field] || "").split(/\n{2,}/).map((item) => item.trim()).filter(Boolean), [config, definition.field]);
  return <div className="container page-space policy-page"><Link className="back-link" to="/">← Riseora home</Link><p className="eyebrow">CUSTOMER CARE</p><h1>{definition.title}</h1>{error && <p className="alert error">{error}</p>}{!config ? <div className="skeleton-card tall" /> : paragraphs.length ? <div className="policy-copy">{paragraphs.map((text, index) => <p key={index}>{text}</p>)}</div> : <div className="empty-state"><h2>Policy content is being prepared</h2><p>Riseora admin can publish this policy from Store Settings before launch.</p></div>}</div>;
}
