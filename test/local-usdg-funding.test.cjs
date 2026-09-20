const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs');
const {fixture,sent,advance}=require('./fixtures/local-controllers.cjs');
const {stepFunding,runFunding}=require('../scripts/local-usdg-funding.cjs');
const {runRevenue}=require('../scripts/local-usdg-revenue.cjs');
const compiled=compile();
test('review: permissionless TOKEN pay reaches USDG-only vault with no usable TOKEN reserve',async()=>{
  const f=await setup();await sent(f.token.mint(f.router.target,600));await sent(f.router.sync(f.token.target));
  const before=await f.quote.balanceOf(f.vault.target);
  await sent(f.router.connect(f.executor).pay(f.token.target,f.vault.target));
  assert.equal(await f.token.balanceOf(f.vault.target),480n);assert.equal(await f.quote.balanceOf(f.vault.target),before);
  assert.equal(await f.router.credit(f.token.target,f.vault.target),0n);
  const id=require('../scripts/draw-id.cjs').drawIdFor('SHORT',ethers.id('stranded TOKEN'));
  await assert.rejects(()=>f.provider.call({from:f.short.target,to:f.vault.target,
    data:f.vault.interface.encodeFunctionData('reserve',[id,1,f.token.target,1])}),
    e=>e.data===ethers.id('ForbiddenReserve()').slice(0,10));
  assert.equal(await f.vault.claimable(f.token.target),0n);
});
test('blocked project recipient is skipped once per pass; collection continues and recovered debt pays once',async()=>{
  const f=await setup(),before=await f.quote.balanceOf(f.vault.target),steps=[];
  await sent(f.quote.mint(f.router.target,100));
  await sent(f.quote.blockRecipient(f.project));await sent(f.source.queueFees(f.quote.target,600));
  const result=await runRevenue(revenueOptions(f),{onStep:s=>steps.push(s)});
  assert.equal(result.status,'degraded');assert.equal(result.funding.failures.length,1);
  assert.equal(steps.filter(s=>s.status==='recipientFailed').length,1);
  assert.equal(await f.router.credit(f.quote.target,f.project),140n);
  assert.equal(await f.router.credit(f.quote.target,f.vault.target),0n);
  assert.equal(await f.quote.balanceOf(f.vault.target)-before,560n);
  assert.equal(await f.source.collections(),1n);assert.equal(await f.source.queued(f.quote.target),0n);
  await sent(f.quote.blockRecipient(ethers.ZeroAddress));
  assert.equal((await runRevenue(revenueOptions(f))).status,'idle');
  assert.equal(await f.quote.balanceOf(f.project),140n);
  await runRevenue(revenueOptions(f));assert.equal(await f.quote.balanceOf(f.project),140n);
  assert.equal(await f.quote.balanceOf(f.router.target),0n);
});
test('blocked prize recipient does not block project, source or existing prize liabilities',async()=>{
  const f=await setup(),reserved=await f.vault.reserved(f.quote.target),claimable=await f.vault.claimable(f.quote.target);
  await sent(f.quote.mint(f.router.target,100));await sent(f.quote.blockRecipient(f.vault.target));
  await sent(f.source.queueFees(f.quote.target,600));
  const result=await runRevenue(revenueOptions(f));assert.equal(result.status,'degraded');
  assert.equal(result.funding.failures.length,1);assert.equal(await f.quote.balanceOf(f.project),140n);
  assert.equal(await f.router.credit(f.quote.target,f.vault.target),560n);
  assert.equal(await f.vault.reserved(f.quote.target),reserved);assert.equal(await f.vault.claimable(f.quote.target),claimable);
  assert.equal(await f.quote.balanceOf(f.router.target),560n);
});
test('unknown payment broadcast outcome stops before collection even with CALL_EXCEPTION code',async()=>{
  const f=await setup();await sent(f.quote.mint(f.router.target,100));await sent(f.router.sync(f.quote.target));
  await sent(f.source.queueFees(f.quote.target,600));let sends=0;
  const executor={provider:f.provider,getAddress:()=>f.executor.getAddress(),sendTransaction:async()=>{
    sends++;throw Object.assign(new Error('lost send response'),{code:'CALL_EXCEPTION'});
  }};
  await assert.rejects(()=>runRevenue({...revenueOptions(f),executor}),e=>e.stage==='broadcast'&&!e.definiteRejection);
  assert.equal(sends,1);assert.equal(await f.source.collections(),0n);
  assert.equal(await f.router.credit(f.quote.target,f.vault.target),80n);
});

