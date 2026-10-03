import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import Seo from "../components/Seo";
import { openAnalyticsPreferences } from "../analytics";

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
  return <><Seo title={definition.title} description={`${definition.title} for Riseora Herbals customers.`} /><div className="container page-space policy-page"><Link className="back-link" to="/">← Riseora home</Link><p className="eyebrow">CUSTOMER CARE</p><h1>{definition.title}</h1>{type === "privacy" && <div className="phase30-privacy-control"><div><strong>Analytics preference</strong><p>You can change your optional analytics choice at any time. Essential cart, account and checkout storage remains available.</p></div><div className="phase46-policy-actions"><button type="button" className="button button-secondary" onClick={openAnalyticsPreferences}>Analytics choices</button><Link className="button button-secondary" to="/privacy-center">Privacy Center</Link></div></div>}{error && <p className="alert error">{error}</p>}{type === "privacy" && config?.privacyPolicyVersion && <p className="muted phase46-policy-version-note">Policy version: <strong>{config.privacyPolicyVersion}</strong></p>}{!config ? <div className="skeleton-card tall" /> : paragraphs.length ? <div className="policy-copy">{paragraphs.map((text, index) => <p key={index}>{text}</p>)}</div> : <div className="empty-state"><h2>Policy content is being prepared</h2><p>Riseora admin can publish this policy from Store Settings before launch.</p></div>}</div></>;
}
