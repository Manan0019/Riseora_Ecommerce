import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import path from "node:path";
async function withServer(responder,run) {
 const server=createServer(responder);
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try {return await run(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(ok=>server.close(ok));}
}
async function call(url){return await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[path.resolve('scripts/phase96-smoke.mjs'),`--url=${url}`,`--system-prefix=/api/system`],{cwd:process.cwd()});
 let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));
});}
test("smoke reads three live system endpoints without writes", async()=>withServer((req,res)=>{
 assert.equal(req.method,'GET');assert(req.url.startsWith('/api/system/'));
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({success:true}));
},async url=>{const r=await call(url);assert.equal(r.code,0,r.stdout+r.stderr);assert.match(r.stdout,/read-only smoke: PASS/);}));
test("smoke refuses SPA HTML instead of real API",async()=>withServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<html>not API</html>');},async url=>{const r=await call(url);assert.notEqual(r.code,0);assert.match(r.stdout,/FAIL/);}));
