import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  analyticsConsent,
  analyticsEvents,
  getAnalyticsConfiguration,
  loadAnalytics,
  setAnalyticsConsent,
  trackPage,
} from "../lib/analytics";

export function PageAnalytics() {
  const location = useLocation();

  useEffect(() => { loadAnalytics(); }, []);

  useEffect(() => {
    if (analyticsConsent() === "accepted") trackPage(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}

export function AnalyticsConsent() {
  const [choice, setChoice] = useState(() => analyticsConsent());
  const [forcedOpen, setForcedOpen] = useState(false);

  useEffect(() => {
    const events = analyticsEvents();
    const sync = () => setChoice(analyticsConsent());
    const open = () => setForcedOpen(true);
    window.addEventListener(events.consent, sync);
    window.addEventListener(events.open, open);
    return () => {
      window.removeEventListener(events.consent, sync);
      window.removeEventListener(events.open, open);
    };
  }, []);

  if (choice && !forcedOpen) return null;

  const config = getAnalyticsConfiguration();
  const analyticsConfigured = Boolean(config.gaMeasurementId || config.metaPixelId);

  function choose(value) {
    setAnalyticsConsent(value);
    setChoice(value);
    setForcedOpen(false);
  }

  return (
    <div className="consent-banner" role="dialog" aria-modal="true" aria-label="Privacy and analytics preference">
      <div>
        <strong>Your privacy matters</strong>
        <p>
          Essential shopping storage keeps your cart, account and checkout working. Optional analytics helps Riseora understand storefront performance and is loaded only after you allow it.
        </p>
        {!analyticsConfigured && <small>Analytics providers are not configured yet, so choosing either option does not load third-party tracking.</small>}
      </div>
      <div className="consent-actions">
        {choice && <button className="link-button" type="button" onClick={() => setForcedOpen(false)}>Keep current choice</button>}
        <button className="button button-secondary" type="button" onClick={() => choose("essential")}>Essential only</button>
        <button className="button" type="button" onClick={() => choose("accepted")}>Allow analytics</button>
      </div>
    </div>
  );
}
