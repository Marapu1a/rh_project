process.env.HARDHAT_CONFIG=require.resolve('./fixtures/public-hardhat.config.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers'),hre=require('hardhat');
const vector=require('../research/drand-feasibility/vector.json').beacon,target=1727521075+(vector.round-1)*3;
hre.config.networks.hardhat.initialDate=new Date((target-40*86400)*1000).toISOString();
const compiled=require('../scripts/compile.cjs').compile({writeArtifacts:false}),{fixture,rpc,sent}=require('./fixtures/public-controllers.cjs');
const {drawIdFor}=require('../scripts/draw-id.cjs'),sd=require('../scripts/short-dataset.cjs'),{monthlyRoot}=require('./fixtures/dual-controller.cjs');
const ps=require('./fixtures/short-outcome.cjs').participants(2,1),id=ethers.id;
const requests=(b)=>({s:{drawId:drawIdFor('SHORT',id('public short')),campaignId:1,rulesEpoch:1,cutoffBlockNumber:b.number,cutoffBlockHash:b.hash,snapshotHash:id('short snapshot'),expectedRoot:sd.rootFor(ps),expectedCount:2,expectedAttempts:2,budget:100_000000},m:{drawId:drawIdFor('MONTHLY',id('public month')),campaign:1,rulesEpoch:1,cutoff:b.number,cutoffHash:b.hash,snapshotHash:id('monthly snapshot'),root:monthlyRoot(ps),count:2,attempts:2}});

test('Monthly minimum rejects freeze atomically, worker waits and resumes at 100 USDG including direct funding',async t=>{
 const f=await require('./fixtures/robinhood-runtime.cjs').setup(t,compiled);
 const ids=await require('./fixtures/robinhood-obligations.cjs').prepare(f,{freeze:false,fund:false});
 await sent(f.quote.mint(f.owner,200_000001));await sent(f.quote.approve(f.vault.target,ethers.MaxUint256));
 await sent(f.vault.fundUSDG(99_999999,2));await sent(f.vault.fundUSDG(100_000000,3));
 assert.equal(await f.monthly.minimumMonthlyBudget(),100_000000n);
 await assert.rejects(f.monthly.sealMonth(ids.mId),e=>e.data===ethers.id('MonthlyBudgetNotReady()').slice(0,10));
 assert.equal(await f.vault.freeCurrent(),99_999999n);assert.equal(await f.vault.freeNext(),100_000000n);
 assert.equal(await f.vault.reserved(f.quote.target),0n);assert.equal(await f.monthly.drawRequest(ids.mId),0n);
 assert.equal((await f.monthly.month(ids.mId)).phase,2n);assert.equal(await f.monthly.activeMonth(),ids.mId);
 const {stepMonthly,makeMonthlyJob}=require('../scripts/local-monthly-executor.cjs'),job=makeMonthlyJob(ids.ma,1);
 const preflight=require('../scripts/drand-preflight.cjs'),original=preflight.drandPreflight;
 // Test funding/recovery only; external beacon freshness is independently tested.
 preflight.drandPreflight=async()=>({status:'observedHealthy'});
 try{await require('../scripts/runtime-network.cjs').withRobinhoodNetwork(f.options,async()=>{
  const step=()=>stepMonthly({provider:f.provider,source:f.monthly,job,publisher:f.admin,executor:f.admin});
  const nonce=await f.provider.getTransactionCount(f.owner);
  for(let i=0;i<2;i++){const r=await step();assert.equal(r.status,'waiting');assert.equal(r.reason,'currentFunding');}
  assert.equal(await f.provider.getTransactionCount(f.owner),nonce);
  // General direct transfer has no sender intent: half Short, remainder Current since Next is full.
  await sent(f.quote.transfer(f.vault.target,2));assert.equal(await f.vault.unrecognizedUSDG(),2n);
  const r=await step();assert.equal(r.action,'sealMonth');assert.equal((await f.monthly.month(ids.mId)).budget,100_000000n);
  assert.equal(await f.vault.freeShort(),1n);assert.equal(await f.vault.freeCurrent(),0n);
  assert.equal(await f.vault.freeNext(),100_000000n);assert.equal(await f.vault.reserved(f.quote.target),100_000000n);
  assert((await f.monthly.drawRequest(ids.mId))>0n);
 });}finally{preflight.drandPreflight=original;}
});

