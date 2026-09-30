import { useState } from "react";
import { apiFetch } from "../api/http";
import Seo from "../components/Seo";
import { useStore } from "../context/StoreContext";

export default function Contact() {
  const { store } = useStore();
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [status, setStatus] = useState({ loading: false, message: "", error: "" });
  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setStatus({ loading: true, message: "", error: "" });
    try { const response = await apiFetch("/contact", { method: "POST", body: JSON.stringify(form) }); setForm({ name: "", email: "", phone: "", subject: "", message: "" }); setStatus({ loading: false, message: response.message, error: "" }); }
    catch (error) { setStatus({ loading: false, message: "", error: error.message }); }
  }
  const whatsapp = store.whatsappNumber ? `https://wa.me/${String(store.whatsappNumber).replace(/\D/g, "")}` : null;
  return <><Seo title="Contact us" description={store.contactIntro || "Contact Riseora Herbals for product and order support."} /><section className="container contact-page page-space"><div className="contact-intro"><p className="phase3-eyebrow">WE'RE HERE TO HELP</p><h1>Talk to Riseora</h1><p>{store.contactIntro || "Questions about a product, an order or your account? Send us a message and the Riseora team can follow up."}</p><div className="contact-options">{store.supportEmail && <a href={`mailto:${store.supportEmail}`}><strong>Email</strong><span>{store.supportEmail}</span></a>}{store.supportPhone && <a href={`tel:${store.supportPhone}`}><strong>Call</strong><span>{store.supportPhone}</span></a>}{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer"><strong>WhatsApp</strong><span>Chat with Riseora</span></a>}</div></div><form className="contact-form card" onSubmit={submit}><div className="contact-grid"><label>Your name<input required name="name" value={form.name} onChange={change} autoComplete="name" /></label><label>Email<input required type="email" name="email" value={form.email} onChange={change} autoComplete="email" /></label></div><div className="contact-grid"><label>Phone (optional)<input name="phone" value={form.phone} onChange={change} autoComplete="tel" /></label><label>Subject<input name="subject" value={form.subject} onChange={change} placeholder="Product / Order / Other" /></label></div><label>How can we help?<textarea required minLength="10" name="message" value={form.message} onChange={change} rows="7" /></label>{status.message && <p className="alert success">{status.message}</p>}{status.error && <p className="alert error">{status.error}</p>}<button className="button" disabled={status.loading}>{status.loading ? "Sending…" : "Send message"}</button></form></section></>;
}