async function setup(){
  const f=await fixture(compiled),project=await (await f.provider.getSigner(4)).getAddress();
  const end=(await f.provider.getBlock('latest')).timestamp+1000;
  const recipients=[f.vault.target,ethers.ZeroAddress,project],bps=[8000,0,2000]; // Test only.
  const router=await f.deploy('FeeRouter',[await f.admin.getAddress(),f.token.target,f.quote.target,[end,recipients,bps]]);
  const source=await f.deploy('MockPairVault',[f.token.target,router.target]);await sent(router.bindSource(source.target,123));
  const job={schema:'local-usdg-funding-v1',chainId:'31337',router:router.target,vault:f.vault.target,
    token:f.token.target,quote:f.quote.target,campaignId:'1',recipients,bps,distribution:'GENERAL',maxGasPrice:'1000000000000'};
  const options={provider:f.provider,router,vault:f.vault,executor:f.executor,job};
  return {...f,router,source,project,end,job,options};
}
const revenueOptions=f=>({...f.options,job:{schema:'local-usdg-revenue-v1',funding:f.job,
  source:{vault:f.source.target,positionId:'123',epoch:'1'},pollSeconds:300}});
test('collected USDG reaches real reserves and project; sponsor funding bypasses fee; TOKEN untouched',async()=>{
  const f=await setup(),before=await f.quote.balanceOf(f.vault.target);
  await sent(f.source.queueFees(f.quote.target,600));await sent(f.router.collect());await sent(f.router.harvest(f.quote.target,1));
  await sent(f.token.mint(f.router.target,55));
  assert.equal((await runFunding(f.options)).status,'idle');
  assert.equal(await f.quote.balanceOf(f.project),120n);assert.equal(await f.quote.balanceOf(f.vault.target),before+480n);
  assert.equal(await f.vault.unrecognizedUSDG(),0n);assert.equal(await f.token.balanceOf(f.router.target),55n);
  const nonce=await f.provider.getTransactionCount(await f.executor.getAddress());
  assert.equal((await runFunding(f.options)).status,'idle');assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),nonce);
  await sent(f.quote.transfer(f.vault.target,60));await runFunding(f.options);
  assert.equal(await f.quote.balanceOf(f.project),120n);assert.equal(await f.quote.balanceOf(f.vault.target),before+540n);
  assert.equal(await f.quote.balanceOf(f.vault.target),await f.vault.freeShort()+await f.vault.freeCurrent()+await f.vault.freeNext());
});
test('restart after payment, blocked transfer retry, and source outage preserve credits',async()=>{
  const f=await setup();await sent(f.quote.mint(f.router.target,600));
  assert.equal((await stepFunding(f.options)).action,'recognizeRevenue');
  await sent(f.quote.blockRecipient(f.vault.target));await assert.rejects(()=>stepFunding(f.options));
  assert.equal(await f.router.credit(f.quote.target,f.vault.target),480n);
  await sent(f.quote.blockRecipient(ethers.ZeroAddress));
  assert.equal((await stepFunding(f.options)).action,'payRecipient');assert.equal(await f.vault.unrecognizedUSDG(),480n);
  await sent(f.source.setFailures(true,f.quote.target,false));
  assert.equal((await runFunding({...f.options,job:JSON.parse(JSON.stringify(f.job))})).status,'idle');
  assert.equal(await f.vault.unrecognizedUSDG(),0n);assert.equal(await f.quote.balanceOf(f.project),120n);
});
test('campaign mismatch stops; refreshed job pays accumulated credits without changing old policy',async()=>{
  const f=await setup();await sent(f.quote.mint(f.router.target,600));await sent(f.router.sync(f.quote.target));
  await advance(1001);const end=(await f.provider.getBlock('latest')).timestamp+1000;
  await sent(f.router.rollCampaign(1,[end,f.job.recipients,[5000,0,5000]]));
  await assert.rejects(()=>stepFunding(f.options),/campaign changed/);
  assert.equal(await f.router.credit(f.quote.target,f.vault.target),480n);
  await sent(f.quote.mint(f.router.target,200));
  await runFunding({...f.options,job:{...f.job,campaignId:'2',bps:[5000,0,5000]}});
  assert.equal(await f.quote.balanceOf(f.project),220n);
  assert.equal(await f.router.received(1,f.quote.target),600n);assert.equal(await f.router.received(2,f.quote.target),200n);
});
test('configuration checks send nothing; chunked revenue conserves rounding and final campaign dust',async()=>{
  const f=await setup();
  const nonce=await f.provider.getTransactionCount(await f.executor.getAddress());
  for(const change of [{quote:f.token.target},{distribution:'NEXT'},{bps:[9000,0,1000]}])
    await assert.rejects(()=>stepFunding({...f.options,job:{...f.job,...change}}));
  assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),nonce);
  await sent(f.quote.mint(f.router.target,1));
  assert.equal((await stepFunding({...f.options,job:{...f.job,maxGasPrice:'1'}})).reason,'gasPrice');
  const initial=await f.quote.balanceOf(f.vault.target);
  await runFunding(f.options);
  for(let i=0;i<6;i++){await sent(f.quote.mint(f.router.target,1));await runFunding(f.options);}
  assert.equal(await f.quote.balanceOf(f.router.target),1n); // Cumulative floors, not lost funds.
  assert.equal(await f.quote.balanceOf(f.vault.target)-initial,5n);assert.equal(await f.quote.balanceOf(f.project),1n);
  await advance(1001);const end=(await f.provider.getBlock('latest')).timestamp+1000;
  await sent(f.router.rollCampaign(1,[end,f.job.recipients,f.job.bps]));
  await runFunding({...f.options,job:{...f.job,campaignId:'2'}});
  assert.equal(await f.quote.balanceOf(f.router.target),0n);
  assert.equal(await f.quote.balanceOf(f.vault.target)-initial+await f.quote.balanceOf(f.project),7n);
});
test('new revenue does not redistribute frozen Monthly or unpaid Short rewards',async()=>{
  const f=await setup();await f.fundExecution();await advance(30*86400+1);
  const s=await f.prepare('funding debt'),m=await f.prepare('funding frozen','MONTHLY');
  await sent(f.short.seal(s.proposalId));await sent(f.monthly.sealMonth(m.drawId));
  await sent(f.random.deliver(await f.short.drawRequest(s.drawId),ethers.ZeroHash));
  for(let i=0;i<s.data.length;i+=8)await sent(f.short.processShort(s.drawId,i/8,s.data.slice(i,i+8)));
  await sent(f.short.finishShort(s.drawId));
  const result=await f.short.shortResult(s.drawId),winner=result.winners[0];assert(winner);
  const debt=await f.vault.reward(s.drawId,winner),reserved=await f.vault.reserved(f.quote.target),claimable=await f.vault.claimable(f.quote.target);
  await sent(f.quote.mint(f.router.target,600));await runFunding(f.options);
  assert.equal(await f.vault.reserved(f.quote.target),reserved);assert.equal(await f.vault.claimable(f.quote.target),claimable);
  assert.equal(await f.vault.reward(s.drawId,winner),debt);assert.equal(await f.monthly.pendingMonth(),m.drawId);
  const before=await f.quote.balanceOf(winner);await sent(f.vault.claim(s.drawId,winner));assert.equal(await f.quote.balanceOf(winner),before+debt);
});
test('revenue pass collects, harvests and funds automatically; repeat never duplicates income',async()=>{
  const f=await setup(),initial=await f.quote.balanceOf(f.vault.target);
  await sent(f.source.queueFees(f.quote.target,600));await sent(f.source.queueFees(f.token.target,77));
  const first=await runRevenue(revenueOptions(f));assert.equal(first.status,'idle');
  assert.equal(first.source.collect.status,'progress');assert.equal(first.source.harvest.status,'progress');
  assert.equal(await f.quote.balanceOf(f.project),120n);assert.equal(await f.quote.balanceOf(f.vault.target),initial+480n);
  assert.equal(await f.source.due(f.token.target),77n);assert.equal(await f.token.balanceOf(f.router.target),0n);
  const second=await runRevenue(revenueOptions(f));assert.equal(second.source.harvest.status,'idle');
  assert.equal(await f.quote.balanceOf(f.project),120n);assert.equal(await f.source.collections(),2n);
});
test('collect failure still pays router credits and harvests already accrued source USDG',async()=>{
  const f=await setup();await sent(f.quote.mint(f.router.target,100));await sent(f.router.sync(f.quote.target));
  await sent(f.source.fund(f.quote.target,600));await sent(f.source.setFailures(true,ethers.ZeroAddress,false));
  const result=await runRevenue(revenueOptions(f));assert.equal(result.status,'degraded');
  assert.equal(result.source.collect.status,'error');assert.equal(result.source.harvest.status,'progress');
  assert.equal(await f.quote.balanceOf(f.project),140n);assert.equal(await f.source.due(f.quote.target),0n);
});
for(const partial of [false,true])test(`claim ${partial?'short payment':'failure'} preserves due and permits retry without double revenue`,async()=>{
  const f=await setup();await sent(f.quote.mint(f.router.target,100));
  await sent(f.source.queueFees(f.quote.target,600));await sent(f.source.setFailures(false,partial?ethers.ZeroAddress:f.quote.target,partial));
  const first=await runRevenue(revenueOptions(f));assert.equal(first.status,'degraded');assert.equal(first.source.harvest.status,'error');
  assert.equal(await f.source.due(f.quote.target),600n);assert.equal(await f.router.received(1,f.quote.target),100n);
  assert.equal(await f.quote.balanceOf(f.project),20n);
  await sent(f.source.setFailures(false,ethers.ZeroAddress,false));assert.equal((await runRevenue(revenueOptions(f))).status,'idle');
  assert.equal(await f.router.received(1,f.quote.target),700n);assert.equal(await f.quote.balanceOf(f.project),140n);
});
test('epoch drift stops collect but permits bound old claims; wrong binding sends no source transaction',async()=>{
  const f=await setup();await sent(f.source.fund(f.quote.target,100));await sent(f.source.setEpoch(2));
  const result=await runRevenue(revenueOptions(f));assert.equal(result.status,'degraded');assert.equal(result.source.harvest.status,'progress');
  assert.equal(await f.source.collections(),0n);assert.equal(await f.quote.balanceOf(f.project),20n);
  await sent(f.quote.mint(f.router.target,100));const options=revenueOptions(f);options.job.source.positionId='999';
  const mismatch=await runRevenue(options);assert.equal(mismatch.status,'error');assert.match(mismatch.source.source.message,/binding mismatch/);
  assert.equal(await f.quote.balanceOf(f.project),40n);assert.equal(await f.source.collections(),0n);
});
test('source gas cap and pending signer defer collection without consuming queued fees',async()=>{
  const f=await setup();await sent(f.source.queueFees(f.quote.target,600));const options=revenueOptions(f);
  options.job.funding={...f.job,maxGasPrice:'1'};
  assert.equal((await runRevenue(options)).source.collect.reason,'gasPrice');
  const {rpc}=require('./fixtures/local-controllers.cjs');await rpc('evm_setAutomine',[false]);let tx;
  try{
    tx=await f.executor.sendTransaction({to:await f.executor.getAddress(),value:0});
    assert.equal((await runRevenue(revenueOptions(f))).source.collect.reason,'pendingTransaction');
    assert.equal(await f.source.queued(f.quote.target),600n);assert.equal(await f.source.collections(),0n);
  }finally{await rpc('evm_mine');await rpc('evm_setAutomine',[true]);if(tx)await tx.wait();}
});
test('ambiguous collect receipt stops further sends; confirmed original resumes without duplicate revenue',async()=>{
  const f=await setup(),{rpc}=require('./fixtures/local-controllers.cjs');await sent(f.source.queueFees(f.quote.target,600));let tx;
  const executor={provider:f.provider,getAddress:()=>f.executor.getAddress(),sendTransaction:async request=>{
    await rpc('evm_setAutomine',[false]);tx=await f.executor.sendTransaction(request);return tx;
  }};
  try{
    const result=await runRevenue({...revenueOptions(f),executor,receiptTimeoutMs:100});
    assert.equal(result.status,'error');assert.equal(result.source.source.transactionHash,tx.hash);
    assert.equal(result.source.harvest,undefined);assert.equal(await f.provider.getTransactionReceipt(tx.hash),null);
    const address=await f.executor.getAddress();
    assert.equal(await f.provider.getTransactionCount(address,'pending'),await f.provider.getTransactionCount(address,'latest')+1);
  }finally{await rpc('evm_mine');await rpc('evm_setAutomine',[true]);if(tx)await tx.wait();}
  await runRevenue(revenueOptions(f));assert.equal(await f.router.received(1,f.quote.target),600n);assert.equal(await f.quote.balanceOf(f.project),120n);
});

