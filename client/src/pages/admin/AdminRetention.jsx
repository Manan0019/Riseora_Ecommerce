import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/http";
import { Icon } from "../../components/Icons";

const blank = { segment: "ALL_ACTIVE", title: "", message: "", ctaLabel: "Shop now", ctaUrl: "/shop" };

export default function AdminRetention() {
  const [segments, setSegments] = useState([]);
  const [form, setForm] = useState(blank);
  const [preview, setPreview] = useState([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [routine, setRoutine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadSegments() {
    const response = await apiFetch("/admin/retention/segments");
    setSegments(response.data || []);
  }
  async function loadRoutine() {
    const response = await apiFetch("/admin/retention/routine-intelligence");
    setRoutine(response.data || null);
  }
  async function loadPreview(segment) {
    const response = await apiFetch(`/admin/retention/segments/${segment}`);
    setPreview(response.data || []); setPreviewTotal(Number(response.total || 0));
  }
  useEffect(() => { Promise.all([loadSegments(), loadPreview(form.segment), loadRoutine()]).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!loading) loadPreview(form.segment).catch((e) => setError(e.message)); }, [form.segment]);

  const selected = useMemo(() => segments.find((item) => item.key === form.segment), [segments, form.segment]);

  async function sendCampaign(event) {
    event.preventDefault(); setError(""); setMessage("");
    if (!window.confirm(`Send this in-app notification to ${previewTotal} customer${previewTotal === 1 ? "" : "s"} in “${selected?.label || form.segment}”?`)) return;
    setSending(true);
    try {
      const response = await apiFetch("/admin/retention/campaigns/in-app", { method: "POST", body: JSON.stringify(form) });
      setMessage(`Campaign delivered to ${response.data.delivered} customer account${response.data.delivered === 1 ? "" : "s"}.`);
      setForm((current) => ({ ...blank, segment: current.segment }));
    } catch (e) { setError(e.message); } finally { setSending(false); }
  }

  return <>
    <div className="admin-page-heading phase27-retention-heading"><div><p className="eyebrow">RETENTION</p><h1>Customer intelligence</h1><p>Use real order behaviour to understand audiences and send targeted in-app campaigns.</p></div><span className="phase27-live-badge"><i /> LIVE DATA</span></div>
    {message && <p className="alert success">{message}</p>}{error && <p className="alert error">{error}</p>}
    <section className="phase27-segment-grid">{segments.map((item) => <button type="button" className={form.segment === item.key ? "active" : ""} key={item.key} onClick={() => setForm((v) => ({ ...v, segment: item.key }))}><small>{item.label}</small><strong>{item.count}</strong><span>{item.description}</span></button>)}</section>

    {routine && <section className="admin-panel phase59-retention-routine"><div className="admin-panel-head"><div><p className="eyebrow">PHASE 59 · ROUTINE INTELLIGENCE</p><h2>Retention opportunities</h2><p>Live refill timing and loyalty momentum from existing customer activity. No automatic campaign is sent from this panel.</p></div><Icon name="sparkles" /></div><div className="phase59-retention-metrics"><article><small>ACTIVE REMINDERS</small><strong>{routine.activeReminders}</strong><span>{routine.customersWithActiveReminders} customers</span></article><article><small>DUE NOW</small><strong>{routine.dueReminders}</strong><span>refills ready for attention</span></article><article><small>NEXT 7 DAYS</small><strong>{routine.next7Reminders}</strong><span>upcoming refill moments</span></article><article><small>NEXT 30 DAYS</small><strong>{routine.next30Reminders}</strong><span>future refill moments</span></article><article><small>PAUSED</small><strong>{routine.pausedReminders}</strong><span>customer-controlled pauses</span></article><article><small>NEAR REWARD</small><strong>{routine.nearRewardCustomers}</strong><span>{routine.rewardThresholdPoints ? `75%+ of ${routine.rewardThresholdPoints} pts` : "reward target not configured"}</span></article></div></section>}

    <div className="phase27-retention-layout">
      <form className="admin-panel phase27-campaign-composer" onSubmit={sendCampaign}>
        <div className="admin-panel-head"><div><h2>In-app campaign</h2><p>Messages appear in the customer notification centre. No email consent is required because this stays inside their signed-in Riseora account.</p></div><Icon name="bell" /></div>
        <label>Audience<select value={form.segment} onChange={(e) => setForm((v) => ({ ...v, segment: e.target.value }))}>{segments.map((item) => <option key={item.key} value={item.key}>{item.label} ({item.count})</option>)}</select></label>
        <label>Notification title<input required minLength="3" maxLength="100" value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} placeholder="A thoughtful Riseora update" /></label>
        <label>Message<textarea required minLength="5" maxLength="600" rows="5" value={form.message} onChange={(e) => setForm((v) => ({ ...v, message: e.target.value }))} placeholder="Keep it useful, clear and relevant to this audience." /><small>{form.message.length}/600</small></label>
        <div className="form-grid two"><label>CTA label<input maxLength="40" value={form.ctaLabel} onChange={(e) => setForm((v) => ({ ...v, ctaLabel: e.target.value }))} placeholder="Shop now" /></label><label>Internal CTA path<input value={form.ctaUrl} onChange={(e) => setForm((v) => ({ ...v, ctaUrl: e.target.value }))} placeholder="/shop" /><small>Use a Riseora path beginning with /</small></label></div>
        <div className="phase27-campaign-summary"><span><Icon name="user" size={17} /><b>{previewTotal}</b> recipients</span><span><Icon name="shield" size={17} />Account-only delivery</span></div>
        <button className="button wide" disabled={sending || !previewTotal}>{sending ? "Sending…" : `Send to ${previewTotal} customer${previewTotal === 1 ? "" : "s"}`}</button>
      </form>

      <section className="admin-panel phase27-segment-preview"><div className="admin-panel-head"><div><h2>{selected?.label || "Audience"}</h2><p>{selected?.description}</p></div><b>{previewTotal}</b></div>
        <div className="phase27-preview-list">{preview.slice(0, 20).map((customer) => <article key={customer.id}><div><strong>{customer.name}</strong><small>{customer.email}</small></div><span><b>₹{Number(customer.lifetimeValue || 0).toFixed(0)}</b><small>{customer.deliveredOrders} delivered · {customer.orderCount} orders</small></span></article>)}{!preview.length && <div className="admin-empty">No customers currently match this segment.</div>}</div>
        {previewTotal > 20 && <p className="phase27-preview-note">Showing 20 of {previewTotal} matching customers.</p>}
      </section>
    </div>
  </>;
}
