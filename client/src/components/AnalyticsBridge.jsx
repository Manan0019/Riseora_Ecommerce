import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { analyticsConsent, loadAnalytics, setAnalyticsConsent, trackPage } from "../lib/analytics";

export function PageAnalytics() {
  const location = useLocation();
  useEffect(() => { if (analyticsConsent() === "accepted") trackPage(`${location.pathname}${location.search}`); }, [location.pathname, location.search]);
  useEffect(() => { loadAnalytics(); }, []);
  return null;
}

export function AnalyticsConsent() {
  const [choice, setChoice] = useState(() => analyticsConsent());
  useEffect(() => { const sync = () => setChoice(analyticsConsent()); window.addEventListener("riseora-consent-change", sync); return () => window.removeEventListener("riseora-consent-change", sync); }, []);
  if (choice) return null;
  function choose(value) { setAnalyticsConsent(value); setChoice(value); }
  return <div className="consent-banner" role="dialog" aria-label="Analytics preference"><div><strong>Your privacy matters</strong><p>Riseora uses optional analytics only with your permission to understand storefront performance. Essential shopping features work without analytics.</p></div><div className="consent-actions"><button className="button button-secondary" onClick={() => choose("essential")}>Essential only</button><button className="button" onClick={() => choose("accepted")}>Allow analytics</button></div></div>;
}
