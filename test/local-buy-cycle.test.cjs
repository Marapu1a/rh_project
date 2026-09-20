const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs');
const {runFunding}=require('../scripts/local-usdg-funding.cjs');
const {runRevenue}=require('../scripts/local-usdg-revenue.cjs');
const {fixture,rpc,sent,advance}=require('./fixtures/local-controllers.cjs');
const {scan}=require('../scripts/replay-direct-buy.cjs');
const {replay,SWAP_TYPE}=require('../scripts/direct-buy.cjs');
const {replayAttempts}=require('../scripts/attempt-lifecycle.cjs');
const dataset=require('../scripts/short-dataset.cjs'),settlement=require('../scripts/short-settlement.cjs');
const {drawIdFor}=require('../scripts/draw-id.cjs');
const {normalRules}=require('./fixtures/short-outcome.cjs');
const {makeJob,stepShort,runShort}=require('../scripts/local-short-executor.cjs');
const monthlyDataset=require('../scripts/monthly-dataset.cjs');
const {makeMonthlyJob,stepMonthly,runMonthly}=require('../scripts/local-monthly-executor.cjs');
const compiled=compile(),coder=ethers.AbiCoder.defaultAbiCoder();

test('RPC BUY history -> independent Short/Monthly workers -> win/no-win, replay, next jackpot and claims',async t=>{
  const f=await fixture(compiled,{quoteName:'LocalUSDGFixture'}),market=await f.deploy('LocalBuyFixture',[f.token.target,f.quote.target]);
  assert.equal(await f.quote.decimals(),6n);
  // Explicit local 50/50 example, not approved production creator shares.
  const project=await (await f.provider.getSigner(4)).getAddress();
  const recipients=[f.vault.target,ethers.ZeroAddress,project],bps=[5000,0,5000];
  const feeRouter=await f.deploy('FeeRouter',[await f.admin.getAddress(),f.token.target,f.quote.target,
    [(await f.provider.getBlock('latest')).timestamp+365*86400,recipients,bps]]);
  const feeSource=await f.deploy('MockPairVault',[f.token.target,feeRouter.target]);await sent(feeRouter.bindSource(feeSource.target,123));
  const fundingJob={schema:'local-usdg-funding-v1',chainId:'31337',router:feeRouter.target,vault:f.vault.target,
    token:f.token.target,quote:f.quote.target,campaignId:'1',recipients,bps,distribution:'GENERAL',maxGasPrice:'1000000000000'};
  const revenueJob={schema:'local-usdg-revenue-v1',funding:fundingJob,source:{vault:feeSource.target,positionId:'123',epoch:'1'},pollSeconds:300};
  const wallets=[await f.admin.getAddress(),await f.executor.getAddress()].map(x=>x.toLowerCase());
  const key=[...[f.token.target,f.quote.target].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1),10000,200,market.target];
  const manifest={schema:'direct-buy-v1',routeVersion:'rh-ur-10-060b0e-v1',chainId:'31337',quoteDecimals:6,
    entryThresholdRaw:'100000000',router:market.target,manager:market.target,hook:market.target,token:f.token.target,
    quote:f.quote.target,registry:f.registry.target,poolKey:key,
    poolId:ethers.keccak256(coder.encode(['address','address','uint24','int24','address'],key)),
    anchor:{number:f.anchor.number,hash:f.anchor.hash},codeHashes:{}};
  for(const name of ['router','manager','hook','token','quote','registry'])manifest.codeHashes[name]=ethers.keccak256(await f.provider.getCode(manifest[name]));
  const genesis=await f.short.shortEpochPolicy(1),mg=await f.monthly.monthlyEpochPolicy(1);
  const lifecycle={schema:'attempt-lifecycle-v4',source:f.short.target,sourceCodeHash:ethers.keccak256(await f.provider.getCode(f.short.target)),
    instanceId:await f.short.datasetInstance(),monthlySource:f.monthly.target,monthlySourceCodeHash:ethers.keccak256(await f.provider.getCode(f.monthly.target)),
    monthlyInstanceId:await f.monthly.monthlyInstance(),vault:f.vault.target,vaultCodeHash:ethers.keccak256(await f.provider.getCode(f.vault.target)),
    shortRules:{rulesHash:genesis.hash,noticeSeconds:String(await f.short.shortRulesNotice()),startedAt:String(await f.short.shortRulesStartedAt()),firstBlock:String(genesis.firstBlock)},
    monthlyPolicy:{rulesHash:mg.hash,interval:String(await f.monthly.monthlyInterval()),startedAt:String(await f.monthly.monthlyStartedAt())},
    monthlyRules:{noticeSeconds:String(await f.monthly.monthlyRulesNotice()),firstBlock:String(mg.firstBlock)}};
  // Exercise the existing HTTP scanner, including code pins and every receipt.
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const part of req)body+=part;
    const request=JSON.parse(body);
    async function handle(q){
      try{return {jsonrpc:'2.0',id:q.id,result:await rpc(q.method,q.params)};}
      catch(e){return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:e.message}};}
    }
    const response=Array.isArray(request)?await Promise.all(request.map(handle)):await handle(request);
    res.setHeader('content-type','application/json');res.end(JSON.stringify(response));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const url='http://127.0.0.1:'+server.address().port;
  async function history(){return (await scan(manifest,url,await rpc('eth_blockNumber'),lifecycle)).blocks;}
  const ledger=async()=>replayAttempts(manifest,lifecycle,await history());
  const wallet=(l,i)=>l.wallets.find(w=>w.wallet===wallets[i]);
  async function buy(signer,usd){
    const raw=BigInt(usd)*1000000n,input=coder.encode(['bytes','bytes[]'],['0x060b0e',[
      coder.encode([SWAP_TYPE],[[key,key[0]===f.quote.target,raw,1,0,'0x']]),
      coder.encode(['address','uint256','bool'],[f.quote.target,0,true]),
      coder.encode(['address','address','uint256'],[f.token.target,await signer.getAddress(),0])]]);
    await sent(market.connect(signer).execute('0x10',[input],ethers.MaxUint256));
  }
  for(const signer of [f.admin,f.executor]){
    await sent(f.quote.mint(await signer.getAddress(),2000_000000n));
    await sent(f.quote.connect(signer).approve(market.target,ethers.MaxUint256));
  }
  await sent(f.token.mint(market.target,100000_000000n));await f.fundExecution();
  await buy(f.admin,100); // Not registered: no retroactive ticket.
  await sent(f.registry.register());await sent(f.registry.connect(f.executor).register());
  await buy(f.admin,150);await buy(f.executor,250);await advance(30*86400+1);
  const initial=await history(),buys=replay(manifest,initial);
  assert.deepEqual(buys.decisions.map(d=>[d.reason,d.entriesMinted]),[['NOT_REGISTERED_AT_SWAP','0'],['SUPPORTED_BUY','1'],['SUPPORTED_BUY','2']]);
  for(let i=0;i<2;i++)assert.equal(buys.wallets.find(w=>w.wallet===wallets[i]).carryRaw,'50000000');

  async function prepare(label){
    const blocks=await history(),head=blocks.at(-1),drawId=drawIdFor('SHORT',ethers.id(label)),proposalId=ethers.id(label+' proposal');
    const input={manifest,lifecycle,blocks,rules:normalRules,weights:[7,5,3],minimumUnit:1,
      request:{drawId,campaignId:1,rulesEpoch:1,cutoffBlockNumber:Number(BigInt(head.number)),cutoffBlockHash:head.hash,budget:label.endsWith('1')?1001:101}};
    const artifact=dataset.buildFromHistory(input);
    const job=makeJob(artifact,proposalId,1);
    const options=()=>({provider:f.provider,source:f.short,job:JSON.parse(JSON.stringify(job)),publisher:f.admin,executor:f.executor});
    const corrupted=structuredClone(job);corrupted.artifact.request.budget++;
    await assert.rejects(()=>stepShort({...options(),job:corrupted}),/checksum/);
    await assert.rejects(()=>stepShort({...options(),provider:{getNetwork:async()=>({chainId:46630n})}}),/31337/);
    await assert.rejects(()=>stepShort({...options(),source:f.monthly}),/Wrong controller/);
    assert.equal((await stepShort({...options(),publisher:f.executor})).reason,'publisher');
    await sent(f.random.setReady(false));
    // Restart after every confirmed action; no persisted local progress counter.
    const actions=[];
    for(let i=0;i<10;i++){
      const result=await stepShort(options());
      if(result.status==='waiting'){assert.equal(result.reason,'executionReadiness');break;}
      actions.push(result.action);
      if(result.action==='begin'){
        await rpc('evm_setAutomine',[false]);
        try{
          const pending=await f.admin.sendTransaction({to:await f.admin.getAddress(),value:0});
          assert.equal((await stepShort(options())).reason,'pendingTransaction');
          await rpc('evm_mine');await pending.wait();
        }finally{await rpc('evm_setAutomine',[true]);}
      }
    }
    assert.deepEqual(actions,['begin','publish','publish']);
    const ps=artifact.snapshot.participants.map(({wallet,firstAttempt,lastAttempt})=>({wallet,firstAttempt,lastAttempt}));
    await dataset.verifyPublication(f.provider,f.short,proposalId,artifact);
    const tampered=structuredClone(artifact);tampered.snapshot.participants[0].lastAttempt='999';
    await assert.rejects(()=>dataset.verifyPublication(f.provider,f.short,proposalId,tampered),/commitment/);
    await sent(f.random.setReady(true));
    assert.equal((await stepShort({...options(),gasPrice:10n**12n+1n})).reason,'executionReadiness');
    if(label.endsWith('1')){
      assert.equal((await stepShort(options())).reason,'prizeFunding');
      // Local fee-source revenue supplies the same 2002 prize units plus project income.
      // Mock revenue is injected explicitly; venue swaps do not generate these fees.
      await sent(feeSource.queueFees(f.quote.target,4004));
      assert.equal((await runRevenue({provider:f.provider,router:feeRouter,vault:f.vault,executor:f.executor,job:revenueJob})).status,'idle');
      assert.equal(await f.quote.balanceOf(project),2002n);
    }
    await sent(f.random.setFailure(true));
    const reserveBefore=await f.vault.reserved(f.quote.target);
    await assert.rejects(()=>stepShort(options()));
    assert.equal(await f.vault.reserved(f.quote.target),reserveBefore);
    await sent(f.random.setFailure(false));
    assert.equal((await runShort(options())).reason,'seed');
    const requestKey=await f.short.drawRequest(drawId);
    assert.equal((await runShort(options())).reason,'seed');assert.equal(await f.short.drawRequest(drawId),requestKey);
    await dataset.verifyPublication(f.provider,f.short,proposalId,artifact);
    return {artifact,drawId,proposalId,ps,job,options};
  }
  async function processDraw(draw){
    const p=await f.short.datasetProposal(draw.proposalId),prizes=Array.from(await f.short.datasetBasket(draw.proposalId));
    // Test provider only: select a seed exercising an actual claim, not production RNG.
    let seed=ethers.ZeroHash,expected=settlement.compute(p.context,seed,draw.ps,normalRules,prizes);
    for(let i=1;expected.winners.length===0&&i<100;i++){
      seed=ethers.id('local fixture '+i);expected=settlement.compute(p.context,seed,draw.ps,normalRules,prizes);
    }
    assert(expected.winners.length>0);await sent(f.random.deliver(await f.short.drawRequest(draw.drawId),seed));
    assert.equal((await stepShort({...draw.options(),publisher:undefined})).action,'processShort');
    const recovered=await settlement.recover(f.provider,f.short,draw.drawId);
    for(let i=Number(recovered.state.nextChunk);i<recovered.chunks.length;i++){
      assert.equal((await stepShort({...draw.options(),publisher:undefined,executor:f.admin})).action,'processShort');
    }
    assert.equal((await f.short.shortResult(draw.drawId)).resultHash,expected.resultHash);
    return expected;
  }
  async function finish(draw){
    assert.equal((await runShort({...draw.options(),publisher:undefined})).status,'terminal');
    const nonce=await f.provider.getTransactionCount(await f.executor.getAddress());
    assert.equal((await runShort({...draw.options(),publisher:undefined})).status,'terminal');
    assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),nonce);
  }
  async function monthlyJob(label){
    const blocks=await history(),head=blocks.at(-1);
    const artifact=monthlyDataset.buildFromHistory({manifest,lifecycle,blocks,rules:normalRules,
      request:{drawId:drawIdFor('MONTHLY',ethers.id(label)),campaign:1,rulesEpoch:1,cutoff:Number(BigInt(head.number)),cutoffHash:head.hash}});
    const job=makeMonthlyJob(artifact,1),drawId=artifact.request.drawId;
    const options=()=>({provider:f.provider,source:f.monthly,job:JSON.parse(JSON.stringify(job)),publisher:f.admin,executor:f.executor});
    assert.equal((await stepMonthly({...options(),publisher:undefined})).reason,'publisher');
    const bad=structuredClone(job);bad.artifact.request.count++;
    await assert.rejects(()=>stepMonthly({...options(),job:bad}),/checksum/);
    await assert.rejects(()=>stepMonthly({...options(),source:f.short}),/Wrong Monthly/);
    return {job,artifact,drawId,options};
  }
  async function settleMonthly(draw,win){
    const m=await f.monthly.month(draw.drawId);
    let seed,expected;
    for(let i=0;i<100;i++){
      seed=ethers.id('monthly fixture '+i);
      expected=require('../scripts/short-outcome.cjs').compute(m.context,seed,draw.artifact.snapshot.participants,normalRules,[m.budget]);
      if((expected.winners.length>0)===win)break;
    }
    assert.equal(expected.winners.length>0,win);
    await sent(f.random.deliver(await f.monthly.drawRequest(draw.drawId),seed));
    for(let i=0;i<draw.artifact.snapshot.participants.length;i++){
      assert.equal((await stepMonthly({...draw.options(),publisher:undefined,executor:i%2?f.admin:f.executor})).action,'processMonth');
    }
    const checkpoint=await rpc('evm_snapshot');
    assert.equal((await runMonthly({...draw.options(),publisher:undefined})).status,'terminal');
    await rpc('evm_revert',[checkpoint]);assert.equal((await ledger()).pending.MONTHLY,draw.drawId);
    const result=await runMonthly({...draw.options(),publisher:undefined});assert.equal(result.status,'terminal');
    const nonce=await f.provider.getTransactionCount(await f.executor.getAddress());
    assert.equal((await runMonthly(draw.options())).resultHash,result.resultHash);
    assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),nonce);
    return {winner:expected.winners[0]||ethers.ZeroAddress,budget:m.budget};
  }
  const first=await prepare('BUY cycle 1');
  const month1=await monthlyJob('BUY month 1');
  assert.equal((await runMonthly(month1.options())).reason,'seed');
  const monthKey=await f.monthly.drawRequest(month1.drawId);
  assert.equal((await runMonthly(month1.options())).reason,'seed');assert.equal(await f.monthly.drawRequest(month1.drawId),monthKey);
  await sent(f.vault.fundUSDG(37,2));
  await buy(f.admin,50); // After cutoff/freeze: old 50 carry + 50 = one new OPEN attempt.
  let state=await ledger();assert.equal(state.pending.SHORT,first.drawId);
  assert.equal(wallet(state,0).SHORT.open,'1');assert.equal(wallet(state,0).MONTHLY.open,'1');
  const expected=await processDraw(first),beforeFinish=await rpc('evm_snapshot');
  await finish(first);
  assert.equal(await f.monthly.pendingMonth(),month1.drawId); // Short was not blocked by pending Monthly.
  state=await ledger();assert.equal(wallet(state,0).SHORT.consumedTotal,'1');assert.equal(wallet(state,1).SHORT.consumedTotal,'2');
  // Reorg terminal only; fresh scan must restore FROZEN, then same seed can finish again.
  await rpc('evm_revert',[beforeFinish]);state=await ledger();assert.equal(state.pending.SHORT,first.drawId);
  assert.equal(wallet(state,0).SHORT.consumedTotal,'0');
  await finish(first);
  const jackpot=await settleMonthly(month1,true);
  assert.equal(await f.vault.freeNext(),0n);assert.equal(await f.vault.freeCurrent(),137n);
  assert.equal(await f.vault.reward(month1.drawId,jackpot.winner),jackpot.budget);
  const winner=expected.winners[0],debt=BigInt(expected.amounts[0]);assert.equal(await f.vault.reward(first.drawId,winner),debt);
  await buy(f.admin,100);await buy(f.executor,50);await advance();
  const second=await prepare('BUY cycle 2');
  const ranges=Object.fromEntries(second.ps.map(p=>[p.wallet,[p.firstAttempt,p.lastAttempt]]));
  assert.deepEqual(ranges[wallets[0]],['2','3']);assert.deepEqual(ranges[wallets[1]],['3','3']);
  assert.equal(await f.vault.reward(first.drawId,winner),debt);
  await processDraw(second);await finish(second);
  state=await ledger();assert.equal(state.pending.SHORT,null);assert.equal(state.draws.length,3);
  for(let i=0;i<2;i++){
    const w=wallet(state,i);assert.equal(w.SHORT.open,'0');assert.equal(w.SHORT.consumedTotal,'3');
    assert.equal(w.MONTHLY.open,i===0?'2':'1');assert.equal(w.MONTHLY.consumedTotal,i===0?'1':'2');
    assert.equal(state.buyLedger.wallets.find(x=>x.wallet===wallets[i]).carryRaw,'0');
  }
  const balance=await f.quote.balanceOf(winner);await sent(f.vault.connect(f.executor).claim(first.drawId,winner));
  assert.equal(await f.quote.balanceOf(winner),balance+debt);
  assert.equal(await f.quote.balanceOf(f.vault.target),await f.vault.freeShort()+await f.vault.freeCurrent()+await f.vault.freeNext()
    +await f.vault.reserved(f.quote.target)+await f.vault.claimable(f.quote.target)+await f.vault.unrecognizedUSDG());
  // Empty next cycle is refused before a proposal/reservation is created.
  const blocks=await history(),head=blocks.at(-1),before=await f.vault.reserved(f.quote.target);
  assert.throws(()=>dataset.buildFromHistory({manifest,lifecycle,blocks,rules:normalRules,weights:[7,5,3],minimumUnit:1,
    request:{drawId:drawIdFor('SHORT',ethers.id('empty')),campaignId:1,rulesEpoch:1,cutoffBlockNumber:Number(BigInt(head.number)),cutoffBlockHash:head.hash,budget:101}}),/No OPEN/);
  assert.equal(await f.vault.reserved(f.quote.target),before);
  const month2=await monthlyJob('BUY month 2');
  assert.equal((await runMonthly(month2.options())).reason,'schedule');
  await advance(30*86400+1);
  assert.equal((await runMonthly(month2.options())).reason,'nextStartFunding');
  assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
  await sent(f.vault.fundUSDG(99,3));
  await sent(f.quote.transfer(f.vault.target,6)); // Unrecognized GENERAL fills the last Next unit at seal.
  await sent(f.random.setReady(false));assert.equal((await stepMonthly(month2.options())).reason,'executionReadiness');
  await sent(f.random.setReady(true));
  assert.equal((await stepMonthly({...month2.options(),gasPrice:10n**12n+1n})).reason,'executionReadiness');
  await sent(f.random.setFailure(true));await assert.rejects(()=>stepMonthly(month2.options()));
  assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
  assert.equal(await f.vault.freeNext(),99n);
  await sent(f.random.setFailure(false));assert.equal((await runMonthly(month2.options())).reason,'seed');
  const secondJackpot=(await f.monthly.month(month2.drawId)).budget;
  assert.equal(await f.vault.reward(month1.drawId,jackpot.winner),jackpot.budget);
  await sent(f.vault.fundUSDG(11,2));
  await settleMonthly(month2,false);
  assert.equal(await f.vault.freeCurrent(),secondJackpot+11n);assert.equal(await f.vault.freeNext(),100n);
  state=await ledger();assert.equal(state.draws.length,4);assert.equal(state.pending.MONTHLY,null);
  for(const w of state.wallets){assert.equal(w.MONTHLY.open,'0');assert.equal(w.MONTHLY.consumedTotal,'3');assert.equal(w.SHORT.consumedTotal,'3');}
  const latest=await history(),mh=latest.at(-1);
  assert.throws(()=>monthlyDataset.buildFromHistory({manifest,lifecycle,blocks:latest,rules:normalRules,
    request:{drawId:drawIdFor('MONTHLY',ethers.id('empty month')),campaign:1,rulesEpoch:1,cutoff:Number(BigInt(mh.number)),cutoffHash:mh.hash}}),/No OPEN Monthly/);
  const paidBefore=await f.quote.balanceOf(jackpot.winner);
  await sent(f.vault.claim(month1.drawId,jackpot.winner));assert.equal(await f.quote.balanceOf(jackpot.winner),paidBefore+jackpot.budget);
  assert.equal(await f.quote.balanceOf(f.vault.target),await f.vault.freeShort()+await f.vault.freeCurrent()+await f.vault.freeNext()
    +await f.vault.reserved(f.quote.target)+await f.vault.claimable(f.quote.target)+await f.vault.unrecognizedUSDG());
  // Real CLI process reloads the same job and recognizes completion without sending.
  const fs=require('node:fs'),path=require('node:path');
  fs.mkdirSync('.local',{recursive:true});
  const jobFile=path.resolve('.local','executor-cli-job.json');fs.writeFileSync(jobFile,JSON.stringify(second.job));
  t.after(()=>fs.unlinkSync(jobFile));
  const execFile=require('node:util').promisify(require('node:child_process').execFile);
  const nonce=await f.provider.getTransactionCount(await f.executor.getAddress());
  const cli=await execFile(process.execPath,['scripts/run-local-short.cjs','--job',jobFile,'--rpc',url,'--executor','1','--watch'],{timeout:30000});
  assert.equal(JSON.parse(cli.stdout.trim()).status,'terminal');
  assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),nonce);
  fs.writeFileSync(jobFile,JSON.stringify(month2.job));
  const monthlyCli=await execFile(process.execPath,['scripts/run-local-promo.cjs','--job',jobFile,'--rpc',url,'--executor','1','--watch'],{timeout:30000});
  assert.equal(JSON.parse(monthlyCli.stdout.trim()).status,'terminal');
  assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),nonce);
  fs.writeFileSync(jobFile,JSON.stringify(fundingJob));
  const fundingCli=await execFile(process.execPath,['scripts/run-local-promo.cjs','--job',jobFile,'--rpc',url,'--executor','1'],{timeout:30000});
  assert.equal(JSON.parse(fundingCli.stdout.trim()).status,'idle');
  assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),nonce);
  fs.writeFileSync(jobFile,JSON.stringify(revenueJob));
  const revenueCli=await execFile(process.execPath,['scripts/run-local-promo.cjs','--job',jobFile,'--rpc',url,'--executor','1'],{timeout:30000});
  const summary=JSON.parse(revenueCli.stdout.trim().split('\n').at(-1));
  assert.equal(summary.action,'revenuePass');assert.equal(summary.status,'idle');assert.equal(summary.source.harvest.status,'idle');
  assert.equal(await f.provider.getTransactionCount(await f.executor.getAddress()),nonce+1); // One bounded empty collect.
});