test('public wrappers enforce checkpoint admission and complete both draws with authentic drand and exact bytecode',async()=>{
 const f=await fixture(compiled);
 await assert.rejects(f.deploy('RobinhoodMonthlyController',[{...f.base,interval:30*86400},f.rules]));
 for(const [name,c] of [['RobinhoodShortController',f.short],['RobinhoodMonthlyController',f.monthly]])assert((await f.provider.getCode(c.target)).length/2-1<=24576,name);
 await sent(f.quote.mint(f.owner,2000_000000));await sent(f.quote.approve(f.vault.target,ethers.MaxUint256));
 await sent(f.vault.fundUSDG(500_000000,1));await sent(f.vault.fundUSDG(500_000000,2));await sent(f.vault.fundUSDG(100_000000,3));
 await rpc('evm_setNextBlockTimestamp',[target-2300]);await rpc('evm_mine');const b=await f.head(),{s,m}=requests(b);
 await assert.rejects(f.short.begin(id('proposal'),s));await assert.rejects(f.monthly.beginMonth(m));
 for(const c of [f.short,f.monthly])await sent(c.connect(f.other).checkpointCutoff(b.number));
 await rpc('hardhat_mine',['0x110']);
 await assert.rejects(f.short.connect(f.other).begin(id('proposal'),s));await assert.rejects(f.monthly.connect(f.other).beginMonth(m));
 await sent(f.short.begin(id('proposal'),s));await sent(f.monthly.beginMonth(m));
 await sent(f.short.publish(id('proposal'),ps));await sent(f.monthly.publishMonth(m.drawId,ps));
 await rpc('evm_setNextBlockTimestamp',[target-1801]);await rpc('evm_setAutomine',[false]);
 try{const a=await f.short.seal(id('proposal'),{gasLimit:3000000}),b=await f.monthly.sealMonth(m.drawId,{gasLimit:3000000});await rpc('evm_mine');await a.wait();await b.wait();}finally{await rpc('evm_setAutomine',[true]);}
 const ids=[await f.short.drawRequest(s.drawId),await f.monthly.drawRequest(m.drawId)];
 for(const key of ids)assert.equal((await f.random.requests(key)).round,BigInt(vector.round));
 await rpc('evm_setNextBlockTimestamp',[target+10]);await rpc('evm_mine');
 for(const key of ids){await sent(f.random.prove(key,'0x'+vector.signature));await sent(f.random.deliver(key));}
 await sent(f.short.processShort(s.drawId,0,ps));await sent(f.short.finishShort(s.drawId));await sent(f.monthly.processMonth(m.drawId,0,ps));await sent(f.monthly.finishMonth(m.drawId));
 assert.equal(await f.vault.reserved(f.quote.target),0n);assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
 for(const draw of [s.drawId,m.drawId]){
  let paid=0n;for(const p of ps){const reward=await f.vault.reward(draw,p.wallet);if(reward>0n){paid+=reward;await sent(f.vault.claim(draw,p.wallet));}}
  if(draw===s.drawId)assert(paid>0n,'Short fixture must exercise a real USDG payout');
  else{const month=await f.monthly.month(draw),expected=require('../scripts/monthly-outcome.cjs').expectedResult(month,{rules:f.monthlyRules,snapshot:{participants:ps}});
   assert.equal(month.resultHash,expected.resultHash);assert.equal(paid,expected.winner===ethers.ZeroAddress?0n:month.budget);
   assert.equal(await f.vault.freeCurrent(),expected.winner===ethers.ZeroAddress?500_000000n:100_000000n);
   assert.equal(await f.vault.freeNext(),expected.winner===ethers.ZeroAddress?100_000000n:0n);
  }
 }
 assert.equal(await f.vault.claimable(f.quote.target),0n);
 for(const c of [f.short,f.monthly])await assert.rejects(c.fulfill(1,ethers.ZeroHash));
});

test('public constructors reject non-drand RNG, wrong binding, interval and local wrappers on Nitro',async()=>{
 const f=await fixture(compiled),mock=f.token;
 await assert.rejects(f.deploy('RobinhoodShortController',[{...f.base,provider:mock.target,maxBudget:100},f.rules,[7,5,3],1]));
 await assert.rejects(f.deploy('RobinhoodMonthlyController',[{...f.base,provider:mock.target,interval:2592000},f.monthlyRules]));
 await assert.rejects(f.deploy('RobinhoodShortController',[{...f.base,maxBudget:100},f.rules,[7,5,3],1]));
 await assert.rejects(f.deploy('RobinhoodMonthlyController',[{...f.base,interval:1},f.monthlyRules]),/monthly interval/);
 await assert.rejects(f.deploy('LocalShortController',[{...f.base,maxBudget:100},f.rules,[7,5,3]]));
 await assert.rejects(f.deploy('LocalMonthlyController',[{...f.base,interval:2592000},f.rules]));
});

