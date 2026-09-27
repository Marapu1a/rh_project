const {test}=require('node:test'),assert=require('node:assert/strict');
const {ethers}=require('ethers'),hre=require('hardhat');
const vector=require('../research/drand-feasibility/vector.json').beacon;
const target=1727521075+(vector.round-1)*3;
hre.config.networks.hardhat.initialDate=new Date((target-40*86400)*1000).toISOString();
const compiled=require('../scripts/compile.cjs').compile();
const sent=async p=>(await p).wait();
async function setup(){
 await hre.network.provider.send('hardhat_reset');const p=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1}),s=await p.getSigner(),other=await p.getSigner(1);
 const deploy=async(n,args=[])=>{const a=compiled[n],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,s).deploy(...args);await c.waitForDeployment();return c;};
 const c=await deploy('DrandConsumerFixture'),m=await deploy('DrandConsumerFixture');
 const adapter=await deploy('DrandRandomAdapter',[c.target,m.target,[3600,30,5,1800,15]]);
 await sent(c.bind(adapter.target));await sent(m.bind(adapter.target));
 await hre.network.provider.send('evm_setNextBlockTimestamp',[target-3601]);await sent(c.request(ethers.id('short-context')));
 assert.equal((await adapter.requests(1)).round,BigInt(vector.round));return {p,s,other,c,m,adapter};
}
test('real drand proof: immutable binding, forged proof rejection, delayed delivery and same-seed retry',async()=>{
 const {p,c,adapter,other}=await setup(),sig='0x'+vector.signature;
 await assert.rejects(adapter.request(ethers.id('unauthorized')));await assert.rejects(c.request(ethers.id('short-context')));
 await assert.rejects(adapter.prove(1,sig));assert.equal((await adapter.requests(1)).proven,false);
 await hre.network.provider.send('evm_setNextBlockTimestamp',[target+86400]);await hre.network.provider.send('evm_mine');
 await assert.rejects(adapter.prove(1,ethers.toBeHex(BigInt(sig)^1n,64)));await assert.rejects(adapter.prove(2,sig));
 const r=await sent(adapter.connect(other).prove(1,sig));const bound=await adapter.requests(1);assert.equal(bound.proven,true);assert.equal(bound.delivered,false);
 const expected=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32','bytes32','uint256','address','uint256','address','bytes32'],[await adapter.CHAIN_HASH(),ethers.sha256(sig),31337,adapter.target,1,c.target,ethers.id('short-context')]));assert.equal(bound.seed,expected);
 await sent(c.configure(true,false));await assert.rejects(adapter.deliver(1));assert.equal((await adapter.requests(1)).seed,expected);assert.equal((await adapter.requests(1)).delivered,false);
 await sent(c.configure(false,true));await assert.rejects(adapter.deliver(1));assert.equal((await adapter.requests(1)).delivered,false);
 await sent(c.configure(false,false));const delivery=await sent(adapter.connect(other).deliver(1));await sent(adapter.deliver(1));await sent(adapter.prove(1,sig));
 assert.equal(await c.calls(),1n);assert.equal(await c.seed(),expected);assert.equal((await adapter.requests(1)).round,BigInt(vector.round));
 assert((await p.getCode(adapter.target)).length/2-1<=24576);console.log(JSON.stringify({proveGas:String(r.gasUsed),deliverGas:String(delivery.gasUsed),runtimeBytes:(await p.getCode(adapter.target)).length/2-1}));
});
test('proof invalidity cannot be bypassed by cached result; context and consumer domains differ',async()=>{
 const {adapter,c,m}=await setup(),sig='0x'+vector.signature;
 await sent(m.request(ethers.id('short-context')));const b=await adapter.requests(2);assert.equal(b.consumer,m.target);assert.notEqual(b.consumer,c.target);
 assert.equal(await adapter.verify(vector.round,sig),true);assert.equal(await adapter.verify(vector.round+1,sig),false);
 for(const bad of ['0x',sig+'00',ethers.ZeroHash,ethers.toBeHex(0,64)])assert.equal(await adapter.verify(vector.round,bad),false);
 await hre.network.provider.send('evm_setNextBlockTimestamp',[target+1]);await hre.network.provider.send('evm_mine');await sent(adapter.prove(1,sig));
 await assert.rejects(adapter.prove(1,'0x'));assert.equal((await adapter.requests(1)).proven,true);
});

