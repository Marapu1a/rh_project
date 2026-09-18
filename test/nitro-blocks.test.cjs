process.env.HARDHAT_CONFIG=require.resolve('./fixtures/nitro-hardhat.config.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs');
const {fixture,rpc,sent,advance,monthlyRoot}=require('./fixtures/dual-controller.cjs');
const {participants,normalRules}=require('./fixtures/short-outcome.cjs');
const dataset=require('../scripts/short-dataset.cjs'),{drawIdFor}=require('../scripts/draw-id.cjs');
const compiled=compile({writeArtifacts:false}),offset=1000000n,id=ethers.id;
const arb='0x0000000000000000000000000000000000000064';
const initialize=()=>rpc('hardhat_setCode',[arb,'0x'+compiled.OffsetArbSysFixture.evm.deployedBytecode.object]);
const setup=()=>fixture(compiled,{real:true,interval:100,notice:10,initialize});
async function head(f){const b=await f.provider.getBlock('latest');return {n:BigInt(b.number)+offset,h:b.hash,native:b.number};}
const ps=participants(4,1);
const shortRequest=(b,label,epoch=1)=>({drawId:drawIdFor('SHORT',id(label)),campaignId:1,rulesEpoch:epoch,cutoffBlockNumber:b.n,cutoffBlockHash:b.h,
  snapshotHash:id(label+' snapshot'),expectedRoot:dataset.rootFor(ps),expectedCount:4,expectedAttempts:4,budget:101});
const monthlyRequest=(b,label,epoch=1)=>({drawId:drawIdFor('MONTHLY',id(label)),campaign:1,rulesEpoch:epoch,cutoff:b.n,cutoffHash:b.h,
  snapshotHash:id(label+' snapshot'),root:monthlyRoot(ps),count:4,attempts:4});
const reject=async(fn)=>assert.rejects(async()=>sent(fn()));

test('Nitro helper uses distinct L2 identities, exact 256 window and fails closed without ArbSys',async()=>{
  const f=await setup(),probe=await f.deploy('ChainBlocksFixture');await rpc('hardhat_mine',['0x110']);
  const b=await head(f);
  for(const age of [1,256]){
    const raw=await f.provider.getBlock(b.native-age),r=await probe.read(b.n-BigInt(age));
    assert.equal(r.nativeNumber,BigInt(b.native));assert.equal(r.rpcNumber,b.n);
    assert.equal(r.nativeHash,ethers.ZeroHash);assert.equal(r.rpcHash,raw.hash);
  }
  for(const n of [b.n,b.n+1n,b.n-257n,BigInt(b.native-1)])assert.equal((await probe.read(n)).rpcHash,ethers.ZeroHash);
  await rpc('hardhat_setCode',[arb,'0x']);await assert.rejects(probe.read(b.n-1n));
  await rpc('hardhat_setCode',[arb,'0x60006000fd']);await assert.rejects(probe.read(b.n-1n));
});

test('Nitro Short and Monthly freeze/terminal use L2 cutoffs and terminal heights; reorg rolls back together',async()=>{
  const f=await setup();await advance(21601);const b=await head(f),s=shortRequest(b,'short'),m=monthlyRequest(b,'month'),pid=id('proposal');
  assert.equal((await f.short.shortEpochPolicy(1)).firstBlock,BigInt((await f.short.deploymentTransaction().wait()).blockNumber)+offset);
  assert.equal((await f.monthly.monthlyEpochPolicy(1)).firstBlock,BigInt((await f.monthly.deploymentTransaction().wait()).blockNumber)+offset);
  await reject(()=>f.short.begin(pid,{...s,cutoffBlockNumber:b.native}));
  await reject(()=>f.monthly.beginMonth({...m,cutoff:b.native}));
  await reject(()=>f.short.begin(pid,{...s,cutoffBlockHash:id('wrong')}));
  await reject(()=>f.monthly.beginMonth({...m,cutoffHash:id('wrong')}));
  await sent(f.short.begin(pid,s));await sent(f.short.publish(pid,ps));
  await sent(f.monthly.beginMonth(m));await sent(f.monthly.publishMonth(m.drawId,ps));
  await rpc('hardhat_mine',['0x110']); // Already anchored identities survive aging before seal.
  await sent(f.short.seal(pid));await sent(f.monthly.sealMonth(m.drawId));
  await sent(f.short.supplySeed(s.drawId,ethers.ZeroHash));await sent(f.monthly.supplySeed(m.drawId,ethers.ZeroHash));
  await sent(f.short.processShort(s.drawId,0,ps));await sent(f.monthly.processMonth(m.drawId,0,ps));
  const checkpoint=await rpc('evm_snapshot');
  let receipt=await sent(f.short.finishShort(s.drawId));assert.equal(await f.short.lastShortTerminalBlock(),BigInt(receipt.blockNumber)+offset);
  receipt=await sent(f.monthly.finishMonth(m.drawId));assert.equal(await f.monthly.lastMonthBlock(),BigInt(receipt.blockNumber)+offset);
  await rpc('evm_revert',[checkpoint]);assert.equal(await f.short.lastShortTerminalBlock(),0n);assert.equal(await f.monthly.lastMonthBlock(),0n);
  assert.equal(await f.short.pendingDatasetDraw(),s.drawId);assert.equal(await f.monthly.pendingMonth(),m.drawId);
  await sent(f.short.connect(f.other).finishShort(s.drawId));await sent(f.monthly.connect(f.other).finishMonth(m.drawId));
});

