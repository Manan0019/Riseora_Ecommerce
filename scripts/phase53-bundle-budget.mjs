import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "client", "dist");
const assets = path.join(dist, "assets");
const MAX_JS_CHUNK_BYTES = 380 * 1024;
const MAX_CSS_CHUNK_BYTES = 380 * 1024;
const MAX_TOTAL_JS_BYTES = 900 * 1024;

function fail(message) { console.error(`FAIL  ${message}`); process.exitCode = 1; }
function pass(message) { console.log(`PASS  ${message}`); }
function kb(bytes) { return `${(bytes / 1024).toFixed(1)} kB`; }

if (!fs.existsSync(path.join(dist, "index.html")) || !fs.existsSync(assets)) {
  console.error("FAIL  client/dist is missing. Run npm run build before the Phase 53 bundle budget.");
  process.exit(1);
}

const files = fs.readdirSync(assets).map((name) => ({ name, bytes: fs.statSync(path.join(assets, name)).size }));
const js = files.filter((item) => item.name.endsWith(".js"));
const css = files.filter((item) => item.name.endsWith(".css"));
const largestJs = js.sort((a, b) => b.bytes - a.bytes)[0] || { name: "none", bytes: 0 };
const largestCss = css.sort((a, b) => b.bytes - a.bytes)[0] || { name: "none", bytes: 0 };
const totalJs = js.reduce((sum, item) => sum + item.bytes, 0);

largestJs.bytes <= MAX_JS_CHUNK_BYTES ? pass(`largest JS chunk · ${largestJs.name} · ${kb(largestJs.bytes)}`) : fail(`largest JS chunk ${kb(largestJs.bytes)} exceeds ${kb(MAX_JS_CHUNK_BYTES)}`);
largestCss.bytes <= MAX_CSS_CHUNK_BYTES ? pass(`largest CSS chunk · ${largestCss.name} · ${kb(largestCss.bytes)}`) : fail(`largest CSS chunk ${kb(largestCss.bytes)} exceeds ${kb(MAX_CSS_CHUNK_BYTES)}`);
totalJs <= MAX_TOTAL_JS_BYTES ? pass(`total emitted JS · ${kb(totalJs)}`) : fail(`total emitted JS ${kb(totalJs)} exceeds ${kb(MAX_TOTAL_JS_BYTES)}`);
js.length >= 20 ? pass(`route/code splitting preserved · ${js.length} JS chunks`) : fail(`route/code splitting regressed · only ${js.length} JS chunks`);

if (process.exitCode) {
  console.error("\nPhase 53 bundle budget: FAIL");
  process.exit(process.exitCode);
}
console.log("\nPhase 53 bundle budget: PASS");
