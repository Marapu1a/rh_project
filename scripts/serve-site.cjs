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
function createSite({apiOrigin='http://127.0.0.1:8787'}={}){
 const origin=new URL(apiOrigin);if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Invalid API origin');
 return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});res.end();return;}
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/v1/overview'||/^\/v1\/wallets\/0x[\da-fA-F]{40}$/.test(url.pathname)){
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    try{const upstream=await fetch(new URL(url.pathname+url.search,origin),{signal:AbortSignal.timeout(8000),redirect:'error'});const body=await upstream.text();res.writeHead(upstream.status);res.end(body);}catch{res.writeHead(503);res.end(JSON.stringify({error:'unavailable'}));}return;
   }
   const file=files.get(url.pathname);if(!file){res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(await fs.readFile(path.join(root,'404.html')));return;}
   const body=await fs.readFile(path.join(root,file));res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'text/html; charset=utf-8');res.setHeader('Cache-Control','no-cache');res.end(body);
  }catch{res.writeHead(503);res.end('Unavailable');}
 });
}
if(require.main===module){const port=Number(process.env.PORT??4173);const server=createSite({apiOrigin:process.env.RH_STATUS_API_ORIGIN??'http://127.0.0.1:8787'});server.on('error',()=>{console.error('Website failed to listen');process.exitCode=1;});server.listen(port,'127.0.0.1',()=>console.log(`Website: http://127.0.0.1:${port}`));for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());}
module.exports={createSite};
