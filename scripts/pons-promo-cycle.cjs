// Local fork harness. No alternate RNG, seed search, or release authorization.
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {scanWithRpc}=require('./replay-direct-buy.cjs'),{replayAttempts}=require('./attempt-lifecycle.cjs');
const shortDataset=require('./short-dataset.cjs'),monthlyDataset=require('./monthly-dataset.cjs');
const shortWorker=require('./local-short-executor.cjs'),monthWorker=require('./local-monthly-executor.cjs');
const {drawIdFor}=require('./draw-id.cjs'),{withRobinhoodNetwork}=require('./runtime-network.cjs');
const {runDrandDelivery,fetchBeacon}=require('./drand-delivery-worker.cjs');
const plan=require('../config/robinhood-launch-plan.json').unresolved;
const sent=async tx=>(await tx).wait(),code=async(p,c)=>ethers.keccak256(await p.getCode(c.target));
function compileFixture(){
 const overrides={};
 for(const [file,changes]of [
  ['contracts/ShortRulesEpochs.sol',[['shortRulesStartedAt = block.timestamp;','shortRulesStartedAt = block.timestamp - 21601;'],['lastShortTerminalAt = block.timestamp;','lastShortTerminalAt = block.timestamp - 21601;']]],
  ['contracts/MonthlySettlement.sol',[['lastMonthAt=block.timestamp;monthlyStartedAt=block.timestamp;','lastMonthAt=block.timestamp-2592001;monthlyStartedAt=block.timestamp-2592001;']]]
 ]){let source=fs.readFileSync(file,'utf8');for(const [from,to]of changes){assert(source.includes(from),'Constructor clock: '+file);source=source.replace(from,to);}overrides[file]=source;}
 return require('./compile.cjs').compile({sourceOverrides:overrides,writeArtifacts:false});
}
async function deploy({compiled,provider,user,token,quote,rpc}){
 // Hardhat lacks Nitro's ArbSys precompile. This fixture returns local block identities only.
 await rpc('hardhat_setCode',['0x0000000000000000000000000000000000000064','0x'+compiled.PublicArbSysFixture.evm.deployedBytecode.object]);
 const owner=await user.getAddress(),create=async(name,args=[])=>{const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,user).deploy(...args);await c.waitForDeployment();return c;};
 const registry=await create('ParticipantRegistry'),nonce=await provider.getTransactionCount(owner),address=n=>ethers.getCreateAddress({from:owner,nonce:nonce+n});
 const random=await create('DrandRandomAdapter',[address(1),address(2),[60,30,5,20,15]]);
 const setup={vault:address(3),registry:registry.target,instance:ethers.id('Pons cycle short'),governor:owner,publisher:owner,provider:random.target,notice:3600,cutoffDelayBlocks:1,maxGasPrice:10n**12n,nativeFloor:0};
 const short=await create('RobinhoodShortController',[{...setup,maxBudget:ethers.MaxUint256},plan.shortRules,plan.shortWeights,plan.minimumUnitRaw]);
 const monthly=await create('RobinhoodMonthlyController',[{...setup,instance:ethers.id('Pons cycle monthly'),interval:30*86400},plan.monthlyRules]);
 const vault=await create('DualControllerPromoVault',[token,quote,short.target,monthly.target,100_000000]);assert.equal(vault.target,setup.vault);
 const sg=await short.shortEpochPolicy(1),mg=await monthly.monthlyEpochPolicy(1);
 const lifecycle={schema:'attempt-lifecycle-v4',source:short.target,sourceCodeHash:await code(provider,short),instanceId:await short.datasetInstance(),monthlySource:monthly.target,monthlySourceCodeHash:await code(provider,monthly),monthlyInstanceId:await monthly.monthlyInstance(),vault:vault.target,vaultCodeHash:await code(provider,vault),shortRules:{rulesHash:sg.hash,noticeSeconds:String(await short.shortRulesNotice()),startedAt:String(await short.shortRulesStartedAt()),firstBlock:String(sg.firstBlock)},monthlyPolicy:{rulesHash:mg.hash,interval:String(await monthly.monthlyInterval()),startedAt:String(await monthly.monthlyStartedAt())},monthlyRules:{noticeSeconds:String(await monthly.monthlyRulesNotice()),firstBlock:String(mg.firstBlock)}};
 return {registry,random,short,monthly,vault,lifecycle};
}
async function finish({out,save,provider,user,quote,cycle,manifest,rpc,buy}){
 const {short,monthly,vault,random,lifecycle}=cycle,owner=(await user.getAddress()).toLowerCase();
 const directory=fs.mkdtempSync('.local/logs/pons-cycle-'),report=out.cycle={directory,lifecycle,assumptions:['Constructor clocks backdated only in in-memory compiled ShortRulesEpochs/MonthlySettlement; repository contracts unchanged','Local ArbSys shim, not Nitro finality proof','Current launch-plan rules/weights/minimum, no changed odds or selected seeds','Live drand BLS proof; 60-second lead is test-only','Synthetic owner USDG may donate missing Monthly readiness reserves; never injected into prize vault storage'],steps:[]};
 const record=r=>{report.steps.push(r);save();},dump=(name,value)=>fs.writeFileSync(directory+'/'+name,JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v,2));
 const history=async()=>{const r=await scanWithRpc(manifest,rpc,await rpc('eth_blockNumber'),lifecycle);return {...r,lifecycle};};
 const ledger=async()=>replayAttempts(manifest,lifecycle,(await history()).blocks);
 const invariant=async()=>{const balance=await quote.balanceOf(vault.target),parts=[await vault.freeShort(),await vault.freeCurrent(),await vault.freeNext(),await vault.reserved(quote.target),await vault.claimable(quote.target),await vault.unrecognizedUSDG()];assert.equal(parts.reduce((a,b)=>a+b,0n),balance);return {balance,parts};};
 report.before=await invariant();
 // Preserve the 100 USDG Next target and public Monthly minimum; explicit donor fills gaps.
 await sent(quote.approve(vault.target,ethers.MaxUint256));report.donations=[];
 for(const [destination,available]of [[2,await vault.freeCurrent()],[3,await vault.freeNext()]]){if(available<100_000000n){const amount=100_000000n-available,r=await sent(vault.fundUSDG(amount,destination));report.donations.push({amount,destination,hash:r.hash});}}
 report.funded=await invariant();report.initial=await ledger();save();
 if(process.argv.includes('--automation'))return require('./pons-automation-rehearsal.cjs').finish({out,save,provider,user,quote,cycle,manifest,rpc,buy,directory,report,invariant});
 const blocks=(await history()).blocks,head=blocks.at(-1),common={manifest,lifecycle,blocks};
 const shortId=drawIdFor('SHORT',ethers.id('Pons cycle Short')),monthId=drawIdFor('MONTHLY',ethers.id('Pons cycle Monthly'));
 const sj=shortWorker.makeJob(shortDataset.buildFromHistory({...common,rules:plan.shortRules,weights:plan.shortWeights,minimumUnit:plan.minimumUnitRaw,request:{drawId:shortId,campaignId:1,rulesEpoch:1,cutoffBlockNumber:Number(BigInt(head.number)),cutoffBlockHash:head.hash,budget:String(await vault.freeShort())}}),ethers.id('Pons cycle proposal'),1);
 const mj=monthWorker.makeMonthlyJob(monthlyDataset.buildFromHistory({...common,rules:plan.monthlyRules,request:{drawId:monthId,campaign:1,rulesEpoch:1,cutoff:Number(BigInt(head.number)),cutoffHash:head.hash}}),1);
 report.jobs={short:sj,monthly:mj};dump('short.json',sj);dump('monthly.json',mj);
 await sent(short.checkpointCutoff(Number(BigInt(head.number))));await sent(monthly.checkpointCutoff(Number(BigInt(head.number))));
 const server=http.createServer(async(req,res)=>{let b='';for await(const p of req)b+=p;const handle=async q=>{try{return {jsonrpc:'2.0',id:q.id,result:await rpc(q.method,q.params)};}catch(e){return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:e.message}};}};try{const data=JSON.parse(b);res.setHeader('content-type','application/json');res.end(JSON.stringify(Array.isArray(data)?await Promise.all(data.map(handle)):await handle(data)));}catch{res.writeHead(400);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await withRobinhoodNetwork({provider,rpcUrl:'http://127.0.0.1:'+server.address().port,mode:'robinhood-rehearsal'},async()=>{
  const options=kind=>({provider,source:kind==='short'?short:monthly,job:JSON.parse(fs.readFileSync(directory+'/'+kind+'.json','utf8')),publisher:user,executor:user});
  async function clock(){const h=await provider.getBlock('latest');while(Math.floor(Date.now()/1000)<=h.timestamp)await new Promise(r=>setTimeout(r,1000));await rpc('evm_setNextBlockTimestamp',[Math.floor(Date.now()/1000)]);await rpc('evm_mine');}
  for(const [kind,step]of [['short',shortWorker.stepShort],['monthly',monthWorker.stepMonthly]]){
   for(let i=0;i<6;i++){await clock();const r=await step(options(kind));record({kind,...r});if(r.action==='seal'||r.action==='sealMonth')break;assert.equal(r.status,'progress',JSON.stringify(r));}
  }
  assert.equal(await short.pendingDatasetDraw(),shortId);assert.equal(await monthly.pendingMonth(),monthId);
  report.frozen=await ledger();report.frozenAccounting=await invariant();
  // Later spending stays OPEN and cannot silently change either frozen dataset.
  await buy(100_000000n);report.afterLateBuy=await ledger();
  const wallet=report.afterLateBuy.wallets.find(w=>w.wallet===owner);assert.equal(wallet.SHORT.open,'1');assert.equal(wallet.MONTHLY.open,'1');
  const ids=[await short.drawRequest(shortId),await monthly.drawRequest(monthId)],requests=await Promise.all(ids.map(id=>random.requests(id)));
  report.requests=requests.map((r,i)=>({id:ids[i],consumer:r.consumer,context:r.context,round:r.round}));save();
  const target=Math.max(...requests.map(r=>1727521075+(Number(r.round)-1)*3));assert(target-Date.now()/1000<90,'Unexpected RNG wait');
  while(Date.now()/1000<target+2){console.log('cycle: waiting fixed drand rounds',requests.map(r=>String(r.round)).join(','));await new Promise(r=>setTimeout(r,Math.min(10000,Math.max(1,(target+2)*1000-Date.now()))));}
  await clock();report.beacons=[];for(const r of requests){const b=await fetchBeacon(String(r.round));assert(await random.verify(r.round,'0x'+b.signature));report.beacons.push(b);}save();
  const anchor=await provider.getBlock('latest'),deliveryJob={schema:'robinhood-drand-delivery-v1',chainId:4663,adapter:random.target,short:short.target,monthly:monthly.target,adapterCodeHash:await code(provider,random),shortCodeHash:await code(provider,short),monthlyCodeHash:await code(provider,monthly),anchor:{number:anchor.number,hash:anchor.hash},maxGasPrice:'1000000000000',nativeFloor:'0',gasUnits:{prove:'500000',deliver:'500000'},pollSeconds:10};
  const deliveryOptions={provider,adapter:random.connect(provider),executor:user,job:deliveryJob,statePath:directory+'/drand.json'};
  // Stop after the first persisted proof; a fresh invocation resumes the same requests.
  const stop=new AbortController();report.deliveryStopped=await runDrandDelivery({...deliveryOptions,signal:stop.signal},{onStep:s=>{if(s.action==='prove')stop.abort();}});
  report.deliveryResumed=await runDrandDelivery(deliveryOptions);assert.equal(report.deliveryResumed.status,'complete',JSON.stringify(report.deliveryResumed));
  const nonce=await provider.getTransactionCount(owner);report.deliveryAgain=await runDrandDelivery(deliveryOptions);assert.equal(report.deliveryAgain.steps.length,0);assert.equal(await provider.getTransactionCount(owner),nonce);
  for(const id of ids){const r=await random.requests(id);assert(r.proven&&r.delivered);}
  // Reload committed jobs for every step. No in-memory progress survives the restart boundary.
  record({kind:'short',...await shortWorker.stepShort(options('short'))});
  report.shortTerminal=await shortWorker.runShort(options('short'),{onStep:record});assert.equal(report.shortTerminal.status,'terminal');
  const shortNonce=await provider.getTransactionCount(owner);assert.equal((await shortWorker.runShort(options('short'))).status,'terminal');assert.equal(await provider.getTransactionCount(owner),shortNonce);
  assert.equal(await monthly.pendingMonth(),monthId);await invariant();
  record({kind:'monthly',...await monthWorker.stepMonthly(options('monthly'))});
  report.monthlyTerminal=await monthWorker.runMonthly(options('monthly'),{onStep:record});assert.equal(report.monthlyTerminal.status,'terminal');
  const terminalNonce=await provider.getTransactionCount(owner);assert.equal((await monthWorker.runMonthly(options('monthly'))).status,'terminal');assert.equal(await provider.getTransactionCount(owner),terminalNonce);
  report.beforeClaims=await invariant();report.claims=[];
  for(const draw of [shortId,monthId]){
   const due=await vault.reward(draw,owner);if(due===0n){report.claims.push({draw,amount:0n,outcome:'no reward; original RNG outcome retained'});continue;}
   const before=await quote.balanceOf(owner),r=await sent(vault.claim(draw,owner));assert.equal(await quote.balanceOf(owner)-before,due);assert.equal(await vault.reward(draw,owner),0n);await assert.rejects(vault.claim(draw,owner));report.claims.push({draw,amount:due,hash:r.hash});await invariant();
  }
  report.after=await invariant();const paid=report.claims.reduce((n,c)=>n+c.amount,0n);assert.equal(report.funded.balance,report.after.balance+paid);assert.equal(await vault.reserved(quote.target),0n);assert.equal(await vault.claimable(quote.target),0n);
  report.finalReplay=await history();report.finalLedger=replayAttempts(manifest,lifecycle,report.finalReplay.blocks);const final=report.finalLedger.wallets.find(w=>w.wallet===owner),initial=report.initial.wallets.find(w=>w.wallet===owner);
  for(const kind of ['SHORT','MONTHLY']){assert.equal(final[kind].open,'1');assert.equal(final[kind].consumedTotal,initial[kind].open);}
  assert.equal(report.finalLedger.pending.SHORT,null);assert.equal(report.finalLedger.pending.MONTHLY,null);report.status='PONS_PROMO_CYCLE_PASSED';save();
 });}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
module.exports={compileFixture,deploy,finish};
