process.env.HARDHAT_CONFIG=require.resolve('./fixtures/public-hardhat.config.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{ethers}=require('ethers'),hre=require('hardhat');
const {prepare,beacon,target}=require('./fixtures/robinhood-obligations.cjs');hre.config.networks.hardhat.initialDate=new Date((target-40*86400)*1000).toISOString();
const compiled=require('../scripts/compile.cjs').compile({writeArtifacts:false});
const {setup,rpc}=require('./fixtures/robinhood-runtime.cjs'),{runRobinhoodAutomation:run}=require('../scripts/robinhood-automation.cjs');
const read=f=>JSON.parse(fs.readFileSync(f.options.statePath));
async function fixture(t,{freeze=true,project=false}={}){
 const f=await setup(t,compiled);
 if(project){
  const recipients=[f.vault.target,await f.other.getAddress(),await (await f.provider.getSigner(3)).getAddress()],bps=[9000,500,500];
  await rpc('evm_increaseTime',[101]);await rpc('evm_mine');
  await (await f.collector.rollCampaign(1,[(await f.provider.getBlock('latest')).timestamp+100,recipients,bps])).wait();
  f.options.fundingJob={...f.options.fundingJob,campaignId:'2',recipients,bps};
  f.options.schedulerConfig={...f.options.schedulerConfig,campaignId:'2'};
  const old=f.options.deploymentProfile;f.options.deploymentProfile=require('../scripts/deployment-admission.cjs').createDeploymentProfile(f.options,{scope:old.scope,executor:old.executor,timing:old.timing,sourceCodeHash:old.pins.source[1]});
 }
 if(freeze)await prepare(f);
 f.options.nativeRefill={kind:project?'PROJECT_NATIVE':'BOOTSTRAP_NATIVE',source:await f.other.getAddress(),minimumBalance:'1000000',transferGas:'30000',maxPerRefill:ethers.parseEther('100').toString(),maxPerPeriod:ethers.parseEther('200').toString(),periodSeconds:'86400',cooldownSeconds:'0'};
 f.options.refillSigner=f.other;f.options.drain=true;
 await rpc('hardhat_setBalance',[f.owner,'0x0']);return f;
}
test('empty executor refills once and automatically completes both frozen draws and claims during source outage',async t=>{
 const f=await fixture(t);await rpc('hardhat_setCode',[f.source.target,'0x60006000fd']);
 const before=await f.provider.getBalance(f.options.nativeRefill.source),r=await run(f.options,{getBeacon:beacon});
 assert.equal(r.results.refill.status,'confirmed',JSON.stringify(r));
 for(const action of ['finishShort','finishMonth','claim'])assert(r.steps.some(s=>s.action===action),JSON.stringify(r));
 assert.equal(await f.vault.reserved(f.quote.target),0n);assert.equal(await f.vault.claimable(f.quote.target),0n);
 const s=read(f);assert(!s.pending);assert.equal(before-await f.provider.getBalance(f.options.nativeRefill.source),BigInt(s.refillHistory.spent));
 const nonce=await f.provider.getTransactionCount(f.options.nativeRefill.source);await run(f.options,{getBeacon:beacon});assert.equal(await f.provider.getTransactionCount(f.options.nativeRefill.source),nonce);
});
test('empty ETH source waits, then external top-up resumes automatically',async t=>{
 const f=await fixture(t);await rpc('hardhat_setBalance',[f.options.nativeRefill.source,'0x0']);
 const r=await run(f.options,{getBeacon:beacon});assert.equal(r.results.refill.reason,'refillBudget',JSON.stringify(r));assert(!read(f).pending);
 await rpc('hardhat_setBalance',[f.options.nativeRefill.source,ethers.toQuantity(ethers.parseEther('100'))]);
 const next=await run(f.options,{getBeacon:beacon});assert(next.steps.some(s=>s.action==='finishMonth'),JSON.stringify(next));
});
test('expensive gas waits without refill intent or spending',async t=>{
 const f=await fixture(t);f.options.ops.maxGasPrice='1';const nonce=await f.provider.getTransactionCount(f.options.nativeRefill.source);
 const r=await run(f.options,{getBeacon:beacon});assert.equal(r.results.refill,undefined);assert.equal(await f.provider.getTransactionCount(f.options.nativeRefill.source),nonce);assert(!read(f).pending);
});
for(const known of [true,false])test((known?'known':'unknown')+' refill send is never blindly repeated on restart',async t=>{
 const f=await fixture(t),real=f.other,ownerNonce=await f.provider.getTransactionCount(f.owner);
 const signer=new Proxy(real,{get(t,k){if(k==='sendTransaction')return async request=>{const tx=await real.sendTransaction(request);if(!known)throw Object.assign(Error('lost response'),{code:'ECONNRESET'});return {hash:tx.hash,wait:async()=>{throw Object.assign(Error('timeout'),{code:'TIMEOUT'});}};};return Reflect.get(t,k);}});
 const r=await run({...f.options,refillSigner:signer},{getBeacon:beacon});assert.equal(r.status,'blocked',JSON.stringify(r));assert(read(f).pending);
 const nonce=await f.provider.getTransactionCount(f.options.nativeRefill.source),next=await run(f.options,{getBeacon:beacon});
 assert.equal(await f.provider.getTransactionCount(f.options.nativeRefill.source),nonce,JSON.stringify(next));
 if(known){assert(!read(f).pending);assert(next.steps.some(s=>s.action==='finishMonth'),JSON.stringify(next));}else{assert.equal(next.reason,'unknownHash');assert(read(f).pending);assert.equal(await f.provider.getTransactionCount(f.owner),ownerNonce);}
});
test('partial refill obeys period cap including gas and blocks new spending',async t=>{
 const f=await fixture(t);f.options.nativeRefill.maxPerRefill='40000000000000000';f.options.nativeRefill.maxPerPeriod='40000000000000000';
 const first=await run(f.options,{getBeacon:beacon});assert.equal(first.results.refill.status,'confirmed',JSON.stringify(first));
 const s=read(f);assert(BigInt(s.refillHistory.spent)<=BigInt(f.options.nativeRefill.maxPerPeriod));
 await rpc('hardhat_setBalance',[f.owner,'0x0']);const again=await run(f.options,{getBeacon:beacon});assert.equal(again.results.refill.reason,'refillBudget',JSON.stringify(again));
});
test('custody source and policy change cannot silently reset spending history',async t=>{
 const f=await fixture(t);await assert.rejects(run({...f.options,nativeRefill:{...f.options.nativeRefill,source:f.vault.target}}),/separate/);
 await run(f.options,{getBeacon:beacon});await assert.rejects(run({...f.options,nativeRefill:{...f.options.nativeRefill,maxPerPeriod:'999'}}),/config|identity|mismatch/i);
});
test('critical admission failure blocks refill; receipts still reconcile before admission',async t=>{
 const f=await fixture(t),real=f.other,ownerNonce=await f.provider.getTransactionCount(f.owner);
 const signer=new Proxy(real,{get(t,k){if(k==='sendTransaction')return async request=>{const tx=await real.sendTransaction(request);return {hash:tx.hash,wait:async()=>{throw Object.assign(Error('timeout'),{code:'TIMEOUT'});}};};return Reflect.get(t,k);}});
 await run({...f.options,refillSigner:signer},{getBeacon:beacon});assert(read(f).pending);
 await rpc('hardhat_setCode',[f.vault.target,'0x60006000fd']);const nonce=await f.provider.getTransactionCount(f.options.nativeRefill.source);
 const r=await run(f.options,{getBeacon:beacon});assert.equal(r.reason,'obligationAdmission');assert(!read(f).pending);assert.equal(await f.provider.getTransactionCount(f.options.nativeRefill.source),nonce);
});

test('cooldown survives restart; an unfunded source does not block already funded obligations',async t=>{
 const f=await fixture(t);f.options.nativeRefill.cooldownSeconds='3600';
 const stop=new AbortController();await run({...f.options,signal:stop.signal},{getBeacon:beacon,onStep:s=>{if(s.action==='transferNative')stop.abort();}});
 const source=f.options.nativeRefill.source,nonce=await f.provider.getTransactionCount(source);
 await rpc('hardhat_setBalance',[f.owner,'0x0']);const r=await run(f.options,{getBeacon:beacon});assert.equal(r.results.refill.reason,'refillCooldown',JSON.stringify(r));assert.equal(await f.provider.getTransactionCount(source),nonce);
 await rpc('hardhat_setBalance',[source,'0x0']);await rpc('hardhat_setBalance',[f.owner,ethers.toQuantity(ethers.parseEther('100'))]);
 const resumed=await run(f.options,{getBeacon:beacon});assert(resumed.steps.some(s=>s.action==='finishMonth'),JSON.stringify(resumed));assert.equal(await f.provider.getTransactionCount(source),nonce);
});

test('post-send fee envelope mismatch is accounted and halts further refill without replay',async t=>{
 const f=await fixture(t),real=f.other,stop=new AbortController();
 const signer=new Proxy(real,{get(t,k){if(k==='sendTransaction')return request=>real.sendTransaction({...request,gasLimit:request.gasLimit+1n});return Reflect.get(t,k);}});
 await run({...f.options,refillSigner:signer,signal:stop.signal},{getBeacon:beacon,onStep:s=>{if(s.action==='transferNative')stop.abort();}});
 assert(read(f).refillHalt);assert(!read(f).pending);assert(BigInt(read(f).refillHistory.spent)>0n);
 await rpc('hardhat_setBalance',[f.owner,'0x0']);const nonce=await f.provider.getTransactionCount(f.options.nativeRefill.source),r=await run(f.options,{getBeacon:beacon});
 assert.equal(r.results.refill.reason,'refillHalt',JSON.stringify(r));assert.equal(await f.provider.getTransactionCount(f.options.nativeRefill.source),nonce);
});

test('normal funding resumes from zero native; RPC read failure does not create an intent',async t=>{
 const f=await fixture(t,{freeze:false});f.options.drain=false;
 const original=f.provider.getBalance.bind(f.provider);f.provider.getBalance=async(a,...args)=>{if(String(a).toLowerCase()===f.options.nativeRefill.source.toLowerCase())throw Object.assign(Error('RPC offline'),{code:'ECONNRESET'});return original(a,...args);};
 const first=await run(f.options);assert(!read(f).pending);assert.notEqual(first.results.refill?.status,'confirmed');
 f.provider.getBalance=original;
 const second=await run(f.options);assert.equal(second.results.refill.status,'confirmed',JSON.stringify(second));
 for(let i=0;i<2&&await f.vault.freeShort()===0n;i++)await run(f.options);
 assert(await f.vault.freeShort()>0n);
});

test('refill for a Ready monthly job first covers frozen Short and cannot spend its reserve on a new freeze',async t=>{
 const f=await fixture(t,{freeze:false});f.options.drain=false;
 await rpc('hardhat_setBalance',[f.owner,ethers.toQuantity(ethers.parseEther('100'))]);
 const ids=await prepare(f,{freeze:false});await rpc('evm_setNextBlockTimestamp',[target-1801]);await (await f.short.seal(ids.proposal)).wait();
 await rpc('evm_setNextBlockTimestamp',[target+10]);await rpc('evm_mine');await rpc('hardhat_setBalance',[f.owner,'0x0']);
 const preflight=require('../scripts/drand-preflight.cjs'),original=preflight.drandPreflight;preflight.drandPreflight=async()=>({status:'observedHealthy'});
 try{
  const r=await run(f.options,{getBeacon:async()=>{throw Error('beacon temporarily unavailable');}});
  assert.equal(r.results.refill.status,'confirmed',JSON.stringify(r));assert.equal(r.steps.filter(s=>s.action==='transferNative').length,1);
  assert.equal(await f.short.pendingDatasetDraw(),ids.sId);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
  assert(!r.steps.some(s=>['sealMonth','pull','pay'].includes(s.action)),JSON.stringify(r));
  // 1 chunk + finish + prove + deliver + 3 possible claims, at the fixture's conservative ceiling.
  const cost=require('../scripts/local-execution-budget.cjs').transactionCost(f.options.ops,'3000000');
  assert.equal(BigInt(read(f).lastRefill.value),7n*cost+BigInt(f.options.ops.nativeFloor));
 }finally{preflight.drandPreflight=original;}
});

test('coherent higher child floors: expensive gas waits across restart then refill and both draws resume',async t=>{
 const f=await fixture(t),floor=ethers.parseEther('1').toString();
 f.options.deliveryJob.nativeFloor=floor;f.options.fundingJob.nativeFloor=floor;
 await assert.rejects(run(f.options),/ops.nativeFloor must cover/);assert(!fs.existsSync(f.options.statePath));
 f.options.ops.nativeFloor=floor;
 const profile=f.options.deploymentProfile;f.options.deploymentProfile=require('../scripts/deployment-admission.cjs').createDeploymentProfile(f.options,{scope:profile.scope,executor:f.owner,timing:profile.timing,sourceCodeHash:profile.pins.source[1]});
 const original=f.provider.getFeeData.bind(f.provider),high=BigInt(f.options.ops.maxGasPrice)*2n;
 f.provider.getFeeData=async()=>({gasPrice:high,maxFeePerGas:high,maxPriorityFeePerGas:0n});
 const {runWatch}=require('../scripts/local-rpc-watch.cjs'),{observePromoStatus}=require('../scripts/promo-operational-status.cjs'),events=[];
 const pass=()=>run(f.options,{getBeacon:beacon}),observe=r=>observePromoStatus(f.options.statePath,r),emit=r=>events.push(r);
 const nonce=await f.provider.getTransactionCount(f.options.nativeRefill.source);
 await runWatch({pass,observe,emit,pollMs:1});assert.equal(events.at(-1).operational.event.current.reasons[0],'expensiveGas');
 await runWatch({pass,observe,emit,pollMs:1});assert(!events.at(-1).operational.event);assert.equal(await f.provider.getTransactionCount(f.options.nativeRefill.source),nonce);assert(!read(f).pending);
 f.provider.getFeeData=original;
 await runWatch({pass,observe,emit,pollMs:1});const resumed=events.at(-1);assert.equal(resumed.operational.event.type,'recovered',JSON.stringify(resumed));
 for(const action of ['finishShort','finishMonth','claim'])assert(resumed.steps.some(s=>s.action===action),JSON.stringify(resumed));
 assert(await f.provider.getBalance(f.owner)>=BigInt(floor));assert.equal(await f.vault.claimable(f.quote.target),0n);
});

for(const known of [true,false])test('project slot1 '+(known?'known':'unknown')+' send preserves recovery without duplicate refill',async t=>{
 const f=await fixture(t,{project:true}),real=f.other;
 const signer=new Proxy(real,{get(t,k){if(k==='sendTransaction')return async request=>{const tx=await real.sendTransaction(request);if(!known)throw Object.assign(Error('lost response'),{code:'ECONNRESET'});return {hash:tx.hash,wait:async()=>{throw Object.assign(Error('timeout'),{code:'TIMEOUT'});}};};return Reflect.get(t,k);}});
 await run({...f.options,refillSigner:signer},{getBeacon:beacon});assert(read(f).pending);
 const nonce=await f.provider.getTransactionCount(real.address),next=await run(f.options,{getBeacon:beacon});
 assert.equal(await f.provider.getTransactionCount(real.address),nonce);
 if(known){assert(!read(f).pending);assert(next.steps.some(s=>s.action==='finishMonth'),JSON.stringify(next));}else assert.equal(next.reason,'unknownHash');
});
test('project slot1 empty source waits then top-up completes frozen obligations without spending USDG',async t=>{
 const f=await fixture(t,{project:true}),source=f.options.nativeRefill.source;
 await rpc('hardhat_setBalance',[source,'0x0']);const usdBefore=await f.quote.balanceOf(source);
 assert.equal((await run(f.options,{getBeacon:beacon})).results.refill.reason,'refillBudget');
 await rpc('hardhat_setBalance',[source,ethers.toQuantity(ethers.parseEther('100'))]);
 const r=await run(f.options,{getBeacon:beacon});assert.equal(r.results.refill.status,'confirmed',JSON.stringify(r));
 assert(r.steps.some(s=>s.action==='finishMonth'));assert.equal(await f.quote.balanceOf(source),usdBefore);
});

test('project swap gets seed ETH before partial refill; waiting approval does not drain source',async t=>{
 const f=await fixture(t,{project:true}),engine=require('../scripts/ops-market-executor.cjs'),original=engine.execute;
 f.options.nativeRefill.swap={amountRaw:'10000000',maxUsdPerPeriod:'10000000',periodSeconds:'86400',cooldownSeconds:'0',allowanceSeconds:'600',maxNativeFeesPerPeriod:'10000000000000000',slippageBps:50,maxImpactBps:100,maxAgeSeconds:30,deadlineSeconds:120,maxGasPrice:'1000000000',maxGasUnits:'30000',nativeFloor:'1000000',extraFeeWei:'0',localFork:false};
 await rpc('hardhat_setBalance',[f.options.nativeRefill.source,ethers.toQuantity(1000000000000000n)]);
 const before=await f.provider.getBalance(f.options.nativeRefill.source);let seen=0;
 engine.execute=async a=>{seen++;assert.equal(a.source,f.options.nativeRefill.source);assert(!a.state.pending);return {status:'waiting',reason:'opsSwapCooldown'};};
 try{const r=await run(f.options,{getBeacon:beacon});assert.equal(seen,1);assert.equal(r.results.opsSwap.reason,'opsSwapCooldown');assert.equal(await f.provider.getBalance(f.options.nativeRefill.source),before);assert(!r.steps.some(s=>s.action==='transferNative'));}finally{engine.execute=original;}
});

test('main recovery dispatch reconciles operations sender rather than executor and never replays approval',async t=>{
 const f=await fixture(t,{project:true,freeze:false});await run(f.options);
 const head=await f.provider.getBlock('latest'),source=await f.other.getAddress();
 const tx=await f.quote.connect(f.other).approve(f.owner,1,{gasLimit:100000,type:2,maxFeePerGas:1000000000000n,maxPriorityFeePerGas:0});await tx.wait();
 const {prepareRuntime}=require('../scripts/promo-automation.cjs'),{withRobinhoodNetwork}=require('../scripts/runtime-network.cjs');
 const ready=await withRobinhoodNetwork({...f.options,mode:'robinhood-rehearsal'},()=>prepareRuntime({...f.options,deferContractChecks:true}));
 const pending={worker:'opsMarket',action:'approveUSDG',chainId:'4663',from:source,to:f.quote.target,data:tx.data,nonce:tx.nonce,gasLimit:'100000',maxFeePerGas:'1000000000000',maxFee:'100000000000000000',maxNativeFeesPerPeriod:'1000000000000000000',anchor:{number:head.number,hash:head.hash,timestamp:head.timestamp},periodSeconds:'86400',maxUsdPerPeriod:'10000000',amountRaw:'10000000',minOut:'1',quote:f.quote.target,weth:f.token.target,transactionHash:tx.hash};
 await require('../scripts/local-scheduler-state.cjs').withState(ready.files.main,ready.identity,async(state,save)=>{state.pending=pending;save(state);});
 const nonce=await f.provider.getTransactionCount(source),r=await run(f.options);assert.equal(r.results.opsSwap.status,'confirmed',JSON.stringify(r));assert(!read(f).pending);assert(!read(f).opsSwapHalt);assert.equal(await f.provider.getTransactionCount(source),nonce);
});

test('old obligation advances without market while preserving operations seed',async t=>{
 const f=await fixture(t,{project:true}),engine=require('../scripts/ops-market-executor.cjs'),original=engine.execute;
 const cost=require('../scripts/local-execution-budget.cjs').transactionCost,seed=1000000000000000n;
 f.options.nativeRefill.swap={amountRaw:'10000000',maxUsdPerPeriod:'10000000',periodSeconds:'86400',cooldownSeconds:'0',allowanceSeconds:'600',maxNativeFeesPerPeriod:'10000000000000000',slippageBps:50,maxImpactBps:100,maxAgeSeconds:30,deadlineSeconds:120,maxGasPrice:'1000000000',maxGasUnits:'30000',nativeFloor:String(seed),extraFeeWei:'0',localFork:false};
 const one=cost(f.options.ops,'3000000')+BigInt(f.options.ops.nativeFloor),transfer=cost(f.options.ops,f.options.nativeRefill.transferGas);
 await rpc('hardhat_setBalance',[f.options.nativeRefill.source,ethers.toQuantity(seed+one+transfer)]);
 engine.execute=async()=>{throw Error('market must not gate funded old action');};
 try{const r=await run(f.options,{getBeacon:beacon});assert(r.steps.some(s=>s.action==='transferNative'),JSON.stringify(r));assert(r.results.rng.steps.some(s=>s.action==='prove'),JSON.stringify(r));assert(await f.provider.getBalance(f.options.nativeRefill.source)>=seed);assert.equal(BigInt(read(f).lastRefill.value),one);}finally{engine.execute=original;}
});

test('coordinator collects existing slot1 credit with empty executor and resumes known receipt without duplicate pay',async t=>{
 const f=await fixture(t,{project:true}),engine=require('../scripts/ops-market-executor.cjs'),original=engine.execute;
 await rpc('hardhat_setBalance',[f.owner,ethers.toQuantity(ethers.parseEther('10'))]);
 await (await f.quote.mint(f.collector.target,200000000n)).wait();await (await f.collector.sync()).wait();
 const source=f.options.nativeRefill.source,credit=await f.collector.credit(source);assert(credit>0n);assert.equal(await f.quote.balanceOf(source),0n);
 await rpc('hardhat_setBalance',[f.owner,'0x0']);await rpc('hardhat_setBalance',[source,ethers.toQuantity(1000000000000000n)]);
 f.options.nativeRefill.swap={amountRaw:'10000000',maxUsdPerPeriod:'10000000',periodSeconds:'86400',cooldownSeconds:'0',allowanceSeconds:'600',maxNativeFeesPerPeriod:'10000000000000000',slippageBps:50,maxImpactBps:100,maxAgeSeconds:30,deadlineSeconds:120,maxGasPrice:'3000000000',maxGasUnits:'300000',nativeFloor:'1000000',extraFeeWei:'0',localFork:false};
 const real=f.other,broken=new Proxy(real,{get(o,k){if(k==='sendTransaction')return async req=>{const tx=await real.sendTransaction(req);return {hash:tx.hash,wait:async()=>{throw Object.assign(Error('receipt lost'),{code:'TIMEOUT'});}};};return Reflect.get(o,k);}});
 // Historical drand fixture clock; only the sender freshness clock follows that chain.
 engine.execute=async args=>{const now=Date.now,head=await f.provider.getBlock('latest');Date.now=()=>head.timestamp*1000;try{return await original(args);}finally{Date.now=now;}};
 try{
  const first=await run({...f.options,refillSigner:broken},{getBeacon:beacon});assert.equal(read(f).pending?.action,'collectOps',JSON.stringify(first));assert.equal(await f.collector.credit(source),0n);assert.equal(await f.quote.balanceOf(source),credit);
  const nonce=await f.provider.getTransactionCount(source);
  engine.execute=async()=>({status:'waiting',reason:'priceImpact'});
  const r=await run(f.options,{getBeacon:beacon});assert(!read(f).pending);assert.equal(read(f).lastOpsSwap.action,'collectOps');assert.equal(read(f).lastOpsSwap.usdReceived,String(credit));assert.equal(await f.provider.getTransactionCount(source),nonce);assert(!read(f).opsSwapHalt,JSON.stringify(r));
 }finally{engine.execute=original;}
});
