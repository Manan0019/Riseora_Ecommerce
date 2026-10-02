const CONSENT_KEY = "riseora_analytics_consent";
const OPEN_EVENT = "riseora-open-privacy";
const CONSENT_EVENT = "riseora-consent-change";

let loaded = false;
let configuration = {
  gaMeasurementId: String(import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim(),
  metaPixelId: String(import.meta.env.VITE_META_PIXEL_ID || "").trim(),
};

const privateKeys = new Set([
  "email", "customer_email", "phone", "customer_phone", "customer_name", "first_name", "last_name",
  "address", "line1", "line2", "postal_code", "postcode", "zip", "ip", "ip_address",
]);

function storageGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* optional preference persistence */ }
}

function storageRemove(key) {
  try { window.localStorage.removeItem(key); } catch { /* optional preference persistence */ }
}

function cleanValue(value, key = "") {
  if (privateKeys.has(String(key).toLowerCase())) return undefined;
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => cleanValue(item)).filter((item) => item !== undefined);
  if (typeof value === "object") {
    const next = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const cleaned = cleanValue(childValue, childKey);
      if (cleaned !== undefined) next[childKey] = cleaned;
    }
    return next;
  }
  return undefined;
}

function metaContents(params = {}) {
  const items = Array.isArray(params.items) ? params.items : [];
  return items.map((item) => ({
    id: String(item.item_id || item.id || ""),
    quantity: Number(item.quantity || 1),
    item_price: Number(item.price || 0),
  })).filter((item) => item.id);
}


function applyProviderConsent(value) {
  const granted = value === "accepted";
  const ga = configuration.gaMeasurementId;
  if (ga) {
    window[`ga-disable-${ga}`] = !granted;
    if (window.gtag) window.gtag("consent", "update", { analytics_storage: granted ? "granted" : "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  }
  if (window.fbq) window.fbq("consent", granted ? "grant" : "revoke");
}

function trackMeta(name, params) {
  if (!window.fbq || !configuration.metaPixelId) return;
  const common = {
    value: Number(params.value || 0) || undefined,
    currency: params.currency || "INR",
    content_ids: (params.items || []).map((item) => String(item.item_id || item.id || "")).filter(Boolean),
    contents: metaContents(params),
    content_type: "product",
  };

  const mapping = {
    page_view: ["PageView", {}],
    view_item: ["ViewContent", common],
    add_to_cart: ["AddToCart", common],
    begin_checkout: ["InitiateCheckout", common],
    purchase: ["Purchase", common],
    search: ["Search", { search_string: params.search_term || "" }],
    add_to_wishlist: ["AddToWishlist", common],
  };
  const target = mapping[name];
  if (target) window.fbq("track", target[0], target[1]);
}

export function analyticsConsent() {
  return storageGet(CONSENT_KEY);
}

export function configureAnalytics(next = {}) {
  configuration = {
    gaMeasurementId: String(next.gaMeasurementId ?? configuration.gaMeasurementId ?? "").trim(),
    metaPixelId: String(next.metaPixelId ?? configuration.metaPixelId ?? "").trim(),
  };
  if (analyticsConsent() === "accepted") loadAnalytics();
}

export function getAnalyticsConfiguration() {
  return { ...configuration, consent: analyticsConsent(), loaded };
}

export function setAnalyticsConsent(value) {
  if (!new Set(["accepted", "essential"]).has(value)) return;
  storageSet(CONSENT_KEY, value);
  window.dispatchEvent(new Event(CONSENT_EVENT));
  applyProviderConsent(value);
  if (value === "accepted") loadAnalytics();
}

export function clearAnalyticsConsent() {
  storageRemove(CONSENT_KEY);
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export function openAnalyticsPreferences() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function analyticsEvents() {
  return { open: OPEN_EVENT, consent: CONSENT_EVENT };
}

export function loadAnalytics() {
  if (loaded || analyticsConsent() !== "accepted") return;
  loaded = true;

  const ga = configuration.gaMeasurementId;
  if (ga) {
    window[`ga-disable-${ga}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", ga, { send_page_view: false, anonymize_ip: true });
    if (!document.querySelector(`script[data-riseora-ga="${ga}"]`)) {
      const script = document.createElement("script");
      script.async = true;
      script.dataset.riseoraGa = ga;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`;
      document.head.appendChild(script);
    }
  }

  const pixel = configuration.metaPixelId;
  if (pixel) {
    const fbq = window.fbq = window.fbq || function fbq() {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
      else fbq.queue.push(arguments);
    };
    if (!fbq.queue) fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    if (!document.querySelector('script[data-riseora-meta="true"]')) {
      const script = document.createElement("script");
      script.async = true;
      script.dataset.riseoraMeta = "true";
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(script);
    }
    fbq("init", pixel);
    fbq("consent", "grant");
  }
}

export function trackPage(path) {
  if (analyticsConsent() !== "accepted") return;
  loadAnalytics();
  const cleanPath = String(path || window.location.pathname).slice(0, 500);
  if (configuration.gaMeasurementId && window.gtag) {
    window.gtag("event", "page_view", { page_path: cleanPath, page_location: window.location.href, page_title: document.title });
  }
  trackMeta("page_view", {});
}

export function trackEvent(name, params = {}) {
  if (analyticsConsent() !== "accepted") return;
  loadAnalytics();
  const cleanName = String(name || "").trim().slice(0, 80);
  if (!cleanName) return;
  const cleanParams = cleanValue(params) || {};
  if (configuration.gaMeasurementId && window.gtag) window.gtag("event", cleanName, cleanParams);
  trackMeta(cleanName, cleanParams);
}

export function analyticsItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    item_id: String(item.sku || item.variantId || item.id || ""),
    item_name: String(item.productName || item.name || "Riseora product").slice(0, 160),
    item_variant: String(item.variantName || item.variant || "").slice(0, 120),
    price: Number(item.price ?? item.sellingPrice ?? 0),
    quantity: Math.max(1, Number(item.quantity || 1)),
  })).filter((item) => item.item_id);
}

export function trackCommerce(name, { items = [], value, currency = "INR", ...rest } = {}) {
  const normalizedItems = analyticsItems(items);
  const calculatedValue = value == null
    ? normalizedItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0)
    : Number(value || 0);
  trackEvent(name, { currency, value: Number(calculatedValue.toFixed(2)), items: normalizedItems, ...rest });
}

export function trackPurchase({ transactionId, items = [], value, currency = "INR", ...rest }) {
  const id = String(transactionId || "").trim();
  if (!id || analyticsConsent() !== "accepted") return;
  const dedupeKey = `riseora_analytics_purchase:${id}`;
  try { if (window.sessionStorage.getItem(dedupeKey)) return; } catch { /* best effort */ }
  trackCommerce("purchase", { items, value, currency, transaction_id: id, ...rest });
  try { window.sessionStorage.setItem(dedupeKey, "1"); } catch { /* best effort */ }
}
