import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {spawn} from 'node:child_process';import path from 'node:path';
async function scenario(handler){const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{return await new Promise((resolve,reject)=>{
const child=spawn(process.execPath,[path.resolve('scripts/phase96-public-site-audit.mjs'),`--url=http://127.0.0.1:${server.address().port}`]);let out='';child.stdout.on('data',x=>out+=x);child.on('error',reject);child.on('close',code=>resolve({code,out}));
});}finally{await new Promise(resolve=>server.close(resolve));}}
test('valid test homepage passes without submitting mutations', async()=>{const r=await scenario((req,res)=>{
 assert.equal(req.method,'GET');res.setHeader('Content-Type','text/html');
 if(req.url==='/')res.end('<html lang="en"><title>Riseora Herbs</title><meta name="description" content="Herbals"></html>');
 else if(req.url==='/robots.txt')res.end('User-agent: *\nAllow: /');else res.end('<urlset></urlset>');
});assert.equal(r.code,0,r.out);assert.match(r.out,/GO/);});
test('noindex homepage prevents GO',async()=>{const r=await scenario((req,res)=>{if(req.url==='/')res.end('<html lang="en"><title>Test Store</title><meta name="description" content="x"><meta name="robots" content="noindex"></html>');else res.end('<urlset></urlset>');});assert.notEqual(r.code,0);assert.match(r.out,/NO_GO/);});
