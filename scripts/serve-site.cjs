// Local website server with a fixed read-only API proxy. No signer, RPC or public exposure.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../web');
const files=new Map([['/','index.html'],['/app.js','app.js'],['/style.css','style.css'],...['mouse-thinking.png','mouse-happy.png','mouse-error.png','logo-cn.png','qianqi-logo.png','qianqi-preview.png'].map(n=>['/assets/'+n,'assets/'+n])]);
files.set('/concepts/hk/','concepts/hk/index.html');
files.set('/concepts/hk/style.css','concepts/hk/style.css');
files.set('/404.css','404.css');
files.set('/transparency/','transparency/index.html');
files.set('/transparency/style.css','transparency/style.css');
files.set('/overview.js','overview.js');
files.set('/claim.js','claim.js');
files.set('/vendor/ethers-6.17.0.min.js','vendor/ethers-6.17.0.min.js');
files.set('/notices/late-purchases-2026-10-04.html','notices/late-purchases-2026-10-04.html');
files.set('/notices/notice.css','notices/notice.css');
files.set('/evidence/purchases/','evidence/purchases/index.html');
for(const name of ['robots.txt','sitemap.xml','llms.txt'])files.set('/'+name,name);
function createSite({apiOrigin='http://127.0.0.1:8787',purchaseDemo=false,actions=null}={}){
 if(actions)require('../web/claim.js').config(actions);
 const routes=new Map(files);
 if(purchaseDemo)for(const name of ['index.html','style.css','review.js','demo.js'])routes.set('/purchase-demo/'+(name==='index.html'?'':name),'purchase-demo/'+name);
 const origin=new URL(apiOrigin);if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Invalid API origin');
 return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-src https://www.geckoterminal.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});res.end();return;}
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/site-actions.json'){
    const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(local?actions:null));return;
   }
   if(url.pathname==='/v1/overview'||/^\/v1\/wallets\/0x[\da-fA-F]{40}$/.test(url.pathname)){
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    try{const upstream=await fetch(new URL(url.pathname+url.search,origin),{signal:AbortSignal.timeout(8000),redirect:'error'});const body=await upstream.text();res.writeHead(upstream.status);res.end(body);}catch{res.writeHead(503);res.end(JSON.stringify({error:'unavailable'}));}return;
   }
   const file=routes.get(url.pathname);if(!file){res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(await fs.readFile(path.join(root,'404.html')));return;}
   const body=await fs.readFile(path.join(root,file));res.setHeader('Content-Type',file.endsWith('.txt')?'text/plain; charset=utf-8':file.endsWith('.xml')?'application/xml; charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'text/html; charset=utf-8');res.setHeader('Cache-Control','no-cache');res.end(body);
  }catch{res.writeHead(503);res.end('Unavailable');}
 });
}
if(require.main===module){const port=Number(process.env.PORT??4173);const actions=process.env.RH_SITE_ACTIONS_FILE?JSON.parse(require('node:fs').readFileSync(process.env.RH_SITE_ACTIONS_FILE,'utf8')):null;const server=createSite({apiOrigin:process.env.RH_STATUS_API_ORIGIN??'http://127.0.0.1:8787',purchaseDemo:process.env.RH_PURCHASE_DEMO==='1',actions});server.on('error',()=>{console.error('Website failed to listen');process.exitCode=1;});server.listen(port,'127.0.0.1',()=>console.log(`Website: http://127.0.0.1:${port}`));for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());}
module.exports={createSite};
