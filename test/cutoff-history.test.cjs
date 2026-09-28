process.env.HARDHAT_CONFIG=require.resolve('./fixtures/nitro-hardhat.config.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs');
const {fixture,rpc,sent,advance,monthlyRoot}=require('./fixtures/dual-controller.cjs');
const {participants,normalRules}=require('./fixtures/short-outcome.cjs');
const dataset=require('../scripts/short-dataset.cjs'),{drawIdFor}=require('../scripts/draw-id.cjs');
const compiled=compile({writeArtifacts:false}),offset=1000000n,id=ethers.id,zero=ethers.ZeroHash;
const initialize=()=>rpc('hardhat_setCode',['0x0000000000000000000000000000000000000064','0x'+compiled.OffsetArbSysFixture.evm.deployedBytecode.object]);
const setup=()=>fixture(compiled,{real:true,interval:100,notice:10,initialize});
async function head(f){const b=await f.provider.getBlock('latest');return {n:BigInt(b.number)+offset,h:b.hash};}
const ps=participants(4,1);
const request=(b,label)=>({drawId:drawIdFor('SHORT',id(label)),campaignId:1,rulesEpoch:1,cutoffBlockNumber:b.n,cutoffBlockHash:b.h,
 snapshotHash:id(label+' snapshot'),expectedRoot:dataset.rootFor(ps),expectedCount:4,expectedAttempts:4,budget:101});
const monthly=(b,label)=>({drawId:drawIdFor('MONTHLY',id(label)),campaign:1,rulesEpoch:1,cutoff:b.n,cutoffHash:b.h,
 snapshotHash:id(label+' snapshot'),root:monthlyRoot(ps),count:4,attempts:4});
const reject=fn=>assert.rejects(async()=>sent(fn()));

test('checkpoint preserves authentic Nitro cutoff for both draws after 10000 blocks without reserving prizes',async()=>{
 const f=await setup();await advance(21601);const b=await head(f),s=request(b,'cached short'),m=monthly(b,'cached month');
 for(const c of [f.short,f.monthly])await sent(c.connect(f.other).checkpointCutoff(b.n));
 assert.equal(await f.short.activeProposal(),zero);assert.equal(await f.monthly.activeMonth(),zero);
 assert.equal(await f.vault.reserved(f.quote.target),0n);
 await reject(()=>f.short.seal(id('absent')));await reject(()=>f.monthly.sealMonth(m.drawId));
 await rpc('hardhat_mine',['0x2710']);
 for(const c of [f.short,f.monthly]){
  assert.equal(await c.validCutoff(b.n,b.h),true);assert.equal(await c.validCutoff(b.n,id('fake')),false);
  const r=await sent(c.checkpointCutoff(b.n));assert.equal(r.logs.length,0);
 }
 await reject(()=>f.short.begin(id('bad'),{...s,cutoffBlockHash:id('fake')}));
 await reject(()=>f.monthly.beginMonth({...m,cutoffHash:id('fake')}));
 await sent(f.short.begin(id('cached proposal'),s));await sent(f.monthly.beginMonth(m));
 await sent(f.short.publish(id('cached proposal'),ps));await sent(f.monthly.publishMonth(m.drawId,ps));
 await sent(f.short.connect(f.other).seal(id('cached proposal')));await sent(f.monthly.connect(f.other).sealMonth(m.drawId));
 assert.equal(await f.short.pendingDatasetDraw(),s.drawId);assert.equal(await f.monthly.pendingMonth(),m.drawId);
 await reject(()=>f.short.supersede(id('cached proposal')));await reject(()=>f.monthly.supersedeMonth(m.drawId));
});

test('checkpoint rejects unprovable heights and rolls back with the cutoff branch',async()=>{
 const f=await setup();await rpc('hardhat_mine',['0x200']);const b=await head(f);
 for(const c of [f.short,f.monthly]){
  for(const n of [b.n+10n,b.n-300n,b.n-offset])await reject(()=>c.checkpointCutoff(n));
 }
 const snap=await rpc('evm_snapshot');await rpc('evm_mine');const fork=await head(f);
 for(const c of [f.short,f.monthly])await sent(c.checkpointCutoff(fork.n));
 await rpc('evm_revert',[snap]);await advance(2);
 const replacement=await head(f);assert.notEqual(replacement.h,fork.h);
 for(const c of [f.short,f.monthly]){assert.equal(await c.cutoffHashes(fork.n),zero);assert.equal(await c.validCutoff(fork.n,fork.h),false);}
});

test('abandoned checkpoints cannot block preparation; supersede preserves the same aged cutoff for correction',async()=>{
 const f=await setup();await advance(21601);const b=await head(f);
 for(const c of [f.short,f.monthly])await sent(c.checkpointCutoff(b.n));
 const later=await head(f);for(const c of [f.short,f.monthly])await sent(c.connect(f.other).checkpointCutoff(later.n));
 await rpc('hardhat_mine',['0x110']);const s=request(b,'repair short'),m=monthly(b,'repair month');
 await sent(f.short.begin(id('incomplete'),s));await sent(f.monthly.beginMonth(m));
 await sent(f.short.supersede(id('incomplete')));await sent(f.monthly.supersedeMonth(m.drawId));
 await sent(f.short.begin(id('corrected'),s));await sent(f.monthly.beginMonth({...m,drawId:drawIdFor('MONTHLY',id('corrected month'))}));
 assert.equal(await f.vault.reserved(f.quote.target),0n);
 assert.equal(await f.short.cutoffHashes(b.n),b.h);assert.equal(await f.monthly.cutoffHashes(b.n),b.h);
});

test('aged checkpoints close empty draining epochs without draws or clock changes',async()=>{
 const f=await setup();await sent(f.short.announce(normalRules,[7,5,3],1));await sent(f.monthly.announce(normalRules));
 await advance(21601);await sent(f.short.activate());await sent(f.monthly.activate());await rpc('evm_mine');
 const b=await head(f),sc=await f.short.lastShortTerminalAt(),mc=await f.monthly.lastMonthAt();
 for(const c of [f.short,f.monthly])await sent(c.checkpointCutoff(b.n));await rpc('hardhat_mine',['0x2710']);
 for(const c of [f.short,f.monthly])await sent(c.closeEmpty(b.n,b.h,id('empty snapshot')));
 assert.equal(await f.short.drainingShortEpoch(),0n);assert.equal(await f.monthly.drainingMonthlyEpoch(),0n);
 assert.equal(await f.short.lastShortTerminalAt(),sc);assert.equal(await f.monthly.lastMonthAt(),mc);
 assert.equal(await f.vault.reserved(f.quote.target),0n);
 for(const c of [f.short,f.monthly])await reject(()=>c.closeEmpty(b.n,b.h,id('empty snapshot')));
});
