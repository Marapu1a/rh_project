const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs');
const {fixture,sent,advance,rpc}=require('./fixtures/local-controllers.cjs');
const {runPrizeFlow}=require('../scripts/local-prize-flow.cjs');
const compiled=compile();
test('saved V4 market fork ties actual swap, converter output and GENERAL balances',()=>{
  const e=require('../research/v4-market-fork-success-2026-09-25.json'),x=e.marketIntegration;
  assert.equal(e.stage,'complete');assert.equal(x.complete,true);assert.equal(e.proxyStats.errors,0);
  assert.equal(e.codeHashes.router,'0x2ce6aaaf9f4151f5e1cbf774668772f17f532ae11b15e9284fd0a072a8b0fbde');
  const converterABI=new ethers.Interface(compiled.LocalMarketPrizeConverter.abi);
  const logs=x.receipts.flatMap(r=>r.logs);
  const converted=logs.filter(l=>l.address.toLowerCase()===x.job.active.address.toLowerCase()&&l.topics[0]===converterABI.getEvent('Converted').topicHash);
  assert.equal(converted.length,1);const actual=converterABI.parseLog(converted[0]).args;
  assert.equal(String(actual.amountOut),x.balances.vault);assert.equal(String(actual.amountIn),x.balances.sold);
  assert(actual.amountOut>=actual.minimumOut);assert.equal(String(actual.amountOut),x.quote.amountOut);
  const {SWAP_ABI}=require('../scripts/direct-buy.cjs');
  const swaps=logs.filter(l=>l.address.toLowerCase()===e.config.manager.toLowerCase()&&l.topics[0]===SWAP_ABI.getEvent('Swap').topicHash);
  assert.equal(swaps.length,1);assert.equal(SWAP_ABI.parseLog(swaps[0]).args.id,e.config.poolId);
  assert.equal(BigInt(x.balances.short)+BigInt(x.balances.current)+BigInt(x.balances.next),actual.amountOut);
  assert(x.observations.some(r=>r.reason==='priceImpact'));
});
async function setup(market=false){
  const f=await fixture(compiled),project=await (await f.provider.getSigner(4)).getAddress();
  const adapter=await f.deploy('PrizeSwapFixture',[f.token.target,f.quote.target,3,1]);
  const make=async(vault=f.vault.target)=>f.deploy('LocalPrizeConverter',[f.token.target,f.quote.target,vault,adapter.target,2,1,1000,300]);
  const converter=market?await f.deploy('LocalMarketPrizeConverter',[f.token.target,f.quote.target,f.vault.target,adapter.target,await f.executor.getAddress(),await f.admin.getAddress(),[1000,300,1000,3600,60]]):await make();
  const descriptor=(c,vault=f.vault.target)=>({kind:'converter',address:c.target,vault,adapter:adapter.target,
    ...(market?{execution:'market-v1',executor:f.executor.address,capacity:'1000',refillSeconds:'3600',version:'1',maxQuoteAge:'30',minUSDG:'1',slippageBps:100}:{floorNumerator:'2',floorDenominator:'1'}),maxInput:'1000',maxHorizon:'300',swapLimit:'1000',deadlineSeconds:'120'});
  const end=(await f.provider.getBlock('latest')).timestamp+1000,recipients=[converter.target,ethers.ZeroAddress,project],bps=[8000,0,2000];
  const router=await f.deploy('FeeRouter',[await f.admin.getAddress(),f.token.target,f.quote.target,[end,recipients,bps]]);
  const source=await f.deploy('MockPairVault',[f.token.target,router.target]);await sent(router.bindSource(source.target,123));
  await sent(f.quote.mint(adapter.target,100000));
  const job={schema:'local-prize-flow-v1',chainId:'31337',router:router.target,token:f.token.target,quote:f.quote.target,
    campaignId:'1',recipients,bps,active:descriptor(converter),legacy:[],source:{vault:source.target,positionId:'123',epoch:'1'},
    distribution:'GENERAL',pollSeconds:300,maxGasPrice:'1000000000000'};
  const options={provider:f.provider,router,executor:f.executor,job,...(market?{getSwapQuote:async q=>({...q,blockHash:q.block.hash,amountOut:q.amountIn*3n})}:{})};
  return {...f,project,adapter,converter,make,descriptor,router,source,job,options};
}
async function simulationPolicy(f){
  delete f.options.getSwapQuote;
  f.job.active.marketQuote={kind:'v4-simulation-v1',converterHash:ethers.keccak256(await f.provider.getCode(f.converter.target)),
    adapterHash:ethers.keccak256(await f.provider.getCode(f.adapter.target)),sampleInput:'10',minSampleOutput:'1',maxImpactBps:100,
    maxCandidates:8,maxGasCostWei:'100000000000000000',gasMarginBps:12000};
}
test('market automatic simulation selects a smaller portion without persisting quote state',async()=>{
  const f=await setup(true);await simulationPolicy(f);await sent(f.token.mint(f.converter.target,100));await sent(f.adapter.setFailure(6));
  const quote=require('../scripts/v4-market-quote.cjs').createV4MarketQuote({provider:f.provider,job:f.job});
  const request={converter:f.converter.target,adapter:f.adapter.target,token:f.token.target,quote:f.quote.target,amountIn:100n,version:1n,block:await f.provider.getBlock('latest')};
  const q=await quote(request);assert(q.amountIn<100n);assert.equal(await f.converter.tokenSold(),0n);assert.equal(await f.token.balanceOf(f.converter.target),100n);
  const steps=[];const result=await runPrizeFlow(f.options,{onStep:r=>steps.push(r)});
  assert.equal(result.status,'yielded',JSON.stringify(result));assert.equal(await f.converter.tokenSold(),q.amountIn);
  assert.equal(await f.converter.quoteForwarded(),q.amountOut);assert(steps.some(r=>r.reason==='candidate'));
});
test('market simulation policy rejects excessive gas/runtime drift while USDG still forwards',async()=>{
  const f=await setup(true);await simulationPolicy(f);await queue(f,50,100);
  f.job.active.marketQuote.maxGasCostWei='1';const events=[];
  await runPrizeFlow(f.options,{onStep:r=>events.push(r)});assert.equal(await f.converter.tokenSold(),0n);assert.equal(await f.converter.quoteForwarded(),80n);
  assert(events.some(r=>r.reason==='gasCost'));
  f.job.active.marketQuote.maxGasCostWei='100000000000000000';f.job.active.marketQuote.adapterHash=ethers.ZeroHash;
  await runPrizeFlow(f.options);assert.equal(await f.converter.tokenSold(),0n);
});
test('market flow gradually funds GENERAL even with Short already funded; bucket blocks repeated sales',async()=>{
  const f=await setup(true);await sent(f.token.mint(f.converter.target,2500));
  await sent(f.quote.mint(f.vault.target,1000));await sent(f.vault.syncUSDG());
  const first=await runPrizeFlow(f.options);assert.equal(first.status,'yielded');
  assert.equal(await f.converter.tokenSold(),1000n);
  assert.equal(await f.converter.quoteForwarded(),3000n);
  const steps=[];await runPrizeFlow(f.options,{onStep:e=>steps.push(e)});
  assert((await f.converter.tokenSold())<1010n); // Small elapsed-time refill only, not another full cap.
  await advance(3601);await runPrizeFlow(f.options);
  assert((await f.converter.tokenSold())>=2000n);
  assert((await f.vault.freeCurrent())>0n);assert.equal(await f.token.allowance(f.converter.target,f.adapter.target),0n);
});
test('market flow quote outage does not block direct USDG; wrong quote binding cannot sell',async()=>{
  const f=await setup(true);await queue(f,50,100);
  const before=await f.quote.balanceOf(f.vault.target);
  f.options.getSwapQuote=async()=>null;
  await runPrizeFlow(f.options);assert.equal(await f.converter.tokenSold(),0n);
  assert.equal(await f.quote.balanceOf(f.vault.target)-before,80n);
  f.options.getSwapQuote=async q=>({...q,blockHash:q.block.hash,amountIn:q.amountIn+1n,amountOut:100n});
  assert.equal((await runPrizeFlow(f.options)).status,'error');assert.equal(await f.converter.tokenSold(),0n);
});
test('market quote can choose smaller portion; stale quote waits; low executor minimum is explicit trust',async()=>{
  const f=await setup(true);await sent(f.token.mint(f.converter.target,100));
  f.options.getSwapQuote=async q=>({...q,blockHash:q.block.hash,amountIn:10n,amountOut:30n});
  await runPrizeFlow(f.options);assert.equal(await f.converter.tokenSold(),10n);
  f.options.getSwapQuote=async q=>{await advance(31);return {...q,blockHash:q.block.hash,amountOut:q.amountIn*3n};};
  const events=[];await runPrizeFlow(f.options,{onStep:e=>events.push(e)});
  assert(events.some(e=>e.reason==='staleQuote'));assert.equal(await f.converter.tokenSold(),10n);
  // A trusted executor may accept a worse price. This is a demonstrated boundary, not an oracle.
  await sent(f.adapter.setFailure(2));
  await sent(f.converter.connect(f.executor).convert(10,1,(await f.provider.getBlock('latest')).timestamp+60,1));
  assert.equal(await f.converter.tokenSold(),20n);assert.equal(await f.quote.balanceOf(f.converter.target),10n);
});
test('market converter authority, actual output, rate rollback, reentrancy and route notice',async()=>{
  const f=await setup(true),c=f.converter,deadline=async()=>(await f.provider.getBlock('latest')).timestamp+120;
  await sent(f.token.mint(c.target,2000));
  await assert.rejects(async()=>c.convert(100,1,await deadline(),1));
  for(const mode of [2,3,4,5]){
    await sent(f.adapter.setFailure(mode));
    await assert.rejects(async()=>c.connect(f.executor).convert(100,290,await deadline(),1));
    assert.equal(await c.availableToSell(),1000n);assert.equal(await c.tokenSold(),0n);
    assert.equal(await f.token.allowance(c.target,f.adapter.target),0n);
  }
  await sent(f.adapter.setFailure(0));
  await assert.rejects(async()=>c.connect(f.executor).convert(100,0,await deadline(),1));
  await sent(c.connect(f.executor).convert(1000,2900,await deadline(),1));
  await assert.rejects(async()=>c.connect(f.executor).convert(1000,1,await deadline(),1));
  const next=await f.deploy('PrizeSwapFixture',[f.token.target,f.quote.target,3,1]);
  await sent(c.announceAdapter(next.target,ethers.keccak256(await f.provider.getCode(next.target))));
  await assert.rejects(c.activateAdapter(1));await advance(61);await sent(c.activateAdapter(1));
  assert((await c.availableToSell())<1000n); // Activation cannot refill bucket.
  await assert.rejects(async()=>c.connect(f.executor).convert(1,1,await deadline(),1));
  await sent(c.forwardQuote());assert.equal(await c.quoteForwarded(),3000n);
});
async function roll(f,recipients=f.job.recipients,bps=f.job.bps){
  await advance(1001);const end=(await f.provider.getBlock('latest')).timestamp+1000;
  await sent(f.router.rollCampaign(f.job.campaignId,[end,recipients,bps]));
  f.job.campaignId=String(BigInt(f.job.campaignId)+1n);f.job.recipients=recipients;f.job.bps=bps;
}
async function queue(f,token=600,quote=100){await sent(f.source.queueFees(f.token.target,token));await sent(f.source.queueFees(f.quote.target,quote));}
test('flow collects both assets, converts actual TOKEN and forwards USDG without double funding',async()=>{
  const f=await setup(),before=await f.quote.balanceOf(f.vault.target);await queue(f);
  const events=[],first=await runPrizeFlow(f.options,{onStep:e=>events.push(e)});assert.equal(first.status,'idle');
  assert.equal(await f.quote.balanceOf(f.vault.target)-before,1520n);assert.equal(await f.token.balanceOf(f.vault.target),0n);
  assert.equal(await f.token.balanceOf(f.project),120n);assert.equal(await f.quote.balanceOf(f.project),20n);
  assert.equal(await f.converter.tokenSold(),480n);assert.equal(await f.converter.quoteForwarded(),1520n);
  const convert=events.findIndex(e=>e.action==='convert');assert(convert>events.findIndex(e=>e.action==='forwardQuote'));
  assert.equal((await runPrizeFlow(f.options)).status,'idle');assert.equal(await f.quote.balanceOf(f.vault.target)-before,1520n);
  assert.equal(await f.quote.balanceOf(f.router.target),0n);assert.equal(await f.token.balanceOf(f.router.target),0n);
});
test('broken swap does not block USDG/source; retry consumes remaining inventory once',async()=>{
  const f=await setup(),before=await f.quote.balanceOf(f.vault.target);await queue(f);await sent(f.adapter.setFailure(1));
  const first=await runPrizeFlow(f.options);assert.equal(first.status,'degraded');assert.equal(first.failures[0].action,'convert');
  assert.equal(await f.quote.balanceOf(f.vault.target)-before,80n);assert.equal(await f.token.balanceOf(f.converter.target),480n);
  assert.equal(await f.source.collections(),1n);assert.equal(await f.token.allowance(f.converter.target,f.adapter.target),0n);
  await sent(f.adapter.setFailure(0));assert.equal((await runPrizeFlow(f.options)).status,'idle');
  assert.equal(await f.quote.balanceOf(f.vault.target)-before,1520n);
});
test('blocked forward preserves quote and does not sell more TOKEN; collection still proceeds',async()=>{
  const f=await setup();await queue(f);await sent(f.quote.blockRecipient(f.vault.target));
  const first=await runPrizeFlow(f.options);assert.equal(first.status,'degraded');
  assert.equal(first.failures.filter(e=>e.action==='forwardQuote').length,1);
  assert.equal(await f.converter.tokenSold(),0n);assert.equal(await f.quote.balanceOf(f.converter.target),80n);
  assert.equal(await f.quote.balanceOf(f.project),20n);assert.equal(await f.source.collections(),1n);
  await sent(f.quote.blockRecipient(ethers.ZeroAddress));assert.equal((await runPrizeFlow(f.options)).status,'idle');
  assert.equal(await f.converter.quoteForwarded(),1520n);
});
test('old converter debt/inventory stays at old destination after rollover',async()=>{
  const f=await setup(),before=await f.quote.balanceOf(f.vault.target);await sent(f.token.mint(f.router.target,100));await sent(f.router.sync(f.token.target));
  await sent(f.token.mint(f.converter.target,5));
  const nextVault=await f.deploy('PromoVault',[f.token.target,f.quote.target,f.short.target,100]),next=await f.make(nextVault.target);
  f.job.legacy=[{...f.job.active,campaignId:'1',slot:0}];await roll(f,[next.target,ethers.ZeroAddress,f.project]);
  f.job.active=f.descriptor(next,nextVault.target);await queue(f,100,100);
  const result=await runPrizeFlow(f.options);assert.equal(result.status,'idle');
  assert.equal(await f.quote.balanceOf(f.vault.target)-before,255n);assert.equal(await f.quote.balanceOf(nextVault.target),320n);
  assert.equal(await f.router.credit(f.token.target,f.converter.target),0n);assert.equal(await f.converter.vault(),f.vault.target);
  assert.equal(await f.token.balanceOf(f.vault.target),0n);
});
test('legacy USDG vault gets quote but TOKEN debt is reported and never paid by worker',async()=>{
  const f=await setup();await roll(f,[f.vault.target,ethers.ZeroAddress,f.project]);
  await sent(f.token.mint(f.router.target,100));await sent(f.quote.mint(f.router.target,100));
  await sent(f.router.sync(f.token.target));await sent(f.router.sync(f.quote.target));
  await roll(f,[f.converter.target,ethers.ZeroAddress,f.project]);
  f.job.legacy=[{kind:'usdgVault',address:f.vault.target,campaignId:'2',slot:0}];await queue(f,100,100);
  const before=await f.quote.balanceOf(f.vault.target),result=await runPrizeFlow(f.options);assert.equal(result.status,'degraded');
  assert.equal(result.unsafeDebt.length,1);assert.equal(result.unsafeDebt[0].amount,'80');
  assert.equal(await f.router.credit(f.token.target,f.vault.target),80n);assert.equal(await f.token.balanceOf(f.vault.target),0n);
  assert.equal(await f.quote.balanceOf(f.vault.target)-before,400n);assert.equal(await f.router.credit(f.quote.target,f.vault.target),0n);
});
test('two blocked legacy project credits cannot starve current converter or source',async()=>{
  const f=await setup(),a=await (await f.provider.getSigner(5)).getAddress(),b=await (await f.provider.getSigner(6)).getAddress();
  await roll(f,[f.converter.target,a,b],[6000,2000,2000]);
  for(const t of [f.token,f.quote]){await sent(t.mint(f.router.target,1000));await sent(f.router.sync(t.target));}
  await roll(f,[f.converter.target,ethers.ZeroAddress,f.project],[8000,0,2000]);
  f.job.legacy=[{kind:'project',address:a,campaignId:'2',slot:1},{kind:'project',address:b,campaignId:'2',slot:2}];
  await sent(f.quote.blockRecipient(a));await sent(f.token.blockRecipient(b));await queue(f,50,50);
  const before=await f.source.collections(),result=await runPrizeFlow(f.options);assert.equal(result.status,'degraded');
  assert.equal(result.failures.length,2);assert.equal(await f.router.credit(f.quote.target,a),200n);assert.equal(await f.router.credit(f.token.target,b),200n);
  assert.equal(await f.quote.balanceOf(f.project),10n);assert.equal(await f.token.balanceOf(f.project),10n);
  assert.equal(await f.source.collections(),before+1n);assert.equal(await f.converter.tokenSold(),640n);
});
for(const market of [false,true])for(const method of ['forwardQuote','convert'])test((market?'market ':'')+'unknown '+method+' receipt stops and preserves hash; confirmed tx resumes once',async()=>{
  const f=await setup(market),before=await f.quote.balanceOf(f.vault.target);await queue(f,0,100);
  await sent((method==='convert'?f.token:f.quote).mint(f.converter.target,10));
  const selector=f.converter.interface.getFunction(method).selector;let tx,blocked=false,after=0;
  const executor={provider:f.provider,getAddress:()=>f.executor.getAddress(),sendTransaction:async request=>{
    if(blocked)after++;
    if(request.data?.startsWith(selector)){
      blocked=true;await rpc('evm_setAutomine',[false]);tx=await f.executor.sendTransaction(request);return tx;
    }
    return f.executor.sendTransaction(request);
  }};
  try{
    const result=await runPrizeFlow({...f.options,executor,receiptTimeoutMs:100});
    assert.equal(result.status,'error',JSON.stringify(result));assert.equal(result.error.stage,'confirm');assert.equal(result.error.transactionHash,tx.hash);assert.equal(after,0);
    if(method==='forwardQuote')assert.equal(await f.source.collections(),0n);
  }finally{await rpc('evm_mine');await rpc('evm_setAutomine',[true]);if(tx)await tx.wait();}
  assert.equal((await runPrizeFlow(f.options)).status,'idle');
  assert.equal(await f.quote.balanceOf(f.vault.target)-before,method==='convert'?110n:90n);
});
test('validation before writes rejects stale campaign, swapped bindings and unsafe legacy relabeling',async()=>{
  const f=await setup();await sent(f.quote.mint(f.router.target,100));const nonce=await f.provider.getTransactionCount(await f.executor.getAddress());
  for(const mutate of [j=>j.active.vault=f.project,j=>j.active.floorNumerator='1',j=>j.campaignId='2',
    j=>j.source.positionId='999',j=>j.active.address=f.vault.target,
    j=>j.legacy=[{kind:'project',address:f.vault.target,campaignId:'1',slot:0}]]){
    const job=structuredClone(f.job);mutate(job);const result=await runPrizeFlow({...f.options,job});assert.equal(result.status,'error');assert.equal(result.steps,0);
  }
  assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),nonce);assert.equal(await f.router.accounted(f.quote.target),0n);
});
test('bounded portions/steps, gas/abort and source epoch drift do not silently report completion',async()=>{
  const f=await setup();await queue(f,2000,100);
  const stopped=await runPrizeFlow({...f.options,signal:AbortSignal.abort()});assert.equal(stopped.status,'stopped');
  const waiting=await runPrizeFlow({...f.options,job:{...f.job,maxGasPrice:'1'}});assert.equal(waiting.status,'waiting');assert.equal(waiting.reason,'gasPrice');
  assert.equal((await runPrizeFlow(f.options,{maxSteps:1})).status,'yielded');
  const first=await runPrizeFlow(f.options);assert.equal(first.status,'yielded');assert.equal(first.remainingInventory[0].amount,'600');
  assert.equal((await runPrizeFlow(f.options)).status,'idle');assert.equal(await f.converter.tokenSold(),1600n);
  await sent(f.source.setEpoch(2));await sent(f.source.fund(f.quote.target,100));const count=await f.source.collections();
  assert.equal((await runPrizeFlow(f.options)).status,'degraded');assert.equal(await f.source.collections(),count);assert.equal(await f.source.due(f.quote.target),0n);
});
for(const market of [false,true])test((market?'market ':'')+'prize flow CLI performs the full local collection/conversion pass',async t=>{
  const f=await setup(market),http=require('node:http'),fs=require('node:fs'),path=require('node:path');if(market)await simulationPolicy(f);await queue(f);
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const part of req)body+=part;const request=JSON.parse(body);
    async function handle(q){try{return {jsonrpc:'2.0',id:q.id,result:await rpc(q.method,q.params)};}
      catch(e){return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:e.message}};}}
    res.setHeader('content-type','application/json');res.end(JSON.stringify(Array.isArray(request)?await Promise.all(request.map(handle)):await handle(request)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  fs.mkdirSync('.local',{recursive:true});const file=path.resolve('.local','prize-flow-cli-test.json');fs.writeFileSync(file,JSON.stringify(f.job));t.after(()=>fs.unlinkSync(file));
  const execFile=require('node:util').promisify(require('node:child_process').execFile);
  const result=await execFile(process.execPath,['scripts/run-local-promo.cjs','--job',file,'--rpc','http://127.0.0.1:'+server.address().port,'--executor','1'],{timeout:30000});
  const summary=JSON.parse(result.stdout.trim().split('\n').at(-1));assert.equal(summary.action,'prizeFlowPass');assert.equal(summary.status,'idle');
  assert.equal(await f.converter.tokenSold(),480n);assert.equal(await f.converter.quoteForwarded(),1520n);
});

