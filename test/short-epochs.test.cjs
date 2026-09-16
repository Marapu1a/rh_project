const {test}=require('node:test'),assert=require('node:assert/strict');
const {ethers}=require('ethers'),hre=require('hardhat');
const {compile}=require('../scripts/compile.cjs');
const {normalRules,participants,rpc,sent}=require('./fixtures/short-outcome.cjs');
const dataset=require('../scripts/short-dataset.cjs');
const {replayAttempts,domainFor,emptyEpochHash,ABI}=require('../scripts/attempt-lifecycle.cjs');
const {hash}=require('../scripts/direct-buy.cjs');
const {history}=require('./fixtures/attempt-history.cjs');
const compiled=compile(),id=ethers.id,weights=[7,5,3],nextRules={...normalRules,pNumerator:1,pDenominator:2};
const rejected=async fn=>assert.rejects(async()=>sent(fn()));
const advance=async seconds=>{await rpc('evm_increaseTime',[seconds]);await rpc('evm_mine');};
async function fixture(){
  await rpc('hardhat_reset');const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  const admin=await provider.getSigner(),other=await provider.getSigner(1);
  const deploy=async(name,args=[])=>{const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;};
  const token=await deploy('MockToken'),quote=await deploy('MockToken'),registry=await deploy('ParticipantRegistry');
  const predicted=ethers.getCreateAddress({from:await admin.getAddress(),nonce:await provider.getTransactionCount(await admin.getAddress())+1});
  const source=await deploy('ShortEpochFixture',[predicted,registry.target,id('epochs'),3600,normalRules,weights]);
  const vault=await deploy('PromoVault',[token.target,quote.target,source.target,100]);
  await sent(quote.mint(await admin.getAddress(),1000));await sent(quote.approve(vault.target,1000));await sent(vault.fundUSDG(1000,1));
  let sequence=0;const ps=participants(1);
  const request=async(epoch=1)=>{const b=await rpc('eth_getBlockByNumber',['latest',false]);return {drawId:id('draw'+(++sequence)),campaignId:1,rulesEpoch:epoch,
    cutoffBlockNumber:Number(BigInt(b.number)),cutoffBlockHash:b.hash,snapshotHash:id('synthetic assertion'),expectedRoot:dataset.rootFor(ps),expectedCount:1,expectedAttempts:1,budget:101};};
  return {provider,source,vault,quote,admin,other,ps,request};
}
test('notice, forward-only block boundary, immutable policy and fresh cutoff after long delay',async()=>{
  const f=await fixture(),early=await f.request();await rejected(()=>f.source.begin(id('early'),early));
  await rejected(()=>f.source.connect(f.other).announce(nextRules,weights,1));
  await sent(f.source.announce(nextRules,weights,1));await rejected(()=>f.source.announce(normalRules,weights,1));
  await rejected(()=>f.source.activate());await advance(21601);
  const activation=await sent(f.source.connect(f.other).activate());
  assert.equal((await f.source.shortEpochPolicy(2)).firstBlock,BigInt(activation.blockNumber+1));
  assert.equal((await f.source.shortEpochPolicy(1)).hash,dataset.rulesHash(normalRules,weights,1));
  await rejected(()=>f.source.activate());await rejected(()=>f.source.announce(normalRules,weights,1));
  await rpc('hardhat_mine',['0x12c']);const wrong=await f.request(2);await rejected(()=>f.source.begin(id('wrong'),wrong));
  const r=await f.request(1),pid=id('old');await sent(f.source.begin(pid,r));await sent(f.source.publish(pid,f.ps));
  await sent(f.source.connect(f.other).seal(pid));assert.equal(await f.vault.reserved(f.quote.target),101n);
  await rejected(()=>f.source.supersede(pid));
  await rejected(()=>f.source.finish(r.drawId,[f.vault.target],[1]));assert.equal(await f.source.drainingShortEpoch(),1n);
  await sent(f.source.finish(r.drawId,[],[]));assert.equal(await f.source.drainingShortEpoch(),0n);
  assert.equal(await f.source.pendingDatasetDraw(),ethers.ZeroHash);
  const newRequest=await f.request(2);await rejected(()=>f.source.begin(id('new'),newRequest));
  await advance(21601);await sent(f.source.begin(id('new'),await f.request(2)));
  await rejected(()=>f.source.finish(r.drawId,[],[]));
});
test('active preparation and pending draw block activation; supersede only unreserved preparation',async()=>{
  const f=await fixture();await sent(f.source.announce(nextRules,weights,1));await advance(21601);
  const p=id('preparation');await sent(f.source.begin(p,await f.request()));await rejected(()=>f.source.activate());
  await sent(f.source.supersede(p));await sent(f.source.activate());await rpc('evm_mine');
  const r=await f.request(),pid=id('replacement');await sent(f.source.begin(pid,r));await sent(f.source.publish(pid,f.ps));await sent(f.source.seal(pid));
  await rejected(()=>f.source.closeEmpty(r.cutoffBlockNumber,r.cutoffBlockHash,id('empty')));
});
test('empty closure moves no funds, requires publisher and fresh canonical anchor; reorg restores epoch',async()=>{
  const f=await fixture();await sent(f.source.announce(nextRules,weights,1));await advance(21601);
  const checkpoint=await rpc('evm_snapshot');await sent(f.source.activate());await rpc('hardhat_mine',['0x12c']);
  const r=await f.request();const before=await f.vault.freeShort();
  await rejected(()=>f.source.connect(f.other).closeEmpty(r.cutoffBlockNumber,r.cutoffBlockHash,id('empty')));
  await sent(f.source.closeEmpty(r.cutoffBlockNumber,r.cutoffBlockHash,id('empty assertion')));
  assert.equal(await f.vault.freeShort(),before);assert.equal(await f.vault.reserved(f.quote.target),0n);
  assert.equal((await f.source.queryFilter(f.source.filters.AttemptsConsumed())).length,0);
  await rejected(()=>f.source.closeEmpty(r.cutoffBlockNumber,r.cutoffBlockHash,id('again')));
  await sent(f.source.announce(normalRules,weights,1));
  await rpc('evm_revert',[checkpoint]);assert.equal(await f.source.currentShortEpoch(),1n);assert.equal(await f.source.announcedShortEpoch(),2n);
});

