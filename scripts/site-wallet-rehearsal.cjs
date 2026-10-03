// Disposable, loopback-only wallet rehearsal. No remote chain, real funds or private user keys.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {ethers:E}=require('ethers'),hre=require('hardhat');
const {compile}=require('./compile.cjs'),{drawIdFor}=require('./draw-id.cjs'),{createSite}=require('./serve-site.cjs');
const rpc=(method,params=[])=>hre.network.provider.send(method,params);
const allowed=new Set(['eth_chainId','net_version','web3_clientVersion','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getBalance','eth_getCode','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_call','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_getLogs','eth_sendRawTransaction']);
const listen=(server,port)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
async function start({winner,rpcPort=18545,apiPort=18787,sitePort=4174}={}){
 if(!E.isAddress(winner)||winner===E.ZeroAddress)throw Error('Pass a public winner address with --wallet.');winner=winner.toLowerCase();
 if(BigInt(await rpc('eth_chainId'))!==31337n)throw Error('Requires isolated Hardhat chain 31337.');
 const compiled=compile(),provider=new E.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=50;
 const admin=await provider.getSigner(),control=E.Wallet.createRandom(),awards=[];
 const deploy=async(name,args=[])=>{const a=compiled[name],c=await new E.ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;};
 const sent=async p=>(await p).wait(),token=await deploy('MockToken'),quote=await deploy('LocalUSDGFixture');
 const predicted=E.getCreateAddress({from:await admin.getAddress(),nonce:await provider.getTransactionCount(await admin.getAddress())+2});
 const short=await deploy('ScopedCallerFixture',[predicted]),monthly=await deploy('ScopedCallerFixture',[predicted]);
 const vault=await deploy('DualControllerPromoVault',[token.target,quote.target,short.target,monthly.target,100]);
 if(vault.target!==predicted)throw Error('Vault prediction mismatch.');
 await sent(quote.mint(await admin.getAddress(),1000_000000n));await sent(quote.approve(vault.target,1000_000000n));await sent(vault.fundUSDG(1000_000000n,1));
 for(const [i,who,amount] of [[1,winner,70_000000n],[2,winner,30_000000n],[3,control.address.toLowerCase(),5_000000n]]){
  await rpc('hardhat_setBalance',[who,E.toQuantity(E.parseEther('10'))]);
  const drawId=drawIdFor('SHORT',E.id(`manual wallet ${Date.now()} ${i}`));
  await sent(short.attack(vault.interface.encodeFunctionData('reserveUSDG',[drawId,i,0,amount]),false));
  const receipt=await sent(short.attack(vault.interface.encodeFunctionData('finalize',[drawId,[who],[amount]]),false));
  awards.push({drawId,winner:who,asset:quote.target.toLowerCase(),amountRaw:String(amount),assignment:{transactionHash:receipt.hash}});
 }
 const head=await rpc('eth_getBlockByNumber',['latest',false]);
 const actions={schema:'qianqi-site-actions-v1',mode:'local-test',chainId:31337,vault:vault.target,asset:quote.target,decimals:6,vaultCodeHash:E.keccak256(await rpc('eth_getCode',[vault.target,'latest'])),assetCodeHash:E.keccak256(await rpc('eth_getCode',[quote.target,'latest'])),anchor:{number:Number(BigInt(head.number)),hash:head.hash}};
 const rpcServer=http.createServer(async(req,res)=>{
  // Wallet extensions can have a chrome-extension origin; arbitrary websites cannot use this endpoint.
  const origin=req.headers.origin;
  if(origin&&!/^chrome-extension:\/\/[a-z]+$/.test(origin)&&!/^moz-extension:\/\/[\da-f-]+$/i.test(origin)){res.writeHead(403);res.end();return;}
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type'});res.end();return;}
  if(req.method!=='POST'){res.writeHead(405);res.end();return;}
  let raw='';try{for await(const chunk of req){raw+=chunk;if(raw.length>128000)throw Error('Request too large');}
   const input=JSON.parse(raw);const handle=async q=>{try{if(q.jsonrpc!=='2.0'||!allowed.has(q.method))throw {code:-32601,message:'Method not available in wallet rehearsal'};
    if(q.method==='eth_sendRawTransaction'){const tx=E.Transaction.from(q.params?.[0]);if(tx.chainId!==31337n)throw Error('Only chain 31337 transactions are accepted');}
    return {jsonrpc:'2.0',id:q.id??null,result:await rpc(q.method,q.params??[])};
   }catch(e){return {jsonrpc:'2.0',id:q?.id??null,error:{code:Number.isInteger(e.code)?e.code:-32000,message:String(e.message??'RPC rejected')}};}};
   if(Array.isArray(input)&&input.length>50)throw Error('Batch too large');json(res,200,Array.isArray(input)?await Promise.all(input.map(handle)):await handle(input));
  }catch{json(res,400,{error:'Invalid RPC request'});}
 });
 const apiServer=http.createServer(async(req,res)=>{try{
  const match=/^\/v1\/wallets\/(0x[\da-f]{40})(?:\?|$)/i.exec(req.url);if(req.method!=='GET'||!match){json(res,503,{error:'Rehearsal exposes wallet prizes only; overview is not seeded'});return;}
  const wallet=match[1].toLowerCase(),block=await rpc('eth_getBlockByNumber',['latest',false]),items=[];
  for(const award of awards.filter(a=>a.winner===wallet)){const due=await vault.reward(award.drawId,wallet);items.push({...award,status:due===0n?'paid':'assigned',payment:null});}
  json(res,200,{schema:'promo-wallet-status-v1',status:'observed',wallet,provenance:{chainId:31337,head:{number:Number(BigInt(block.number)),hash:block.hash},observedAt:new Date().toISOString()},balances:{SHORT:{open:'0'},MONTHLY:{open:'0'},carryRaw:'0',entryThresholdRaw:'100000000',quoteDecimals:6},asset:{address:quote.target.toLowerCase(),decimals:6,symbol:'USDG'},rewards:{vault:vault.target,items,total:items.length,coverage:'local-seeded-prizes-live-storage'},purchases:{items:[],total:0,coverage:'not-part-of-this-wallet-rehearsal'}});
 }catch{json(res,503,{error:'Rehearsal chain unavailable'});}});
 const site=createSite({apiOrigin:`http://127.0.0.1:${apiPort}`,actions});
 const servers=[rpcServer,apiServer,site];try{await listen(rpcServer,rpcPort);await listen(apiServer,apiPort);await listen(site,sitePort);}catch(e){for(const s of servers)s.close();throw e;}
 const close=async()=>{for(const s of servers){s.closeAllConnections();await new Promise(r=>s.close(r));}provider.destroy();};
 return {actions,awards,control,close,rpcUrl:`http://127.0.0.1:${rpcPort}`,siteUrl:`http://127.0.0.1:${sitePort}/concepts/hk/`,winner};
}
async function smoke(run){
 const {chromium}=require('@playwright/test'),assert=require('node:assert/strict');
 const provider=new E.JsonRpcProvider(run.rpcUrl,31337,{staticNetwork:true,cacheTimeout:-1}),signer=run.control.connect(provider),browser=await chromium.launch();
 try{const page=await browser.newPage({viewport:{width:390,height:900}});let sends=0;
  await page.exposeFunction('localRequest',async({method,params})=>{
   if(['eth_accounts','eth_requestAccounts'].includes(method))return [signer.address.toLowerCase()];
   if(method==='eth_sendTransaction'){sends++;return (await signer.sendTransaction(params[0])).hash;}
   return provider.send(method,params??[]);
  });
  await page.addInitScript(()=>{window.ethereum={request:arg=>window.localRequest(arg),on:()=>{},removeListener:()=>{}};});
  await page.goto(run.siteUrl);await page.locator('header .connect').click();await page.getByRole('button',{name:'Claim / check payment'}).click();
  await page.getByRole('button',{name:'Confirm claim in wallet'}).click();await page.waitForFunction(()=>document.getElementById('dialog-title').textContent==='Claim submitted');
  await page.keyboard.press('Escape');await page.reload();await page.locator('header .connect').click();await page.waitForFunction(()=>document.querySelector('#rewards-body .status-paid'));
  assert.equal(sends,1);assert.equal(await page.getByRole('button',{name:'Claim / check payment'}).count(),0);
  const user=await (await fetch(run.siteUrl.replace('/concepts/hk/','/v1/wallets/'+run.winner))).json();assert.equal(user.rewards.items.filter(r=>r.status==='assigned').length,2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const forbidden=await provider.send('eth_chainId',[]);assert.equal(BigInt(forbidden),31337n);
  return {status:'PASS',signedRpcBrowserClaim:true,reloadPaid:true,userPrizesUntouched:true,installedExtension:false};
 }finally{await browser.close();provider.destroy();}
}
if(require.main===module)(async()=>{
 const index=process.argv.indexOf('--wallet'),run=await start({winner:process.argv[index+1]});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void run.close());
 const check=await smoke(run),summary={schema:'qianqi-manual-wallet-rehearsal-v1',pid:process.pid,startedAt:new Date().toISOString(),siteUrl:run.siteUrl,rpcUrl:run.rpcUrl,winner:run.winner,chainId:31337,actions:run.actions,awards:run.awards.filter(a=>a.winner===run.winner),check};
 await fs.mkdir(path.resolve('.local/logs'),{recursive:true});await fs.writeFile('.local/logs/wallet-rehearsal.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
module.exports={start,smoke};
