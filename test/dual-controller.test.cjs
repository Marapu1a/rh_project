const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs');
const {fixture,rpc,sent,advance,monthlyRoot}=require('./fixtures/dual-controller.cjs');
const {participants,normalRules}=require('./fixtures/short-outcome.cjs');
const model=require('../scripts/short-outcome.cjs'),dataset=require('../scripts/short-dataset.cjs');
const shortModel=require('../scripts/short-settlement.cjs');
const {drawIdFor}=require('../scripts/draw-id.cjs');
const compiled=compile(),id=ethers.id,sid=s=>drawIdFor('SHORT',id(s)),mid=s=>drawIdFor('MONTHLY',id(s));
async function accounting(f){return [await f.vault.freeShort(),await f.vault.freeCurrent(),await f.vault.freeNext(),
  await f.vault.reserved(f.quote.target),await f.vault.claimable(f.quote.target),await f.vault.pendingMonthlyDrawId(),await f.vault.generalFundingPhase()];}
async function conserved(f){const [s,c,n,res,cl]=await accounting(f);assert.equal(await f.quote.balanceOf(f.vault.target),s+c+n+res+cl+await f.vault.unrecognizedUSDG());}
test('immutable distinct reverse bindings; legacy getter grants only Short authority',async()=>{
  const f=await fixture(compiled);assert.equal(await f.vault.shortController(),f.short.target);
  assert.equal(await f.vault.drawController(),f.short.target);assert.equal(await f.vault.monthlyController(),f.monthly.target);
  for(const name of ['setController','setShortController','setMonthlyController','upgradeTo','withdraw'])assert.equal(f.vault.interface.getFunction(name),null);
  await assert.rejects(()=>sent(f.vault.reserveUSDG(id('eoa'),1,0,10)));
  await assert.rejects(()=>sent(f.vault.startMonthly(id('eoa'),1)));await conserved(f);
});
test('hostile controllers cannot cross capabilities or use TOKEN/generic/CURRENT reserves',async()=>{
  const f=await fixture(compiled),s=sid('short'),m=mid('month');await sent(f.token.mint(f.vault.target,500));
  await f.attack(f.short,'reserveUSDG',[s,1,0,100]);await f.attack(f.monthly,'startMonthly',[m,1]);
  const before=await accounting(f),w=await f.other.getAddress();
  const forbidden=[
    [f.short,'reserve',[id('token'),1,f.token.target,10]],
    [f.short,'reserve',[id('generic quote'),1,f.quote.target,10]],
    [f.short,'reserveUSDG',[id('current'),1,1,10]],
    [f.short,'startMonthly',[id('bad monthly'),1]], [f.short,'settleMonthly',[m,w]],
    [f.short,'finalize',[m,[w],[1]]],
    [f.monthly,'reserve',[id('monthly token'),1,f.token.target,10]],
    [f.monthly,'reserveUSDG',[id('monthly short'),1,0,10]],
    [f.monthly,'reserveUSDG',[id('monthly current'),1,1,10]],
    [f.monthly,'finalize',[s,[w],[1]]], [f.monthly,'finalize',[m,[w],[1]]],
    [f.monthly,'settleMonthly',[s,w]]];
  for(const [actor,method,args] of forbidden){await assert.rejects(()=>f.attack(actor,method,args));assert.deepEqual(await accounting(f),before);}
  assert.equal(await f.token.balanceOf(f.vault.target),500n);await conserved(f);
});
test('wrong-kind drawId and same-kind reuse fail atomically in both directions',async()=>{
  const f=await fixture(compiled),same=sid('same');await f.attack(f.short,'reserveUSDG',[same,1,0,17]);
  let before=await accounting(f);await assert.rejects(()=>f.attack(f.monthly,'startMonthly',[same,1]));assert.deepEqual(await accounting(f),before);
  const m=mid('monthly');await f.attack(f.monthly,'startMonthly',[m,1]);before=await accounting(f);
  await assert.rejects(()=>f.attack(f.short,'reserveUSDG',[m,1,0,17]));assert.deepEqual(await accounting(f),before);
  await f.attack(f.short,'finalize',[same,[],[]]);before=await accounting(f);
  await assert.rejects(()=>f.attack(f.short,'reserveUSDG',[same,1,0,1]));assert.deepEqual(await accounting(f),before);await conserved(f);
});
test('controller failure after vault settlement rolls back credits and leaves the other pending draw intact',async()=>{
  const f=await fixture(compiled),s=sid('s'),m=mid('m'),w=await f.other.getAddress();
  await f.attack(f.short,'reserveUSDG',[s,1,0,100]);await f.attack(f.monthly,'startMonthly',[m,1]);const before=await accounting(f);
  await assert.rejects(()=>f.attack(f.short,'finalize',[s,[w],[70]],true));assert.deepEqual(await accounting(f),before);
  assert.equal(await f.vault.reward(s,w),0n);assert.equal((await f.vault.draws(s)).status,1n);
  await assert.rejects(()=>f.attack(f.monthly,'settleMonthly',[m,w],true));assert.deepEqual(await accounting(f),before);
  assert.equal(await f.vault.reward(m,w),0n);assert.equal((await f.vault.draws(m)).status,1n);
  await f.attack(f.short,'finalize',[s,[w],[70]]);assert.equal(await f.vault.pendingMonthlyDrawId(),m);
  await f.attack(f.monthly,'settleMonthly',[m,w]);assert.equal(await f.vault.reward(s,w),70n);await conserved(f);
});
test('unpaid claims, direct funding, Next overflow and both transaction orders preserve accounting',async()=>{
  const f=await fixture(compiled),s=sid('s'),m=mid('m'),w=await f.other.getAddress();
  await sent(f.quote.transfer(f.vault.target,13));let checkpoint=await rpc('evm_snapshot'),expected;
  for(const reversed of [false,true]){
    const operations=[()=>f.attack(f.short,'reserveUSDG',[s,1,0,100]),()=>f.attack(f.monthly,'startMonthly',[m,1])];
    for(const op of reversed?operations.reverse():operations)await op();
    const current=await accounting(f);if(expected)assert.deepEqual(current,expected);else expected=current;
    await conserved(f);await rpc('evm_revert',[checkpoint]);checkpoint=await rpc('evm_snapshot');
  }
  await f.attack(f.short,'reserveUSDG',[s,1,0,100]);await f.attack(f.monthly,'startMonthly',[m,1]);
  await sent(f.quote.transfer(f.vault.target,7));await f.attack(f.short,'finalize',[s,[w],[71]]);
  await f.attack(f.monthly,'settleMonthly',[m,w]);const debt=await f.vault.reward(m,w);assert(debt>1000n);
  await sent(f.quote.blockRecipient(w));await assert.rejects(()=>sent(f.vault.claim(m,w)));assert.equal(await f.vault.reward(m,w),debt);
  await sent(f.vault.fundUSDG(120,3));assert.equal(await f.vault.freeNext(),100n);
  const m2=mid('m2');await f.attack(f.monthly,'startMonthly',[m2,1]);await f.attack(f.monthly,'settleMonthly',[m2,ethers.ZeroAddress]);
  assert.equal(await f.vault.reward(s,w),71n);assert.equal(await f.vault.reward(m,w),debt);
  await sent(f.quote.blockRecipient(ethers.ZeroAddress));await sent(f.vault.claim(s,w));await sent(f.vault.claim(m,w));await conserved(f);
});
test('claim reentrancy from an authorized Short actor is blocked without disturbing Monthly',async()=>{
  const f=await fixture(compiled),s=sid('claim'),m=mid('pending');await f.attack(f.short,'reserveUSDG',[s,1,0,100]);
  await f.attack(f.short,'finalize',[s,[f.short.target],[70]]);await f.attack(f.monthly,'startMonthly',[m,1]);
  const data=f.vault.interface.encodeFunctionData('reserveUSDG',[sid('reentry'),1,0,1]);
  await sent(f.quote.setCallback(f.short.target,f.short.interface.encodeFunctionData('attack',[data,false])));
  await sent(f.vault.claim(s,f.short.target));assert.equal(await f.quote.reentrySucceeded(),false);
  assert.equal((await f.vault.draws(sid('reentry'))).status,0n);assert.equal(await f.vault.pendingMonthlyDrawId(),m);
  await sent(f.short.attack(data,false));assert.equal((await f.vault.draws(sid('reentry'))).status,1n);await conserved(f);
});
async function prepareReal(f,ps,label,chunkSize=4){
  const b=await f.provider.getBlock('latest'),drawId=sid(label),pid=id(label+' proposal');
  const r={drawId,campaignId:1,rulesEpoch:1,cutoffBlockNumber:b.number,cutoffBlockHash:b.hash,snapshotHash:id(label+' snapshot'),
    expectedRoot:dataset.rootFor(ps),expectedCount:ps.length,expectedAttempts:ps.reduce((a,p)=>a+p.lastAttempt-p.firstAttempt+1n,0n),budget:101};
  await sent(f.short.begin(pid,r));for(let i=0;i<ps.length;i+=chunkSize)await sent(f.short.publish(pid,ps.slice(i,i+chunkSize)));
  await sent(f.short.seal(pid));return {drawId,pid};
}
async function prepareMonth(f,ps,label,size=4){
  const b=await f.provider.getBlock('latest'),drawId=mid(label);
  await sent(f.monthly.beginMonth({drawId,snapshotHash:id(label+' snapshot'),root:monthlyRoot(ps),campaign:1,cutoff:b.number,cutoffHash:b.hash,
    count:ps.length,attempts:ps.reduce((a,p)=>a+p.lastAttempt-p.firstAttempt+1n,0n)}));
  for(let i=0;i<ps.length;i+=size)await sent(f.monthly.publishMonth(drawId,ps.slice(i,i+size)));
  await sent(f.monthly.connect(f.other).sealMonth(drawId));return drawId;
}
test('real independent controllers: concurrent Short/Monthly, canonical results, failure/retry, claims and new cycle',async()=>{
  const f=await fixture(compiled,{real:true}),ps=participants(12,1);await advance();
  const s=await prepareReal(f,ps,'short real'),m=await prepareMonth(f,ps,'month real');
  assert.equal(await f.short.pendingDatasetDraw(),s.drawId);assert.equal(await f.monthly.pendingMonth(),m);
  const month=await f.monthly.month(m),rules=await f.monthly.monthRules();let seed,out;
  for(let i=0;i<1000;i++){seed=id('win '+i);out=model.compute(month.context,seed,ps,rules,[month.budget]);if(out.winners.length)break;}
  assert.equal(out.winners.length,1);await assert.rejects(()=>sent(f.monthly.connect(f.other).supplySeed(m,seed)));
  await sent(f.monthly.supplySeed(m,seed));await assert.rejects(()=>sent(f.monthly.supplySeed(m,id('again'))));
  await assert.rejects(()=>sent(f.monthly.finishMonth(m)));await assert.rejects(()=>sent(f.monthly.processMonth(m,1,ps.slice(4,8))));
  await assert.rejects(()=>sent(f.monthly.processMonth(m,0,ps.slice(0,3))));
  for(let i=0;i<3;i++)await sent(f.monthly.connect(f.other).processMonth(m,i,ps.slice(i*4,i*4+4)));
  assert.equal((await f.monthly.month(m)).winner.toLowerCase(),out.winners[0]);
  await sent(f.quote.blockRecipient('0x000000000000000000000000000000000000dEaD'));await sent(f.quote.burn(f.vault.target,1));
  await assert.rejects(()=>sent(f.monthly.finishMonth(m)));assert.equal(await f.monthly.pendingMonth(),m);assert.equal(await f.short.pendingDatasetDraw(),s.drawId);
  await sent(f.quote.mint(f.vault.target,1));await sent(f.monthly.connect(f.other).finishMonth(m));
  const finalized=await f.monthly.month(m),coder=ethers.AbiCoder.defaultAbiCoder();
  assert.equal(finalized.resultHash,ethers.keccak256(coder.encode(['bytes32','bytes32','bytes32','bytes32','address','uint256','uint256'],
    [id('MONTHLY_RESULT_V1'),month.context,seed,monthlyRoot(ps),out.winners[0],out.admittedCount,month.budget])));
  await sent(f.short.supplySeed(s.drawId,ethers.ZeroHash));for(let i=0;i<3;i++)await sent(f.short.processShort(s.drawId,i,ps.slice(i*4,i*4+4)));
  const p=await f.short.datasetProposal(s.pid),prizes=Array.from(await f.short.datasetBasket(s.pid));
  assert.equal((await f.short.shortResult(s.drawId)).resultHash,shortModel.compute(p.context,ethers.ZeroHash,ps,normalRules,prizes).resultHash);
  await sent(f.short.finishShort(s.drawId));assert.equal(await f.vault.reward(m,out.winners[0]),1000n);
  await assert.rejects(()=>sent(f.monthly.finishMonth(m)));await advance();await sent(f.vault.fundUSDG(100,3));
  const noWin=await prepareMonth(f,ps,'month no win');const nm=await f.monthly.month(noWin);let noSeed;
  for(let i=0;i<1000;i++){noSeed=id('no-win '+i);if(model.compute(nm.context,noSeed,ps,rules,[nm.budget]).winners.length===0)break;}
  assert.equal(model.compute(nm.context,noSeed,ps,rules,[nm.budget]).winners.length,0);
  await sent(f.monthly.supplySeed(noWin,noSeed));for(let i=0;i<3;i++)await sent(f.monthly.processMonth(noWin,i,ps.slice(i*4,i*4+4)));
  await sent(f.monthly.finishMonth(noWin));assert.equal(await f.vault.freeNext(),100n);assert.equal(await f.vault.freeCurrent(),100n);
  await sent(f.vault.claim(m,out.winners[0]));assert.equal(await f.quote.balanceOf(out.winners[0]),1000n);await conserved(f);
});
test('monthly partition and executor independence, public calldata and reorg recovery',async()=>{
  const f=await fixture(compiled,{real:true}),ps=participants(9,5);await advance();
  const checkpoint=await rpc('evm_snapshot');let expected;
  for(const size of [1,4]){
    const m=await prepareMonth(f,ps,'same month',size);await sent(f.monthly.supplySeed(m,ethers.ZeroHash));
    const events=await f.monthly.queryFilter(f.monthly.filters.MonthChunk(m));
    const chunks=[];for(const e of events){const tx=await f.provider.getTransaction(e.transactionHash),decoded=f.monthly.interface.parseTransaction({data:tx.data});
      chunks.push(Array.from(decoded.args[1],p=>({wallet:p.wallet,firstAttempt:p.firstAttempt,lastAttempt:p.lastAttempt})));}
    await sent(f.monthly.processMonth(m,0,chunks[0]));const progress=await rpc('evm_snapshot');
    for(let i=1;i<chunks.length;i++)await sent(f.monthly.connect(f.other).processMonth(m,i,chunks[i]));await sent(f.monthly.finishMonth(m));
    let result=await f.monthly.month(m);if(expected)assert.equal(result.resultHash,expected);else expected=result.resultHash;
    await rpc('evm_revert',[progress]);assert.equal((await f.monthly.month(m)).nextChunk,1n);await assert.rejects(()=>sent(f.monthly.finishMonth(m)));
    for(let i=1;i<chunks.length;i++)await sent(f.monthly.processMonth(m,i,chunks[i]));await sent(f.monthly.finishMonth(m));
    assert.equal((await f.monthly.month(m)).resultHash,expected);
    if(size===1)await rpc('evm_revert',[checkpoint]);
  }
});
test('both real controllers and dual vault deploy below standard runtime limit without viaIR',()=>{
  for(const name of ['ShortSettlementFixture','MonthlySettlementFixture','DualControllerPromoVault'])assert(compiled[name].evm.deployedBytecode.object.length/2<24576,name);
});

