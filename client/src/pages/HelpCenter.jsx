import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo";
import { Icon } from "../components/Icons";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";

const topics = [
  { group: "Orders", q: "How do I track my order?", a: "Use Track Order with your order number and phone, or sign in to My Orders for the full shipment journey." },
  { group: "Orders", q: "Can I cancel an order?", a: "Signed-in customers can request cancellation while an order is still pending or confirmed. Riseora reviews the request before fulfilment continues." },
  { group: "Delivery", q: "When will my order arrive?", a: "Your checkout and order details show the current estimated delivery window. Once shipped, courier events and tracking appear in the order journey." },
  { group: "Payments", q: "What if my online payment is delayed?", a: "Riseora keeps a short payment reservation and can reconcile delayed Razorpay or UPI capture before releasing stock. You can retry or check status from Checkout." },
  { group: "Returns", q: "How do returns and refunds work?", a: "Eligible delivered orders can create a return request from My Orders. You can attach evidence, follow the return journey and see refund information from My Riseora." },
  { group: "Products", q: "How do I choose the right product?", a: "Use Shop by Need, ingredient filters, product comparison and the Routine Builder. Product pages also include suitability, benefits and usage guidance." },
  { group: "Account", q: "Where are my wishlist, rewards and alerts?", a: "Open My Riseora to access cross-device wishlist, Rewards, notifications, shopping alerts, orders, returns and saved addresses." },
  { group: "Rewards", q: "When do reward points become available?", a: "Purchase points are credited after eligible orders are delivered. Verified reviews and qualifying referrals can also earn points according to the current Rewards rules." },
];

export default function HelpCenter() {
  const { user } = useAuth();
  const { store } = useStore();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return !needle ? topics : topics.filter((item) => `${item.group} ${item.q} ${item.a}`.toLowerCase().includes(needle));
  }, [query]);
  return <><Seo title="Help Center" description="Riseora Help Center for orders, delivery, payments, returns, products, accounts and rewards." /><div className="container page-space phase37-help-page">
    <section className="phase37-help-hero"><p className="eyebrow">RISEORA CARE</p><h1>How can we help?</h1><p>Quick answers first. Real support when you need it.</p><div className="phase37-help-search"><Icon name="search" size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search orders, returns, payment, rewards…" /></div><div className="phase37-help-actions">{user ? <Link className="button" to="/support">My support requests</Link> : <Link className="button" to="/login">Sign in for account support</Link>}<Link className="button button-secondary" to="/contact">Contact Riseora</Link></div></section>
    <section className="phase37-help-grid">{filtered.map((item) => <article key={item.q}><span>{item.group}</span><h2>{item.q}</h2><p>{item.a}</p></article>)}{!filtered.length && <div className="phase37-help-empty"><Icon name="search" /><h2>No exact answer found</h2><p>Send the Riseora team a support request and include any relevant order number.</p><Link className="button" to="/contact">Contact support</Link></div>}</section>
    <section className="phase37-care-strip"><div><Icon name="mail" /><span><strong>Email support</strong><small>{store.supportEmail || "Available when configured in Admin"}</small></span></div><div><Icon name="orders" /><span><strong>Order help</strong><small><Link to="/track-order">Track an order</Link></small></span></div><div><Icon name="truck" /><span><strong>Returns</strong><small><Link to="/policies/returns">Read return policy</Link></small></span></div></section>
  </div></>;
}
