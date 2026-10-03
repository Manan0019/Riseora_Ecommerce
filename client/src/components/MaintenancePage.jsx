import { useStore } from "../context/StoreContext";

export default function MaintenancePage() {
  const { store } = useStore();
  return (
    <main className="phase47-maintenance-shell">
      <section className="phase47-maintenance-card">
        <div className="phase47-maintenance-mark">R</div>
        <p className="eyebrow">RISEORA HERBALS</p>
        <h1>We're polishing the store.</h1>
        <p className="phase47-maintenance-copy">{store.maintenanceMessage || "Riseora is briefly unavailable while we complete scheduled maintenance. Please check back shortly."}</p>
        {store.maintenanceEndsAt && <div className="phase47-maintenance-time"><small>Expected availability</small><strong>{new Date(store.maintenanceEndsAt).toLocaleString()}</strong></div>}
        <div className="phase47-maintenance-actions">
          <a className="button" href="/help">Help Center</a>
          {store.supportEmail && <a className="button button-secondary" href={`mailto:${store.supportEmail}`}>Contact support</a>}
        </div>
        <p className="phase47-maintenance-note">Existing orders and account data remain safe during maintenance.</p>
      </section>
    </main>
  );
}