test('RPC verifier pins both controllers, policy, assets and reverse vault bindings',async()=>{
  const f=await fixture(compiled,{real:true});
  const {domainFor}=require('../scripts/attempt-lifecycle.cjs'),{verifyDualBindings}=require('../scripts/dual-bindings.cjs');
  const manifest={chainId:'31337',registry:f.registry.target,quote:f.quote.target,token:f.token.target};
  const config={schema:'attempt-lifecycle-v3',source:f.short.target,sourceCodeHash:ethers.keccak256(await f.provider.getCode(f.short.target)),
    instanceId:await f.short.datasetInstance(),monthlySource:f.monthly.target,monthlySourceCodeHash:ethers.keccak256(await f.provider.getCode(f.monthly.target)),
    monthlyInstanceId:await f.monthly.monthlyInstance(),vault:f.vault.target,vaultCodeHash:ethers.keccak256(await f.provider.getCode(f.vault.target)),
    shortRules:{rulesHash:(await f.short.shortEpochPolicy(1)).hash,noticeSeconds:'3600',startedAt:String(await f.short.shortRulesStartedAt()),firstBlock:String((await f.short.shortEpochPolicy(1)).firstBlock)},
    monthlyPolicy:{rulesHash:await f.monthly.monthlyRulesHash(),interval:String(await f.monthly.monthlyInterval()),startedAt:String(await f.monthly.monthlyStartedAt())}};
  const domain=domainFor(manifest,config);await verifyDualBindings(f.provider,domain);
  for(const [key,value] of [['monthlyPolicyHash',id('wrong')],['monthlyInstanceId',id('wrong')],['vaultQuote',f.token.target],['monthlySourceCodeHash',id('wrong')],['chainId','1']])
    await assert.rejects(()=>verifyDualBindings(f.provider,{...domain,[key]:value}));
  await advance();const b=await f.provider.getBlock('latest'),ps=participants(4,1),drawId=sid('v3 publication'),pid=id('v3 proposal');
  const snapshot={schema:'attempt-snapshot-v3',domain,drawId,kind:'SHORT',rulesEpoch:'1',
    cutoff:{blockNumber:b.number,blockHash:b.hash},rulesHash:config.shortRules.rulesHash,
    participants:ps.map(p=>({wallet:p.wallet.toLowerCase(),count:'1',firstAttempt:'1',lastAttempt:'1'}))};
  const request={drawId,campaignId:1,rulesEpoch:1,cutoffBlockNumber:b.number,cutoffBlockHash:b.hash,
    snapshotHash:require('../scripts/direct-buy.cjs').hash(snapshot),expectedRoot:dataset.rootFor(ps),expectedCount:4,expectedAttempts:4,budget:30};
  await sent(f.short.begin(pid,request));await sent(f.short.publish(pid,ps));
  const artifact={schema:'short-dataset-artifact-v1',snapshot,request,rules:normalRules,weights:[7,5,3],minimumUnit:1};
  const ready=await dataset.verifyPublication(f.provider,f.short,pid,artifact);assert.equal(ready.status,'READY');
  await sent(f.short.seal(pid));assert.equal((await dataset.verifyPublication(f.provider,f.short,pid,artifact)).context,ready.context);
});

