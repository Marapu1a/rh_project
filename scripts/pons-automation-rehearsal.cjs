const http=require('node:http'),fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {runPonsAutomation}=require('./pons-automation.cjs'),{replayAttempts}=require('./attempt-lifecycle.cjs'),{scanWithRpc}=require('./replay-direct-buy.cjs');
async function finish({out,save,provider,user,quote,cycle,manifest,rpc,buy,directory,report,invariant}){
 const {short,monthly,vault,random,lifecycle}=cycle,owner=(await user.getAddress()).toLowerCase();
 const server=http.createServer(async(req,res)=>{let b='';for await(const x of req)b+=x;const handle=async q=>{try{return {jsonrpc:'2.0',id:q.id,result:await rpc(q.method,q.params)};}catch(e){return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:e.message}};}};try{const q=JSON.parse(b);res.setHeader('content-type','application/json');res.end(JSON.stringify(Array.isArray(q)?await Promise.all(q.map(handle)):await handle(q)));}catch{res.writeHead(400);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const digest=async a=>ethers.keccak256(await provider.getCode(a)),anchor=await provider.getBlock('latest'),metadata=await rpc('hardhat_metadata');
 const collector=new ethers.Contract(out.collector,require('./pons-collector-manual.cjs').ABI,provider),policy=await collector.policy(1);
 const config={schema:'pons-rehearsal-automation-v1',instanceId:metadata.instanceId,manifest,lifecycle,collector:out.collector,escrow:out.graph.escrow,vault:vault.target,executor:owner,campaignId:'1',recipients:Array.from(policy.recipients),codeHashes:{collector:await digest(out.collector),escrow:await digest(out.graph.escrow)},maxGasPrice:'10000000000',nativeFloor:'1000000000000000',gasLimit:'3000000',maxTransactions:2,pollSeconds:10,
 deliveryJob:{schema:'robinhood-drand-delivery-v1',chainId:4663,adapter:random.target,short:short.target,monthly:monthly.target,adapterCodeHash:await digest(random.target),shortCodeHash:await digest(short.target),monthlyCodeHash:await digest(monthly.target),anchor:{number:anchor.number,hash:anchor.hash},maxGasPrice:'10000000000',nativeFloor:'1000000000000000',gasUnits:{prove:'500000',deliver:'500000'},pollSeconds:10}};
 const options={provider,executor:user,config,rpcUrl:'http://127.0.0.1:'+server.address().port,statePath:directory+'/automation.json'};report.automation={config,runs:[]};fs.writeFileSync(directory+'/config.json',JSON.stringify(config,null,2));
 async function clock(){await new Promise(r=>setTimeout(r,1100));}
 async function tick(extra={},hooks={}){await clock();const r=await runPonsAutomation({...options,...extra},hooks);report.automation.runs.push(r);save();assert(!['error','blocked'].includes(r.status),JSON.stringify(r));return r;}
 try{
  // A real chain keeps producing blocks while the coordinator performs reads.
  // Keep all drand freshness limits unchanged; advance only the local test chain.
  await rpc('evm_setIntervalMining',[1000]);
  report.assumptions.push('Automation fork mines a block every second while workers read; RNG freshness gates unchanged');
  // Leave fresh, genuinely earned fees in escrow for the coordinator to collect.
  // This one-USDG BUY stays below the next entry boundary in this fixed scenario.
  await buy(1_000000n);
  const hook=new ethers.Contract(out.graph.hook,['function sweepPoolFees(bytes32,uint256,uint256)'],new ethers.JsonRpcSigner(provider,out.operator));
  const conversion=await (await hook.sweepPoolFees(out.poolId,1,0,{gasLimit:6000000})).wait();report.automation.localOperatorPreparation=conversion.hash;
  let shortId,monthId;
  for(let n=0;n<16;n++){await tick();shortId=await short.pendingDatasetDraw();monthId=await monthly.pendingMonth();if(shortId!==ethers.ZeroHash&&monthId!==ethers.ZeroHash)break;}
  assert.notEqual(shortId,ethers.ZeroHash,'Short not frozen');assert.notEqual(monthId,ethers.ZeroHash,'Monthly not frozen');
  report.fundingAtFreeze=await invariant();assert(report.automation.runs.flatMap(r=>r.steps).some(s=>s.action==='pull'),'Coordinator did not collect fresh escrow');assert(report.automation.runs.flatMap(r=>r.steps).some(s=>s.action==='pay'),'Coordinator did not distribute credit');
  await buy(100_000000n);
  const ids=[await short.drawRequest(shortId),await monthly.drawRequest(monthId)],requests=await Promise.all(ids.map(id=>random.requests(id)));report.requests=requests.map((r,i)=>({id:ids[i],round:r.round,context:r.context,consumer:r.consumer}));save();
  const target=Math.max(...requests.map(r=>1727521075+(Number(r.round)-1)*3));assert(target-Date.now()/1000<90);
  while(Date.now()/1000<target+2){console.log('automation: waiting fixed drand rounds');await new Promise(r=>setTimeout(r,Math.min(10000,Math.max(1,(target+2)*1000-Date.now()))));}
  const stop=new AbortController();const stopped=await tick({signal:stop.signal},{onStep:s=>{if(s.action==='prove')stop.abort();}});assert.equal(stopped.status,'stopped');
  for(let n=0;n<16;n++){await tick();if(await short.pendingDatasetDraw()===ethers.ZeroHash&&await monthly.pendingMonth()===ethers.ZeroHash&&await vault.claimable(quote.target)===0n)break;}
  assert.equal((await short.settlements(shortId)).phase,3n);assert.equal((await monthly.month(monthId)).phase,5n);assert.equal(await vault.reserved(quote.target),0n);assert.equal(await vault.claimable(quote.target),0n);
  report.after=await invariant();report.paid=report.fundingAtFreeze.balance-report.after.balance;assert(report.paid>=0n);
  report.finalReplay=await scanWithRpc(manifest,rpc,await rpc('eth_blockNumber'),lifecycle);report.finalReplay.lifecycle=lifecycle;report.finalLedger=replayAttempts(manifest,lifecycle,report.finalReplay.blocks);
  const final=report.finalLedger.wallets.find(w=>w.wallet===owner);for(const k of ['SHORT','MONTHLY']){assert.equal(final[k].consumedTotal,'86');assert.equal(final[k].open,'1');}
  const nonce=await provider.getTransactionCount(owner),again=await tick();assert.equal(again.steps.length,0);assert.equal(await provider.getTransactionCount(owner),nonce);report.status='PONS_AUTOMATION_PASSED';save();
 }finally{await rpc('evm_setIntervalMining',[0]);server.closeAllConnections();await new Promise(r=>server.close(r));}
}
module.exports={finish};
