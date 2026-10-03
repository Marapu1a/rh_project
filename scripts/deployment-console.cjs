// Loopback MetaMask handoff. Read-only review by default; separate explicit signing flag.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{randomBytes}=require('node:crypto'),{ethers:E}=require('ethers');
async function main(){
 const [planFile,journal,...flags]=process.argv.slice(2);if(!planFile||!journal||flags.some(f=>f!=='--enable-signing'))throw Error('Arguments');
 const plan=JSON.parse(fs.readFileSync(planFile)),settings=require('../config/pons-deployment-candidate.json');
 if(plan.settingsHash!==require('./direct-buy.cjs').hash(settings))throw Error('Settings changed');
 const rpcUrl=process.env.RH_RPC_URL;if(new URL(rpcUrl).protocol!=='https:')throw Error('HTTPS required');
 const req=new E.FetchRequest(rpcUrl);req.timeout=20000;const provider=new E.JsonRpcProvider(req,undefined,{cacheTimeout:-1});
 const lock=journal+'.service.lock';fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
 const key=randomBytes(24).toString('hex'),port=4176,origin=`http://127.0.0.1:${port}`;
 const queue=require('./deployment-signing-queue.cjs').create({plan,file:journal,provider,allowSend:flags.includes('--enable-signing'),check:async()=>{
  const report=await require('./pons-launch-preflight.cjs').inspect(provider,settings,require('../docs/evidence/PONS_DEPENDENCIES_2026-10-03.json'));
  if(report.status!=='snapshotMatched'||report.launch.economics!==plan.economics||report.launch.feeWei!==plan.launchFeeWei)throw Error('Preflight changed');
  const factory=new E.Contract(report.contracts.factory.address,require('./integrations/pons-v2.cjs').FAB,provider);
  const params=[settings.metadata.name,settings.metadata.symbol,settings.metadata.logo,settings.metadata.description,settings.metadata.socials,plan.transactions[1].predictedAddress,300,false,plan.economics,plan.salt];
  const predicted=await factory.launchToken.staticCall(params,0,report.contracts.quote.address,{from:plan.governor,value:BigInt(plan.launchFeeWei)});
  if(predicted[0].toLowerCase()!==plan.token.toLowerCase()||predicted[1].toLowerCase()!==plan.curve.toLowerCase())throw Error('Launch prediction changed');
 }});
 const assets=path.join(__dirname,'deployment-console');
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403).end();return;}
  if(req.method==='GET'&&['/','/app.js'].includes(req.url)){res.setHeader('Content-Type',req.url==='/'?'text/html; charset=utf-8':'text/javascript');res.end(fs.readFileSync(path.join(assets,req.url==='/'?'index.html':'app.js')));return;}
  if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-qianqi-session']!==key){res.writeHead(403).end();return;}
  try{
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)throw Error('Size');}const input=JSON.parse(body||'{}');
   let value;if(req.url==='/view')value=queue.view();else if(req.url==='/prepare')value=await queue.prepare();else if(req.url==='/intent')value=await queue.arm(input.id);else if(req.url==='/submitted')value=await queue.submitted(input.hash);else if(req.url==='/refresh')value=await queue.refresh();else{res.writeHead(404).end();return;}
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
  }catch{res.writeHead(409,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Проверка не пройдена. Сохранённое состояние не сбрасывайте; сообщите разработчику.'}));}
 });
 let closing=false;const close=()=>{if(closing)return;closing=true;server.close();server.closeAllConnections();provider.destroy();if(fs.readFileSync(lock,'utf8')===String(process.pid))fs.unlinkSync(lock);};
 process.once('SIGINT',close);process.once('SIGTERM',close);
 server.once('error',()=>{close();process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>{console.log(`Deployment review: ${origin}/#${key}`);console.log('Signing enabled: '+flags.includes('--enable-signing'));});
}
if(require.main===module)main().catch(()=>{console.error('Deployment console refused startup; secrets omitted');process.exitCode=1;});
