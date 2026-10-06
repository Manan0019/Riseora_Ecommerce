import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/http";
import { Icon } from "../../components/Icons";

function minutesLabel(value) {
  const n = Number(value || 0);
  if (n >= 1440 && n % 1440 === 0) return `${n / 1440} day${n === 1440 ? "" : "s"}`;
  if (n >= 60 && n % 60 === 0) return `${n / 60} hour${n === 60 ? "" : "s"}`;
  return `${n} min`;
}

export default function AdminLifecycle() {
  const [overview, setOverview] = useState(null);
  const [savedBagHealth, setSavedBagHealth] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [response, savedBag] = await Promise.all([
      apiFetch("/admin/lifecycle/overview"),
      apiFetch("/admin/lifecycle/saved-bag-health"),
    ]);
    setOverview(response.data);
    setSavedBagHealth(savedBag.data);
  }

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  async function run(job) {
    setBusy(job); setMessage(""); setError("");
    try {
      const response = await apiFetch("/admin/lifecycle/run", { method: "POST", body: JSON.stringify({ job }) });
      setMessage(response.message || "Lifecycle automations processed.");
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  if (!overview) return <div className="admin-panel"><div className="phase18-inline-loader"><span /><span /><span /></div></div>;

  const emailReady = Boolean(overview.emailConfigured);
  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">CUSTOMER LIFECYCLE</p><h1>Automation center</h1><p>One control room for recovery, restock, price-drop and refill journeys.</p></div><button className="button" onClick={() => run("ALL")} disabled={Boolean(busy)}>{busy === "ALL" ? "PROCESSING…" : "RUN ALL READY AUTOMATIONS"}</button></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}

    <section className="phase29-lifecycle-health">
      <article className={emailReady ? "ready" : "warning"}><span><Icon name="mail" /></span><div><small>EMAIL DELIVERY</small><strong>{emailReady ? "Configured" : "Needs setup"}</strong><p>{emailReady ? "Resend + sender configuration detected." : "Alerts remain pending until RESEND_API_KEY and EMAIL_FROM are configured."}</p></div></article>
      <article className={overview.cartRecoveryAutomationEnabled ? "ready" : "neutral"}><span><Icon name="refresh" /></span><div><small>CART RECOVERY</small><strong>{overview.cartRecoveryAutomationEnabled ? "Automatic" : "Manual"}</strong><p>First reminder after {minutesLabel(overview.cartRecoveryFirstDelayMinutes)} · second after {minutesLabel(overview.cartRecoverySecondDelayMinutes)}.</p></div></article>
    </section>

    <section className="admin-panel phase69-admin-saved-bag">
      <div className="admin-panel-head"><div><p className="eyebrow">PHASE 69 · CROSS-DEVICE BAG</p><h2>Saved Bag continuity</h2><p>Signed-in bags persist across devices. This operational persistence is separate from cart-recovery marketing consent.</p></div></div>
      <div className="phase69-admin-saved-bag-grid">
        <article><small>SAVED BAGS</small><strong>{savedBagHealth?.savedBags ?? 0}</strong><span>customer account bags</span></article>
        <article><small>UPDATED · 24H</small><strong>{savedBagHealth?.updated24h ?? 0}</strong><span>recent bag changes</span></article>
        <article><small>ACTIVE · 7D</small><strong>{savedBagHealth?.active7d ?? 0}</strong><span>recently used bags</span></article>
        <article><small>STALE · 30D+</small><strong>{savedBagHealth?.stale30d ?? 0}</strong><span>older saved bags</span></article>
      </div>
      <p className="phase69-admin-saved-bag-note">Saved Bag stores only variant identity and quantity. Current price, availability, safety stock and purchase limits are re-read whenever a bag is restored.</p>
    </section>

    <div className="phase29-lifecycle-grid">
      <section className="phase29-lifecycle-card"><div className="phase29-lifecycle-card-head"><span><Icon name="cart" /></span><div><p>ABANDONED CHECKOUT</p><h2>Cart recovery</h2></div></div><div className="phase29-lifecycle-stats"><div><strong>{overview.activeRecoveries}</strong><small>Active carts</small></div><div><strong>{overview.optedRecoveries}</strong><small>Opted in</small></div><div><strong>{overview.dueRecoveries}</strong><small>Due now</small></div></div><p>Consent-based recovery only. A maximum of two reminders is enforced per saved cart.</p><div className="phase29-lifecycle-actions"><button className="button button-secondary" onClick={() => run("CART_RECOVERY")} disabled={Boolean(busy) || !emailReady}>{busy === "CART_RECOVERY" ? "PROCESSING…" : "PROCESS DUE CARTS"}</button><Link to="/admin/audience">View carts →</Link></div></section>

      <section className="phase29-lifecycle-card"><div className="phase29-lifecycle-card-head"><span><Icon name="bell" /></span><div><p>DEMAND SIGNAL</p><h2>Back in stock</h2></div></div><div className="phase29-lifecycle-stats"><div><strong>{overview.pendingStock}</strong><small>Pending alerts</small></div><div><strong>{overview.readyStock}</strong><small>Ready to send</small></div></div><p>Restocked variants trigger email automatically when inventory is updated. Signed-in customers also receive an in-app notification.</p><div className="phase29-lifecycle-actions"><button className="button button-secondary" onClick={() => run("STOCK_ALERTS")} disabled={Boolean(busy) || !emailReady}>{busy === "STOCK_ALERTS" ? "PROCESSING…" : "PROCESS READY STOCK"}</button><Link to="/admin/audience">View demand →</Link></div></section>

      <section className="phase29-lifecycle-card"><div className="phase29-lifecycle-card-head"><span><Icon name="tag" /></span><div><p>PRICE INTENT</p><h2>Price-drop watches</h2></div></div><div className="phase29-lifecycle-stats"><div><strong>{overview.pendingPrice}</strong><small>Pending watches</small></div><div><strong>{overview.eligiblePrice}</strong><small>Eligible now</small></div></div><p>Customers can watch any future drop or specify a lower target. Each watch is closed after a successful alert to avoid repeated spam.</p><div className="phase29-lifecycle-actions"><button className="button button-secondary" onClick={() => run("PRICE_ALERTS")} disabled={Boolean(busy) || !emailReady}>{busy === "PRICE_ALERTS" ? "PROCESSING…" : "PROCESS PRICE DROPS"}</button><Link to="/admin/audience">View watches →</Link></div></section>

      <section className="phase29-lifecycle-card phase38-lifecycle-refill"><div className="phase29-lifecycle-card-head"><span><Icon name="refresh" /></span><div><p>REPLENISHMENT</p><h2>Refill reminders</h2></div></div><div className="phase29-lifecycle-stats"><div><strong>{overview.activeRefills || 0}</strong><small>Active plans</small></div><div><strong>{overview.dueRefills || 0}</strong><small>Due now</small></div></div><p>Customers choose their own reminder cycle. Riseora never creates or charges a recurring order automatically.</p><div className="phase29-lifecycle-actions"><button className="button button-secondary" onClick={() => run("REFILLS")} disabled={Boolean(busy)}>{busy === "REFILLS" ? "PROCESSING…" : "PROCESS REFILLS"}</button><Link to="/admin/refills">View demand →</Link></div></section>
    </div>

    <section className="admin-panel phase29-lifecycle-notes"><div className="admin-panel-head"><div><h2>Production behaviour</h2><p>Safety rules currently enforced by the backend.</p></div></div><div className="phase29-rule-grid"><div><b>Cart recovery</b><span>Opt-in required · max 2 reminders · 7-day recovery link · prices and stock revalidated on restore.</span></div><div><b>Stock alerts</b><span>Sent only when the selected variant is active, its product is active and stock is greater than zero.</span></div><div><b>Price alerts</b><span>Triggered only below the price at subscription time; optional target must also be reached.</span></div><div><b>Refill reminders</b><span>Reminder-only workflow. Current price and stock are revalidated when a customer chooses to refill.</span></div><div><b>Signed-in customers</b><span>Eligible lifecycle emails are mirrored into the in-app notification center.</span></div></div></section>
  </>;
}