test('public empty draining epochs require checkpoints and preserve clocks',async()=>{
 const f=await fixture(compiled);await sent(f.short.announce(f.rules,[7,5,3],1));await sent(f.monthly.announce(f.monthlyRules));
 await rpc('evm_increaseTime',[2592001]);await rpc('evm_mine');await sent(f.short.activate());await sent(f.monthly.activate());await rpc('evm_mine');
 const b=await f.head(),sc=await f.short.lastShortTerminalAt(),mc=await f.monthly.lastMonthAt();
 for(const c of [f.short,f.monthly]){await assert.rejects(c.closeEmpty(b.number,b.hash,id('empty')));await sent(c.checkpointCutoff(b.number));}
 await rpc('hardhat_mine',['0x110']);for(const c of [f.short,f.monthly])await sent(c.closeEmpty(b.number,b.hash,id('empty')));
 assert.equal(await f.short.drainingShortEpoch(),0n);assert.equal(await f.monthly.drainingMonthlyEpoch(),0n);
 assert.equal(await f.short.lastShortTerminalAt(),sc);assert.equal(await f.monthly.lastMonthAt(),mc);
});

test('public deployment inspection checks generation and keeps execution disabled',async()=>{
 const f=await fixture(compiled),code=async c=>ethers.keccak256(await f.provider.getCode(c.target));
 const hook=await f.deploy('InfinityHookFixture'),factory=await f.deploy('InfinityFactoryFixture');
 const collector=await f.deploy('InfinityCollector',[f.owner,f.token.target,f.quote.target,hook.target,factory.target]);
 const source=await f.deploy('InfinityVaultFixture',[f.token.target,hook.target,factory.target,collector.target]);
 await sent(hook.configure(source.target,300));const h=await f.provider.getBlock('latest'),recipients=[f.vault.target,await (await f.provider.getSigner(3)).getAddress(),await (await f.provider.getSigner(4)).getAddress()],bps=[9000,500,500];
 await sent(collector.bindSource(source.target,[h.timestamp+100,recipients,bps]));const anchor={number:h.number,hash:h.hash};
 const config={fundingJob:{chainId:4663,collector:collector.target,collectorCodeHash:await code(collector),source:source.target,sourceFingerprint:await collector.sourceFingerprint(),campaignId:'1',recipients,bps,anchor},
 deliveryJob:{chainId:4663,short:f.short.target,shortCodeHash:await code(f.short),monthly:f.monthly.target,monthlyCodeHash:await code(f.monthly),adapter:f.random.target,adapterCodeHash:await code(f.random),anchor},
 schedulerConfig:{cutoffMode:'FINALIZED_CHECKPOINT',manifest:{chainId:4663,token:f.token.target,quote:f.quote.target,registry:f.registry.target,quoteDecimals:6,codeHashes:{token:await code(f.token),quote:await code(f.quote),registry:await code(f.registry)},anchor},lifecycle:{vault:f.vault.target,vaultCodeHash:await code(f.vault),instanceId:await f.short.datasetInstance(),monthlyInstanceId:await f.monthly.monthlyInstance()}}};
 const {createDeploymentProfile,inspectDeployment}=require('../scripts/deployment-admission.cjs');
 const options={scope:'public-launch',executor:f.owner,sourceCodeHash:await code(source),timing:{leadSeconds:'1800',maxClockLag:'30',maxClockAhead:'5',maxFinalizedLag:'1200',maxBeaconLag:'15',shortInterval:'21600',monthlyInterval:'2592000',cutoffDelayBlocks:'1'}};
 const profile=createDeploymentProfile(config,options),result=await inspectDeployment(f.provider,profile,config);
 assert.deepEqual(result.reasons,['publicExecutionNotImplemented'],JSON.stringify(result));assert(result.checks.every(c=>c.ok));assert.equal(result.publicLaunchReady,false);
 config.schedulerConfig.cutoffMode='LOCAL_HEAD';const bad=await inspectDeployment(f.provider,createDeploymentProfile(config,options),config);assert(bad.reasons.includes('publicCheckpointMode'));
});


test('public Short genesis minimum prize unit is explicit rather than the local fixture constant',async()=>{
 const f=await fixture(compiled,{minimumUnit:1000000});
 assert.equal((await f.short.shortEpochPolicy(1)).minimumUnit,1000000n);
});