test('kind namespaces reject hostile pre-seal reservations and preserve same-kind replay protection',async()=>{
  const f=await fixture(compiled),s=sid('shared'),m=mid('shared');
  assert.equal(BigInt(s)^BigInt(m),1n<<255n);const before=await accounting(f);
  // Neither ID has been used: rejection must be namespace enforcement, not collision.
  await assert.rejects(()=>f.attack(f.monthly,'startMonthly',[s,1]));
  await assert.rejects(()=>f.attack(f.short,'reserveUSDG',[m,1,0,100]));
  for(const [key,kind] of [[ethers.ZeroHash,0],[ethers.toBeHex(1n<<255n,32),1],[s,2]])
    await assert.rejects(()=>f.vault.validateDrawId(key,kind));
  assert.deepEqual(await accounting(f),before);
  for(const [key,kind] of [[s,0],[m,1],[ethers.toBeHex(1,32),0],[ethers.toBeHex(ethers.MaxUint256,32),1]])await f.vault.validateDrawId(key,kind);
  await f.attack(f.short,'reserveUSDG',[s,1,0,100]);await f.attack(f.monthly,'startMonthly',[m,1]);
  await f.attack(f.short,'finalize',[s,[],[]]);await f.attack(f.monthly,'settleMonthly',[m,ethers.ZeroAddress]);
  await assert.rejects(()=>f.attack(f.short,'reserveUSDG',[s,1,0,100]));
  await assert.rejects(()=>f.attack(f.monthly,'startMonthly',[m,1]));await conserved(f);
});