test('real drand binds both controllers atomically and settles to claimable USDG without duplicate payout',async()=>{
 const {fixture,sent,rpc}=require('./fixtures/local-controllers.cjs');
 const f=await fixture(compiled,{drandTiming:[3600,30,5,1800,15],rules:require('./fixtures/short-outcome.cjs').nearCertainRules});await f.fundExecution();
 await rpc('evm_setNextBlockTimestamp',[target-4000]);await rpc('evm_mine');
 const short=await f.prepare('drand short'),month=await f.prepare('drand monthly','MONTHLY');
 await rpc('evm_setNextBlockTimestamp',[target-3601]);await rpc('evm_setAutomine',[false]);
 try{
  const a=await f.short.seal(short.proposalId,{gasLimit:2500000}),b=await f.monthly.sealMonth(month.drawId,{gasLimit:2500000});await rpc('evm_mine');await a.wait();await b.wait();
 }finally{await rpc('evm_setAutomine',[true]);}
 const ids=[await f.short.drawRequest(short.drawId),await f.monthly.drawRequest(month.drawId)];assert.notEqual(ids[0],ids[1]);
 for(const id of ids)assert.equal((await f.random.requests(id)).round,BigInt(vector.round));
 assert.equal(await f.vault.reserved(f.quote.target),1101n);
 await rpc('evm_setNextBlockTimestamp',[target+100]);await rpc('evm_mine');
 for(const id of ids){await sent(f.random.prove(id,'0x'+vector.signature));await sent(f.random.deliver(id));}
 assert.notEqual((await f.random.requests(ids[0])).seed,(await f.random.requests(ids[1])).seed);
 for(let i=0;i<short.data.length;i+=8)await sent(f.short.processShort(short.drawId,i/8,short.data.slice(i,i+8)));
 await sent(f.short.finishShort(short.drawId));
 for(let i=0;i<month.data.length;i+=8)await sent(f.monthly.processMonth(month.drawId,i/8,month.data.slice(i,i+8)));
 await sent(f.monthly.finishMonth(month.drawId));
 const result=await f.short.shortResult(short.drawId),winner=result.winners[0],amount=await f.vault.reward(short.drawId,winner);
 assert(amount>0n);const before=await f.quote.balanceOf(winner);await sent(f.vault.claim(short.drawId,winner));assert.equal(await f.quote.balanceOf(winner)-before,amount);
 await sent(f.random.deliver(ids[0]));assert.equal(await f.vault.reward(short.drawId,winner),0n);await assert.rejects(f.vault.claim(short.drawId,winner));
 assert.equal(await f.vault.reserved(f.quote.target),0n);
});
test('pre-freeze drand observation verifies signature and waits on stale or unavailable inputs',async()=>{
 const {adapter}=await setup(),{drandPreflight}=require('../scripts/drand-preflight.cjs');
 const provider=adapter.runner.provider,source={randomProvider:async()=>adapter.target},originalFetch=global.fetch,originalNow=Date.now;
 try{
  global.fetch=async()=>({ok:true,json:async()=>vector});
  let r=await drandPreflight(provider,source);assert.equal(r.status,'wait');assert(r.reasons.includes('staleChainClock'));
  await hre.network.provider.send('evm_setNextBlockTimestamp',[target+1]);await hre.network.provider.send('evm_mine');
  Date.now=()=>1000*(target+1);r=await drandPreflight(provider,source);assert.equal(r.status,'observedHealthy');assert.equal(r.authorizationToFreeze,false);Date.now=originalNow;
  global.fetch=async()=>{throw Error('offline');};r=await drandPreflight(provider,source);assert.equal(r.status,'wait');assert.deepEqual(r.reasons,['rngObservationUnavailable']);
  global.fetch=async()=>({ok:true,json:async()=>({...vector,signature:'00'.repeat(64)})});r=await drandPreflight(provider,source);assert.equal(r.status,'wait');assert.match(r.detail,/Unverified/);
 }finally{global.fetch=originalFetch;Date.now=originalNow;}
});

test('real drand no-win preserves prize reserves and closes both cycles',async()=>{
 const {fixture,sent,rpc}=require('./fixtures/local-controllers.cjs');
 const f=await fixture(compiled,{drandTiming:[3600,30,5,1800,15],rules:{version:1,pNumerator:1,pDenominator:4294967295,hNumerator:1,hDenominator:1}});await f.fundExecution();
 await rpc('evm_setNextBlockTimestamp',[target-4000]);await rpc('evm_mine');
 const short=await f.prepare('drand short'),month=await f.prepare('drand monthly','MONTHLY');
 await rpc('evm_setNextBlockTimestamp',[target-3601]);await rpc('evm_setAutomine',[false]);
 try{
  const a=await f.short.seal(short.proposalId,{gasLimit:2500000}),b=await f.monthly.sealMonth(month.drawId,{gasLimit:2500000});await rpc('evm_mine');await a.wait();await b.wait();
 }finally{await rpc('evm_setAutomine',[true]);}
 const ids=[await f.short.drawRequest(short.drawId),await f.monthly.drawRequest(month.drawId)];assert.notEqual(ids[0],ids[1]);
 for(const id of ids)assert.equal((await f.random.requests(id)).round,BigInt(vector.round));
 assert.equal(await f.vault.reserved(f.quote.target),1101n);
 await rpc('evm_setNextBlockTimestamp',[target+100]);await rpc('evm_mine');
 for(const id of ids){await sent(f.random.prove(id,'0x'+vector.signature));await sent(f.random.deliver(id));}
 assert.notEqual((await f.random.requests(ids[0])).seed,(await f.random.requests(ids[1])).seed);
 for(let i=0;i<short.data.length;i+=8)await sent(f.short.processShort(short.drawId,i/8,short.data.slice(i,i+8)));
 await sent(f.short.finishShort(short.drawId));
 for(let i=0;i<month.data.length;i+=8)await sent(f.monthly.processMonth(month.drawId,i/8,month.data.slice(i,i+8)));
 await sent(f.monthly.finishMonth(month.drawId));
 const result=await f.short.shortResult(short.drawId);
 assert(result.winners.every(w=>w===ethers.ZeroAddress));assert.equal((await f.monthly.month(month.drawId)).winner,ethers.ZeroAddress);
 assert.equal(await f.vault.claimable(f.quote.target),0n);assert.equal(await f.vault.freeShort(),1000n);assert.equal(await f.vault.freeCurrent(),1000n);assert.equal(await f.vault.freeNext(),100n);
 assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
 assert.equal(await f.vault.reserved(f.quote.target),0n);
});
