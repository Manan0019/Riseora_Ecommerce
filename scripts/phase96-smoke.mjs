import { setTimeout as delay } from "node:timers/promises";
const args=process.argv.slice(2);
const value=(name)=>args.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3);
const raw = value("url") || process.env.PHASE96_SMOKE_URL;
if (!raw) { console.error("Usage: npm run launch:smoke -- --url=https://your-domain.example"); process.exit(2); }
let base;
try { base = new URL(raw); if(!["http:","https:"].includes(base.protocol) || base.username || base.password) throw Error(); }
catch { console.error("FAIL  Invalid public smoke URL"); process.exit(2); }
const local = ["localhost","127.0.0.1","::1"].includes(base.hostname.replace(/[\[\]]/g,""));
if (!local && base.protocol !== "https:") { console.error("FAIL  Public smoke target requires HTTPS"); process.exit(2); }
const explicitPrefix = value("system-prefix");
const prefixes = explicitPrefix ? [explicitPrefix] : ["/api/system", "/system", "", "/api"];
const checks = [
  {path:"/health/live", expected:[200], label:"Liveness"},
  {path:"/health/ready", expected:[200], label:"Readiness"},
  {path:"/release", expected:[200], label:"Release metadata"},
];
let failures=0;
for (const check of checks) {
  let ok=false, status="NETWORK_ERROR", elapsed=0, resolvedPath="";
  for (const prefix of prefixes) {
    const endpoint = new URL(`${prefix.replace(/\/$/, "")}${check.path}`, base.origin);
    for(let i=0;i<2;i++) {
      const start=Date.now();
      try { const res=await fetch(endpoint,{method:"GET",redirect:"manual",headers:{"Accept":"application/json","Cache-Control":"no-cache"},signal:AbortSignal.timeout(7000)}); status=res.status;elapsed=Date.now()-start;
        const payload=await res.text();
        const json = payload.trimStart().startsWith("{") || payload.trimStart().startsWith("[");
        ok=check.expected.includes(res.status) && payload.length<500_000 && json;
        if(ok) { resolvedPath = endpoint.pathname; break; }
      } catch {status="NETWORK_ERROR";elapsed=Date.now()-start;}
      if(i===0) await delay(250);
    }
    if(ok)break;
  }
  console.log(`${ok?"PASS":"FAIL"}  ${check.label} · ${status} · ${elapsed}ms${ok?` · ${resolvedPath}`:""}`);
  if(!ok) failures++;
}
console.log(`Phase 96 read-only smoke: ${failures?"FAIL":"PASS"} (${failures} failures)`);
if(failures)process.exit(1);
