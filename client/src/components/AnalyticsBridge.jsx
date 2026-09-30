import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const CONSENT_KEY = "riseora_analytics_consent";
let analyticsLoaded = false;

function getConsent() {
  try {
    return window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

function setConsent(value) {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Analytics is optional; storage failures must never break the storefront.
  }

  window.dispatchEvent(new Event("riseora-consent-change"));

  if (value === "accepted") {
    loadAnalytics();
  }
}

function loadAnalytics() {
  try {
    if (analyticsLoaded || getConsent() !== "accepted") return;

    analyticsLoaded = true;

    const ga = import.meta.env.VITE_GA_MEASUREMENT_ID;
    if (ga) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };

      window.gtag("js", new Date());
      window.gtag("config", ga, { send_page_view: false });

      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`;
      document.head.appendChild(script);
    }

    const pixel = import.meta.env.VITE_META_PIXEL_ID;
    if (pixel) {
      const fbq = (window.fbq =
        window.fbq ||
        function fbq() {
          if (fbq.callMethod) {
            fbq.callMethod.apply(fbq, arguments);
          } else {
            fbq.queue.push(arguments);
          }
        });

      if (!fbq.queue) fbq.queue = [];
      fbq.loaded = true;
      fbq.version = "2.0";

      const script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(script);

      fbq("init", pixel);
    }
  } catch (error) {
    console.warn("Optional analytics could not be loaded:", error);
  }
}

function trackPage(path) {
  try {
    loadAnalytics();

    const ga = import.meta.env.VITE_GA_MEASUREMENT_ID;
    if (ga && window.gtag) {
      window.gtag("event", "page_view", {
        page_path: path,
        page_location: window.location.href,
      });
    }

    if (import.meta.env.VITE_META_PIXEL_ID && window.fbq) {
      window.fbq("track", "PageView");
    }
  } catch (error) {
    console.warn("Optional page analytics failed:", error);
  }
}

export function PageAnalytics() {
  const location = useLocation();

  useEffect(() => {
    if (getConsent() === "accepted") {
      trackPage(`${location.pathname}${location.search}`);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    loadAnalytics();
  }, []);

  return null;
}

export function AnalyticsConsent() {
  const [choice, setChoice] = useState(() => getConsent());

  useEffect(() => {
    const sync = () => setChoice(getConsent());
    window.addEventListener("riseora-consent-change", sync);
    return () => window.removeEventListener("riseora-consent-change", sync);
  }, []);

  if (choice) return null;

  function choose(value) {
    setConsent(value);
    setChoice(value);
  }

  return (
    <div className="consent-banner" role="dialog" aria-label="Analytics preference">
      <div>
        <strong>Your privacy matters</strong>
        <p>
          Riseora uses optional analytics only with your permission to understand storefront
          performance. Essential shopping features work without analytics.
        </p>
      </div>
      <div className="consent-actions">
        <button className="button button-secondary" onClick={() => choose("essential")}>
          Essential only
        </button>
        <button className="button" onClick={() => choose("accepted")}>
          Allow analytics
        </button>
      </div>
    </div>
  );
}
