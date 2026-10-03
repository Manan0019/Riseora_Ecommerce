const apiBase = String(process.env.API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
const siteBase = String(process.env.SITE_BASE_URL || apiBase.replace(/\/api$/, "")).replace(/\/$/, "");
const checks = [
  ["API liveness", `${apiBase}/health/live`],
  ["API readiness", `${apiBase}/health/ready`],
  ["Store config", `${apiBase}/store/config`],
  ["Categories", `${apiBase}/categories`],
  ["Products", `${apiBase}/products`],
  ["Offers", `${apiBase}/promotions`],
  ["Sitemap", `${siteBase}/sitemap.xml`],
  ["Robots", `${siteBase}/robots.txt`],
];
let failed = false;
for (const [label, url] of checks) {
  try {
    const started = performance.now();
    const response = await fetch(url, { headers: { Accept: label === "Sitemap" || label === "Robots" ? "text/plain,*/*" : "application/json" } });
    const elapsed = Math.round(performance.now() - started);
    if (!response.ok) { failed = true; console.error(`FAIL  ${label} · HTTP ${response.status} · ${url}`); continue; }
    console.log(`PASS  ${label} · ${response.status} · ${elapsed} ms`);
  } catch (error) {
    failed = true;
    console.error(`FAIL  ${label} · ${error.message} · ${url}`);
  }
}
console.log(`\nPhase 47 smoke test: ${failed ? "FAIL" : "PASS"}`);
if (failed) process.exit(1);