test('two rejected recipients cannot starve a healthy third; step limit never permits collection',async()=>{
  const f=await setup(),third=await (await f.provider.getSigner(5)).getAddress();
  await advance(1001);const end=(await f.provider.getBlock('latest')).timestamp+1000;
  const recipients=[f.vault.target,f.project,third],bps=[6000,2000,2000];
  await sent(f.router.rollCampaign(1,[end,recipients,bps]));
  const fundingJob={...f.job,campaignId:'2',recipients,bps};
  await sent(f.quote.mint(f.router.target,100));await sent(f.router.sync(f.quote.target));
  const rejected=new Set([f.vault.target.toLowerCase(),f.project.toLowerCase()]),attempts=[];
  // Inject read-only estimate rejection for two recipients; healthy transfers use the real chain.
  const router=new Proxy(f.router,{get(target,key){
    if(key!=='connect')return Reflect.get(target,key);
    return signer=>{
      const connected=target.connect(signer),pay=(...args)=>connected.pay(...args);
      pay.estimateGas=async(...args)=>{
        attempts.push(args[1].toLowerCase());
        if(rejected.has(args[1].toLowerCase()))throw Object.assign(new Error('estimate rejected'),{code:'CALL_EXCEPTION'});
        return connected.pay.estimateGas(...args);
      };
      return new Proxy(connected,{get(c,k){return k==='pay'?pay:Reflect.get(c,k);}});
    };
  }});
  const options={...revenueOptions(f),router,job:{...revenueOptions(f).job,funding:fundingJob}};
  const before=await f.source.collections();
  assert.equal((await runRevenue(options,{maxSteps:1})).status,'yielded');
  assert.equal(await f.source.collections(),before);
  attempts.length=0;
  const result=await runRevenue(options);assert.equal(result.status,'degraded');assert.equal(result.funding.failures.length,2);
  for(const address of rejected)assert.equal(attempts.filter(a=>a===address).length,1);
  assert.equal(await f.quote.balanceOf(third),20n);assert.equal(await f.quote.balanceOf(f.router.target),80n);
  assert.equal(await f.router.credit(f.quote.target,f.vault.target),60n);assert.equal(await f.router.credit(f.quote.target,f.project),20n);
});
test('pending payment receipt stops before source and does not pay again after confirmation',async()=>{
  const f=await setup(),{rpc}=require('./fixtures/local-controllers.cjs');
  await sent(f.quote.mint(f.router.target,100));await sent(f.router.sync(f.quote.target));
  await sent(f.source.queueFees(f.quote.target,600));let tx,sends=0;
  const executor={provider:f.provider,getAddress:()=>f.executor.getAddress(),sendTransaction:async request=>{
    sends++;await rpc('evm_setAutomine',[false]);tx=await f.executor.sendTransaction(request);return tx;
  }};
  try{
    await assert.rejects(()=>runRevenue({...revenueOptions(f),executor,receiptTimeoutMs:100}),e=>e.code==='LOCAL_RECEIPT_TIMEOUT'&&e.transactionHash===tx.hash);
    assert.equal(sends,1);assert.equal(await f.source.collections(),0n);
  }finally{await rpc('evm_mine');await rpc('evm_setAutomine',[true]);if(tx)await tx.wait();}
  assert.equal(await f.router.credit(f.quote.target,f.vault.target),0n);
  await runRevenue(revenueOptions(f));assert.equal(await f.router.received(1,f.quote.target),700n);
  assert.equal(await f.quote.balanceOf(f.project),140n);assert.equal(await f.quote.balanceOf(f.router.target),0n);
});
