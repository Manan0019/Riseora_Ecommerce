const CONSENT_KEY = "riseora_analytics_consent";
let loaded = false;
export function analyticsConsent() { return localStorage.getItem(CONSENT_KEY); }
export function setAnalyticsConsent(value) { localStorage.setItem(CONSENT_KEY, value); window.dispatchEvent(new Event("riseora-consent-change")); if (value === "accepted") loadAnalytics(); }

export function loadAnalytics() {
  if (loaded || analyticsConsent() !== "accepted") return;
  loaded = true;
  const ga = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (ga) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ window.dataLayer.push(arguments); };
    window.gtag("js", new Date()); window.gtag("config", ga, { send_page_view: false });
    const script = document.createElement("script"); script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`; document.head.appendChild(script);
  }
  const pixel = import.meta.env.VITE_META_PIXEL_ID;
  if (pixel) {
    const fbq = window.fbq = window.fbq || function(){ if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments); else fbq.queue.push(arguments); };
    if (!fbq.queue) fbq.queue = []; fbq.loaded = true; fbq.version = "2.0";
    const script = document.createElement("script"); script.async = true; script.src = "https://connect.facebook.net/en_US/fbevents.js"; document.head.appendChild(script);
    fbq("init", pixel);
  }
}
export function trackPage(path) { loadAnalytics(); const ga = import.meta.env.VITE_GA_MEASUREMENT_ID; if (ga && window.gtag) window.gtag("event", "page_view", { page_path: path, page_location: window.location.href }); if (import.meta.env.VITE_META_PIXEL_ID && window.fbq) window.fbq("track", "PageView"); }
export function trackEvent(name, params = {}) { loadAnalytics(); if (window.gtag) window.gtag("event", name, params); }
