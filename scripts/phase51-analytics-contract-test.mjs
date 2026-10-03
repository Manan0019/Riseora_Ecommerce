import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const analyticsPath = path.join(root, "client", "src", "analytics.js");
const expected = [
  "analyticsConsent",
  "configureAnalytics",
  "getAnalyticsConfiguration",
  "setAnalyticsConsent",
  "clearAnalyticsConsent",
  "openAnalyticsPreferences",
  "analyticsEvents",
  "loadAnalytics",
  "trackPage",
  "trackEvent",
  "analyticsItems",
  "trackCommerce",
  "trackPurchase",
];

if (!fs.existsSync(analyticsPath)) throw new Error("client/src/analytics.js is missing");
const original = fs.readFileSync(analyticsPath, "utf8");
const transformed = original.replaceAll("import.meta.env", "globalThis.__RISEORA_ANALYTICS_TEST_ENV__");
const temp = path.join(os.tmpdir(), `riseora-phase51-analytics-${process.pid}-${Date.now()}.mjs`);

try {
  globalThis.__RISEORA_ANALYTICS_TEST_ENV__ = {};
  fs.writeFileSync(temp, transformed, "utf8");
  const module = await import(`${pathToFileURL(temp).href}?phase51=${Date.now()}`);
  const missing = expected.filter((name) => typeof module[name] !== "function");
  if (missing.length) throw new Error(`Missing callable analytics exports: ${missing.join(", ")}`);

  const config = module.getAnalyticsConfiguration();
  if (!config || typeof config !== "object") throw new Error("getAnalyticsConfiguration did not return an object");
  if (module.analyticsConsent() !== null) throw new Error("analyticsConsent should be null in a clean non-browser test runtime");
  const events = module.analyticsEvents();
  if (!events?.open || !events?.consent) throw new Error("analyticsEvents contract is incomplete");

  const items = module.analyticsItems([{ id: "P51", name: "Contract test", price: 99, quantity: 2 }]);
  if (items.length !== 1 || items[0].item_id !== "P51" || items[0].quantity !== 2) throw new Error("analyticsItems normalization failed");

  // With no analytics consent, commerce tracking must safely no-op even outside a browser.
  module.trackCommerce("add_to_cart", { items: [{ id: "P51", price: 99, quantity: 1 }] });

  console.log(`PASS  ${expected.length} canonical analytics exports execute`);
  console.log("PASS  analytics configuration contract");
  console.log("PASS  consent-denied tracking is browser-independent and safe");
  console.log("\nPhase 51 analytics contract test: PASS");
} finally {
  try { fs.unlinkSync(temp); } catch {}
  delete globalThis.__RISEORA_ANALYTICS_TEST_ENV__;
}
