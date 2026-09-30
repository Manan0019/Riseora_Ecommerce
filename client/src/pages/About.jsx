import { Link } from "react-router-dom";
import Seo from "../components/Seo";
import { Icon } from "../components/Icons";
import { useStore } from "../context/StoreContext";

export default function About() {
  const { store } = useStore();
  const title = store.aboutTitle || "Herbal roots. Modern rituals.";
  const body = store.aboutBody || "Riseora Herbals is building everyday care around a simple idea: herbal traditions can feel modern, clear and easy to shop. Our online store is designed around transparent choices, responsive service and a calm mobile-first experience.";
  return <><Seo title="About us" description={body.slice(0, 180)} /><section className="about-hero"><div className="container about-hero-grid"><div><p className="phase3-eyebrow">OUR STORY</p><h1>{title}</h1><p>{body}</p><Link className="black-button" to="/shop">EXPLORE PRODUCTS</Link></div><div className="about-brand-card"><span>R</span><strong>RISEORA</strong><small>HERBALS</small><p>{store.brandTagline || "Everyday herbal care, thoughtfully made."}</p></div></div></section><section className="container about-values"><article><Icon name="leaf" /><h2>Herbal-first thinking</h2><p>Products are presented with clear variants, pricing and information so customers can choose confidently.</p></article><article><Icon name="shield" /><h2>Built on trust</h2><p>Secure checkout, order tracking, invoices and return workflows are built directly into the Riseora store.</p></article><article><Icon name="sparkles" /><h2>Modern experience</h2><p>Mobile-first browsing keeps discovery, offers and checkout fast and thumb-friendly.</p></article></section></>;
}
