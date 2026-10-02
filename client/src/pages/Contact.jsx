import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import Seo from "../components/Seo";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";

const categories = [
  ["GENERAL", "General enquiry"], ["ORDER", "Order"], ["PAYMENT", "Payment"], ["DELIVERY", "Delivery"],
  ["RETURN_REFUND", "Return / refund"], ["PRODUCT", "Product guidance"], ["ACCOUNT", "Account"], ["REWARDS", "Rewards"],
];

export default function Contact() {
  const { store } = useStore();
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", phone: "", category: "GENERAL", orderNumber: "", subject: "", message: "" });
  const [status, setStatus] = useState({ loading: false, message: "", error: "", ticketNumber: "" });
  useEffect(() => {
    if (!user) return;
    setForm((current) => ({ ...current, name: current.name || [user.firstName, user.lastName].filter(Boolean).join(" "), email: current.email || user.email || "", phone: current.phone || user.phone || "" }));
  }, [user]);
  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setStatus({ loading: true, message: "", error: "", ticketNumber: "" });
    try {
      const response = await apiFetch("/contact", { method: "POST", body: JSON.stringify(form) });
      const ticketNumber = response.data?.ticketNumber || "";
      setForm((current) => ({ name: user ? current.name : "", email: user ? current.email : "", phone: user ? current.phone : "", category: "GENERAL", orderNumber: "", subject: "", message: "" }));
      setStatus({ loading: false, message: response.message, error: "", ticketNumber });
    } catch (error) { setStatus({ loading: false, message: "", error: error.message, ticketNumber: "" }); }
  }
  const whatsapp = store.whatsappNumber ? `https://wa.me/${String(store.whatsappNumber).replace(/\D/g, "")}` : null;
  return <><Seo title="Contact us" description={store.contactIntro || "Contact Riseora Herbals for product and order support."} /><section className="container contact-page page-space"><div className="contact-intro"><p className="phase3-eyebrow">WE'RE HERE TO HELP</p><h1>Talk to Riseora</h1><p>{store.contactIntro || "Questions about a product, an order or your account? Send us a message and the Riseora team can follow up."}</p><div className="phase37-contact-links"><Link to="/help"><strong>Help Center</strong><span>Quick answers before you submit a request →</span></Link>{user && <Link to="/support"><strong>My support</strong><span>View your existing Riseora support threads →</span></Link>}</div><div className="contact-options">{store.supportEmail && <a href={`mailto:${store.supportEmail}`}><strong>Email</strong><span>{store.supportEmail}</span></a>}{store.supportPhone && <a href={`tel:${store.supportPhone}`}><strong>Call</strong><span>{store.supportPhone}</span></a>}{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer"><strong>WhatsApp</strong><span>Chat with Riseora</span></a>}</div></div><form className="contact-form card" onSubmit={submit}><div className="contact-grid"><label>Your name<input required name="name" value={form.name} onChange={change} autoComplete="name" /></label><label>Email<input required type="email" name="email" value={form.email} onChange={change} autoComplete="email" /></label></div><div className="contact-grid"><label>Phone (optional)<input name="phone" value={form.phone} onChange={change} autoComplete="tel" /></label><label>Topic<select name="category" value={form.category} onChange={change}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="contact-grid"><label>Order number (optional)<input name="orderNumber" value={form.orderNumber} onChange={change} placeholder="RISE-…" /></label><label>Subject<input name="subject" value={form.subject} onChange={change} placeholder="Short summary" /></label></div><label>How can we help?<textarea required minLength="10" name="message" value={form.message} onChange={change} rows="7" /></label>{status.message && <div className="alert success"><strong>{status.message}</strong>{status.ticketNumber && <><br /><small>Keep ticket {status.ticketNumber} for reference.</small>{user && <><br /><Link to={`/support/${status.ticketNumber}`}>Open your support thread →</Link></>}</>}</div>}{status.error && <p className="alert error">{status.error}</p>}<button className="button" disabled={status.loading}>{status.loading ? "Sending…" : "Send support request"}</button></form></section></>;
}