function epochHistory(){
  const h=history();h.config.schema='attempt-lifecycle-v2';h.config.shortRules={rulesHash:dataset.rulesHash(normalRules,weights,1),noticeSeconds:'10',startedAt:'0',firstBlock:'0'};
  const replay=()=>replayAttempts(h.manifest,h.config,h.blocks);
  const time=()=>Number(BigInt(h.blocks.at(-1).timestamp));
  const emit=(name,args)=>h.append(name,h.config.source,'0x',[h.log(ABI,name,args,h.config.source)]);
  const wait=(seconds=21601)=>{h.empty('time');h.blocks.at(-1).timestamp='0x'+(BigInt(h.blocks.at(-1).timestamp)+BigInt(seconds)).toString(16);};
  const announce=()=>emit('ShortRulesAnnounced',[2,dataset.rulesHash(nextRules,weights,1),time()+11]);
  const activate=()=>emit('ShortRulesActivated',[1,2,h.head().blockNumber+2]);
  const artifact=(epoch=1,rules=normalRules)=>dataset.buildFromHistory({manifest:h.manifest,lifecycle:h.config,blocks:h.blocks,
    request:{drawId:id('epoch draw '+h.head().blockNumber),campaignId:1,rulesEpoch:epoch,budget:101,cutoffBlockNumber:h.head().blockNumber,cutoffBlockHash:h.head().blockHash},rules,weights,minimumUnit:1});
  const freeze=a=>{const r=a.request;emit('AttemptsFrozen',[r.drawId,0,r.cutoffBlockNumber,r.cutoffBlockHash,a.snapshot.rulesHash,r.snapshotHash]);return {drawId:r.drawId,kind:'SHORT',snapshotHash:r.snapshotHash};};
  const empty=()=>{const c=h.head(),s=emptyEpochHash(domainFor(h.manifest,h.config),1,c,h.config.shortRules.rulesHash);emit('ShortEpochEmpty',[1,c.blockNumber,c.blockHash,s]);};
  return {h,replay,emit,wait,announce,activate,artifact,freeze,empty};
}
test('replay preserves carry, old/new ranges, consumes old first and leaves Monthly untouched',()=>{
  const x=epochHistory();x.announce();x.wait();x.activate();x.h.buy(99_000000n);x.h.buy(1_000000n);
  const ledger=x.replay(),w=ledger.wallets.find(w=>w.wallet===x.h.wallet);
  assert.equal(w.SHORT.byEpoch[0].open,'1');assert.equal(w.SHORT.byEpoch[1].open,'1');
  assert.equal(w.MONTHLY.open,'2');assert.throws(()=>x.artifact(2,nextRules),/target epoch/);
  const old=x.artifact();assert.equal(old.snapshot.rulesEpoch,'1');assert.equal(old.request.expectedAttempts,'1');
  assert.equal(old.snapshot.participants[0].lastAttempt,'1');
  const draw=x.freeze(old);x.h.terminal(draw);const done=x.replay();assert.equal(done.shortRules.drainingEpoch,0);
  const newer=x.artifact(2,nextRules);assert.equal(newer.snapshot.participants[0].firstAttempt,'2');
  assert.equal(done.wallets.find(w=>w.wallet===x.h.wallet).MONTHLY.open,'2');
  // The builder may prepare an artifact early; controller/replay forbid freeze before 6h.
  const saved=structuredClone(x.h.blocks);x.freeze(newer);assert.throws(x.replay,/schedule/);
  x.h.blocks.splice(0,x.h.blocks.length,...saved);x.wait();x.freeze(x.artifact(2,nextRules));assert.equal(x.replay().pending.SHORT!==null,true);
  const monthly=x.h.freeze('independent monthly','MONTHLY',x.h.head(),[x.h.participant(2)]);
  x.h.terminal(monthly);const afterMonthly=x.replay(),wallet=afterMonthly.wallets.find(w=>w.wallet===x.h.wallet);
  assert.equal(wallet.MONTHLY.consumedTotal,'2');assert.equal(wallet.SHORT.byEpoch[1].frozen,'1');
});
test('empty assertion is rejected for real old entries; truly consumed old epoch closes without consuming new',()=>{
  const bad=epochHistory();bad.announce();bad.wait();bad.activate();bad.h.empty('after boundary');bad.empty();assert.throws(bad.replay,/not empty/);
  const x=epochHistory(),draw=x.freeze(x.artifact());x.h.terminal(draw);x.announce();x.wait();x.activate();x.h.buy(100_000000n);
  const empty=x.artifact();assert.equal(empty.schema,'short-empty-epoch-artifact-v1');
  assert.equal(empty.snapshotHash,emptyEpochHash(domainFor(x.h.manifest,x.h.config),1,x.h.head(),x.h.config.shortRules.rulesHash));
  x.empty();
  const ledger=x.replay();assert.equal(ledger.shortRules.drainingEpoch,0);assert.equal(ledger.wallets[0].SHORT.open,'1');
  assert.equal(x.artifact(2,nextRules).request.expectedAttempts,'1');
});