test('both real datasets READY before either seal: same payload, both seal orders and exact event/vault identity',async()=>{
  for(const monthlyFirst of [false,true]){
    const f=await fixture(compiled,{real:true}),ps=participants(4,1);await advance();
    const b=await f.provider.getBlock('latest'),s=sid('shared ready'),m=mid('shared ready'),pid=id('ready proposal');
    const r={drawId:s,campaignId:1,rulesEpoch:1,cutoffBlockNumber:b.number,cutoffBlockHash:b.hash,
      snapshotHash:id('snapshot short'),expectedRoot:dataset.rootFor(ps),expectedCount:4,expectedAttempts:4,budget:30};
    const input={drawId:m,snapshotHash:id('snapshot monthly'),root:monthlyRoot(ps),campaign:1,cutoff:b.number,cutoffHash:b.hash,count:4,attempts:4};
    await assert.rejects(()=>sent(f.short.begin(pid,{...r,drawId:m})));
    await assert.rejects(()=>sent(f.monthly.beginMonth({...input,drawId:s})));
    assert.equal(await f.short.activeProposal(),ethers.ZeroHash);assert.equal(await f.monthly.activeMonth(),ethers.ZeroHash);
    await sent(f.short.begin(pid,r));await sent(f.short.publish(pid,ps));
    await sent(f.monthly.beginMonth(input));await sent(f.monthly.publishMonth(m,ps));
    assert.equal((await f.short.datasetProposal(pid)).status,2n);assert.equal((await f.monthly.month(m)).phase,2n);
    const operations=[()=>sent(f.short.seal(pid)),()=>sent(f.monthly.sealMonth(m))];
    for(const op of monthlyFirst?operations.reverse():operations)await op();
    assert.equal(await f.short.pendingDatasetDraw(),s);assert.equal(await f.monthly.pendingMonth(),m);
    assert.equal((await f.vault.draws(s)).budget,30n);assert.equal((await f.vault.draws(m)).budget,1000n);
    for(const [controller,key] of [[f.short,s],[f.monthly,m]])assert.equal((await controller.queryFilter(controller.filters.AttemptsFrozen(key)))[0].args.drawId,key);
    await sent(f.short.supplySeed(s,ethers.ZeroHash));await sent(f.monthly.supplySeed(m,ethers.ZeroHash));
    await sent(f.short.processShort(s,0,ps));await sent(f.monthly.processMonth(m,0,ps));
    await sent(f.short.finishShort(s));await sent(f.monthly.finishMonth(m));
    for(const [controller,key] of [[f.short,s],[f.monthly,m]]){
      assert.equal((await controller.queryFilter(controller.filters.AttemptsConsumed(key)))[0].args.drawId,key);
      assert.equal((await f.vault.draws(key)).status,2n);
    }
    await conserved(f);
  }
});
