/** Non-mutating storefront SEO/web readiness. No order placement, cookies or account data. */
const args=process.argv.slice(2),flag=k=>args.find(a=>a.startsWith(`--${k}=`))?.slice(k.length+3);
const raw=flag('url')||process.env.PHASE96_SMOKE_URL;
if(!raw){console.error('Usage: npm run launch:public -- --url=https://your-domain.example');process.exit(2);}
let root;try{root=new URL(raw);if(!['http:','https:'].includes(root.protocol)||root.username||root.password)throw Error();}
catch{console.error('NO_GO  Invalid public URL');process.exit(2);}
if(root.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(root.hostname)){console.error('NO_GO  Public site must use HTTPS');process.exit(2);}
const issues=[];
async function read(path){try{const response=await fetch(new URL(path,root.origin),{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'Accept':'text/html,text/plain,application/xml'}});const body=(await response.text()).slice(0,600000);return{status:response.status,body,headers:response.headers};}catch{return{status:0,body:'',headers:new Map()};}}
const home=await read('/');
if(home.status!==200)issues.push({level:'BLOCK',code:'HOME_STATUS',message:`Homepage response ${home.status}`});
if(!/<html[\s>]/i.test(home.body))issues.push({level:'BLOCK',code:'HOME_HTML',message:'Homepage is not HTML'});
if(!/<title>[\s\S]{3,160}<\/title>/i.test(home.body))issues.push({level:'WARN',code:'TITLE',message:'Homepage has no usable title'});
if(!/name=["']description["']/i.test(home.body))issues.push({level:'WARN',code:'DESCRIPTION',message:'Meta description not found'});
if(/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(home.body)||/noindex/i.test(home.headers.get?.('x-robots-tag')||''))issues.push({level:'BLOCK',code:'NOINDEX',message:'Public homepage may be intentionally hidden from search'});
if(!/<html[^>]+lang=["'][a-z]/i.test(home.body))issues.push({level:'WARN',code:'DOCUMENT_LANGUAGE',message:'HTML language attribute missing'});
const robots=await read('/robots.txt');if(robots.status!==200)issues.push({level:'WARN',code:'ROBOTS_TXT',message:'robots.txt is not available'});
else if(/^\s*Disallow:\s*\/\s*(?:#.*)?$/im.test(robots.body))issues.push({level:'WARN',code:'ROBOTS_DISALLOW',message:'Review robots rules for accidental site-wide disallow'});
const sitemap=await read('/sitemap.xml');if(sitemap.status!==200||!/<(?:urlset|sitemapindex)[\s>]/i.test(sitemap.body))issues.push({level:'WARN',code:'SITEMAP',message:'Sitemap is missing or invalid'});
if(root.protocol==='https:'&&!home.headers.get?.('strict-transport-security'))issues.push({level:'WARN',code:'HSTS',message:'HSTS header not found on homepage'});
const blocked=issues.filter(x=>x.level==='BLOCK').length;
for(const i of issues)console.log(`${i.level}  ${i.code} · ${i.message}`);
console.log(`Phase 96 public storefront: ${blocked?'NO_GO':issues.length?'REVIEW':'GO'} (${blocked} blockers, ${issues.length-blocked} warnings)`);
if(blocked)process.exit(1);