for(const fault of ['read','callback','rejectedCallback'])test('completed intent is absent from later '+fault+' error',async()=>{
  const f=await setup();await queue(f,0,100);
  if(fault==='rejectedCallback')await sent(f.source.setFailures(true,ethers.ZeroAddress,false));
  const original=f.provider.call.bind(f.provider);let collected=false;
  f.provider.call=async request=>{
    if(fault==='read'&&collected&&request.to?.toLowerCase()===f.source.target.toLowerCase()&&request.data?.startsWith(f.source.interface.getFunction('claimable').selector))
      throw Object.assign(new Error('synthetic read outage'),{code:'NETWORK_ERROR'});
    return original(request);
  };
  let result;
  try{result=await runPrizeFlow(f.options,{onStep:e=>{
    if(e.action==='collect'){
      collected=true;if(fault!=='read')throw new Error('callback failed');
    }
  }});}finally{f.provider.call=original;}
  assert.equal(result.status,'error');assert.equal(result.error.action,undefined);assert.equal(result.error.transactionHash,undefined);
  if(fault==='rejectedCallback'){assert.equal(result.lastConfirmed,undefined);assert.equal(result.failures[0].action,'collect');}
  else{assert.equal(result.lastConfirmed.action,'collect');assert(result.lastConfirmed.transactionHash);}
  assert.equal(await f.source.collections(),fault==='rejectedCallback'?0n:1n);
  assert.equal(await f.router.received(1,f.quote.target),0n);
});
test('maximum legacy converter list finishes at default bound',async()=>{
  const f=await setup();const old=[];
  for(let i=0;i<8;i++){
    old.push({...f.job.active,campaignId:f.job.campaignId,slot:0});
    await sent(f.token.mint(f.converter.target,1));await sent(f.quote.mint(f.converter.target,1));
    const vault=await f.deploy('PromoVault',[f.token.target,f.quote.target,f.short.target,100]);
    f.converter=await f.make(vault.target);await roll(f,[f.converter.target,i===7?await (await f.provider.getSigner(5)).getAddress():ethers.ZeroAddress,f.project],i===7?[6000,2000,2000]:f.job.bps);f.job.active=f.descriptor(f.converter,vault.target);
  }
  f.job.legacy=old;await queue(f,100,100);
  const result=await runPrizeFlow(f.options);assert.equal(result.status,'idle');assert.equal(result.remainingInventory.length,0);
  const {DEFAULT_MAX_STEPS,WORST_CASE_ATTEMPTS}=require('../scripts/local-prize-flow.cjs');
  assert(result.steps<=WORST_CASE_ATTEMPTS);assert(WORST_CASE_ATTEMPTS<=DEFAULT_MAX_STEPS);
  assert.equal(old.length,8);for(const c of old){assert.equal(await f.token.balanceOf(c.address),0n);assert.equal(await f.quote.balanceOf(c.address),0n);}
});