test('Nitro B+1 activation, old-first and empty closures use L2 identities without moving clocks',async()=>{
  const f=await setup();await sent(f.short.announce(normalRules,[7,5,3],1));await sent(f.monthly.announce(normalRules));await advance(21601);
  let receipt=await sent(f.short.activate());const firstShort=BigInt(receipt.blockNumber)+offset+1n;
  assert.equal((await f.short.shortEpochPolicy(2)).firstBlock,firstShort);
  const event=receipt.logs.map(l=>{try{return f.short.interface.parseLog(l);}catch{return null;}}).find(e=>e?.name==='ShortRulesActivated');
  assert.equal(event.args.firstNewBlock,firstShort);
  receipt=await sent(f.monthly.activate());assert.equal((await f.monthly.monthlyEpochPolicy(2)).firstBlock,BigInt(receipt.blockNumber)+offset+1n);
  await rpc('evm_mine');const b=await head(f);
  await reject(()=>f.short.begin(id('wrong epoch'),shortRequest(b,'wrong short',2)));
  await reject(()=>f.monthly.beginMonth(monthlyRequest(b,'wrong month',2)));
  const sc=await f.short.lastShortTerminalAt(),mc=await f.monthly.lastMonthAt();
  await reject(()=>f.short.closeEmpty(b.native,b.h,id('empty')));await reject(()=>f.monthly.closeEmpty(b.native,b.h,id('empty')));
  await sent(f.short.closeEmpty(b.n,b.h,id('empty')));await sent(f.monthly.closeEmpty(b.n,b.h,id('empty')));
  assert.equal(await f.short.drainingShortEpoch(),0n);assert.equal(await f.monthly.drainingMonthlyEpoch(),0n);
  assert.equal(await f.short.lastShortTerminalAt(),sc);assert.equal(await f.monthly.lastMonthAt(),mc);
  const next=await head(f);await sent(f.short.begin(id('new epoch'),shortRequest(next,'new short',2)));
  await sent(f.monthly.beginMonth(monthlyRequest(next,'new month',2)));
});

test('Nitro controllers accept only authentic completed L2 cutoffs at ages 1 through 256',async()=>{
  const f=await setup();await advance(21601);await rpc('hardhat_mine',['0x200']);const b=await head(f);
  for(const age of [1,256]){
    const block=await f.provider.getBlock(b.native-age),anchor={n:b.n-BigInt(age),h:block.hash};
    await f.short.begin.staticCall(id('age '+age),shortRequest(anchor,'short age '+age));
    await f.monthly.beginMonth.staticCall(monthlyRequest(anchor,'month age '+age));
  }
  for(const age of [0,-1,257]){
    const anchor={n:b.n-BigInt(age),h:age>0?(await f.provider.getBlock(b.native-age)).hash:b.h};
    await assert.rejects(f.short.begin.staticCall(id('bad age '+age),shortRequest(anchor,'bad short '+age)));
    await assert.rejects(f.monthly.beginMonth.staticCall(monthlyRequest(anchor,'bad month '+age)));
  }
  assert.equal(await f.short.activeProposal(),ethers.ZeroHash);assert.equal(await f.monthly.activeMonth(),ethers.ZeroHash);
});

test('Nitro legacy commitment also records L2 freeze block and authentic L2 hash',async()=>{
  const f=await setup();const owner=await f.admin.getAddress();
  const predicted=ethers.getCreateAddress({from:owner,nonce:await f.provider.getTransactionCount(owner)+1});
  const source=await f.deploy('ShortDrawCommitmentFixture',[predicted,f.registry.target,id('legacy'),[7,5,3],1,id('rules')]);
  const vault=await f.deploy('PromoVault',[f.token.target,f.quote.target,source.target,100]);assert.equal(vault.target,predicted);
  await sent(f.quote.approve(vault.target,1000));await sent(vault.fundUSDG(1000,1));const b=await head(f);
  const request={drawId:id('legacy draw'),campaignId:1,cutoffBlockNumber:b.n,cutoffBlockHash:b.h,
    attemptSnapshotHash:id('snapshot'),evmParticipantsHash:id('participants'),expectedRulesHash:await source.shortRulesHash(),budget:101};
  await reject(()=>source.freeze({...request,cutoffBlockNumber:b.native}));
  const receipt=await sent(source.freeze(request));assert.equal((await source.shortCommitment(request.drawId)).freezeBlock,BigInt(receipt.blockNumber)+offset);
});