test('v2 publication verifier binds snapshot epoch and on-chain genesis; no replacement rules accepted',async()=>{
  const f=await fixture();await advance(21601);const r=await f.request();
  const g=await f.source.shortEpochPolicy(1);
  const genesis={rulesHash:g.hash,noticeSeconds:String(await f.source.shortRulesNotice()),startedAt:String(await f.source.shortRulesStartedAt()),firstBlock:String(g.firstBlock)};
  const domain={schema:'attempt-lifecycle-v2',chainId:'31337',source:f.source.target.toLowerCase(),sourceCodeHash:ethers.keccak256(await f.provider.getCode(f.source.target)),
    instanceId:id('epochs'),registry:await f.source.datasetRegistry(),shortRulesGenesisHash:hash(genesis)};
  const snapshot={schema:'attempt-snapshot-v2',domain,drawId:r.drawId,kind:'SHORT',rulesEpoch:'1',
    cutoff:{blockNumber:r.cutoffBlockNumber,blockHash:r.cutoffBlockHash},rulesHash:g.hash,
    participants:f.ps.map(p=>({wallet:p.wallet.toLowerCase(),count:'1',firstAttempt:'1',lastAttempt:'1'}))};
  r.snapshotHash=hash(snapshot);const pid=id('verified');await sent(f.source.begin(pid,r));await sent(f.source.publish(pid,f.ps));
  const artifact={schema:'short-dataset-artifact-v1',snapshot,request:r,rules:normalRules,weights,minimumUnit:1};
  const ready=await dataset.verifyPublication(f.provider,f.source,pid,artifact);assert.equal(ready.status,'READY');
  await sent(f.source.seal(pid));assert.equal((await dataset.verifyPublication(f.provider,f.source,pid,artifact)).context,ready.context);
  await assert.rejects(()=>dataset.verifyEpochGenesis(f.provider,f.source.target,{...domain,shortRulesGenesisHash:id('false')}),/genesis mismatch/);
});
test('same activation block mints remain old; next block uses new epoch; branch replay rolls back activation',()=>{
  const x=epochHistory();x.announce();x.wait();const branch=structuredClone(x.h.blocks);
  const block=x.h.buy(100_000000n),receipt=block.transactions[0].receipt;
  const encoded=x.h.log(ABI,'ShortRulesActivated',[1,2,x.h.head().blockNumber+1],x.h.config.source);
  receipt.logs.push({...receipt.logs[0],...encoded,logIndex:'0x'+receipt.logs.length.toString(16)});
  x.h.buy(100_000000n);const ledger=x.replay(),w=ledger.wallets.find(w=>w.wallet===x.h.wallet);
  assert.equal(w.SHORT.byEpoch[0].open,'2');assert.equal(w.SHORT.byEpoch[1].open,'1');
  x.h.blocks.splice(0,x.h.blocks.length,...branch);x.h.buy(100_000000n);
  assert.equal(x.replay().shortRules.currentEpoch,1);assert.equal(x.replay().wallets[0].SHORT.byEpoch.length,1);
});
test('replay rejects early or retroactive activation and epoch history under legacy schema',()=>{
  const x=epochHistory();x.announce();x.activate();assert.throws(x.replay,/notice/);
  const y=epochHistory();y.announce();y.wait();y.emit('ShortRulesActivated',[1,2,y.h.head().blockNumber]);assert.throws(y.replay,/Retroactive/);
  const z=epochHistory();z.announce();z.h.config.schema='attempt-lifecycle-v1';assert.throws(z.replay,/require lifecycle v2/);
});
