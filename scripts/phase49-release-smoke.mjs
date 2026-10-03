const apiBase = String(process.env.API_BASE_URL || "http://localhost:5000/api").replace(/\/$/, "");
const siteBase = String(process.env.SITE_BASE_URL || apiBase.replace(/\/api$/, "")).replace(/\/$/, "");
let failed = false;

async function expectOk(label, url, accept = "application/json") {
  try {
    const started = performance.now();
    const response = await fetch(url, { headers: { Accept: accept } });
    const elapsed = Math.round(performance.now() - started);
    if (!response.ok) { failed = true; console.error(`FAIL  ${label} · HTTP ${response.status} · ${url}`); return; }
    console.log(`PASS  ${label} · ${response.status} · ${elapsed} ms`);
  } catch (error) { failed = true; console.error(`FAIL  ${label} · ${error.message} · ${url}`); }
}

await expectOk("API liveness", `${apiBase}/health/live`);
await expectOk("API readiness", `${apiBase}/health/ready`);
await expectOk("Release metadata", `${apiBase}/release`);
await expectOk("Store config", `${apiBase}/store/config`);
await expectOk("Categories", `${apiBase}/categories`);
await expectOk("Products", `${apiBase}/products`);
await expectOk("Storefront entry", `${siteBase}/`, "text/html,*/*");

try {
  const response = await fetch(`${siteBase}/account/security`, { headers: { Accept: "text/html" }, redirect: "manual" });
  const type = response.headers.get("content-type") || "";
  if (response.status === 200 && type.includes("text/html")) console.log("PASS  SPA direct-route fallback · /account/security");
  else { failed = true; console.error(`FAIL  SPA direct-route fallback · HTTP ${response.status} · content-type ${type}`); }
} catch (error) { failed = true; console.error(`FAIL  SPA direct-route fallback · ${error.message}`); }

try {
  const response = await fetch(`${apiBase}/__phase49_missing_route__`, { headers: { Accept: "application/json" } });
  const type = response.headers.get("content-type") || "";
  if (response.status === 404 && type.includes("application/json")) console.log("PASS  API 404 remains API JSON 404");
  else { failed = true; console.error(`FAIL  API 404 contract · HTTP ${response.status} · content-type ${type}`); }
} catch (error) { failed = true; console.error(`FAIL  API 404 contract · ${error.message}`); }

console.log(`\nPhase 49 release smoke test: ${failed ? "FAIL" : "PASS"}`);
if (failed) process.exit(1);
