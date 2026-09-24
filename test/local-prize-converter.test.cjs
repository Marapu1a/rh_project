const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs');
const {fixture,sent,advance}=require('./fixtures/local-controllers.cjs');
const compiled=compile();
async function scheduled(){
 const f=await fixture(compiled),adapter=await f.deploy('PrizeSwapFixture',[f.token.target,f.quote.target,3,1]);
 const replacement=await f.deploy('PrizeSwapFixture',[f.token.target,f.quote.target,3,1]);
 const price=await f.deploy('PrizePriceFixture',[f.token.target,f.quote.target]);
 const limits={maxInput:1000,maxHorizon:300,maxPriceAge:3600,slippageBps:100,notice:60};
 const c=await f.deploy('LocalScheduledPrizeConverter',[f.token.target,f.quote.target,f.vault.target,adapter.target,price.target,await f.admin.getAddress(),limits]);
 const fresh=async(n=3,d=1)=>sent(price.set(n,d,(await f.provider.getBlock('latest')).timestamp,false));
 await fresh();await sent(f.token.mint(c.target,100));await sent(f.quote.mint(adapter.target,10000));await sent(f.quote.mint(replacement.target,10000));await sent(c.sync());
 const digest=async r=>ethers.keccak256(await f.provider.getCode(r.target));
 const deadline=async()=>(await f.provider.getBlock('latest')).timestamp+120;
 return {...f,c,adapter,replacement,price,limits,fresh,digest,deadline};
}

test('scheduled converter replaces broken adapter after notice without moving prize destination',async()=>{
 const f=await scheduled(),{c}=f;
 await sent(f.adapter.setFailure(1));await assert.rejects(async()=>c.convert(100,await f.deadline(),1));
 await sent(f.quote.mint(c.target,7));const before=await f.quote.balanceOf(f.vault.target);
 await sent(c.connect(f.executor).forwardQuote());assert.equal(await f.quote.balanceOf(f.vault.target)-before,7n);
 await assert.rejects(async()=>c.connect(f.executor).announceAdapter(f.replacement.target,await f.digest(f.replacement)));
 await sent(c.announceAdapter(f.replacement.target,await f.digest(f.replacement)));
 const pending=await c.pending();assert.equal(pending.id,1n);
 await assert.rejects(c.activateAdapter(1));await assert.rejects(async()=>c.announceAdapter(f.replacement.target,await f.digest(f.replacement)));
 // Hardhat-only hostile runtime replacement proves activation never calls the old route.
 await require('hardhat').network.provider.send('hardhat_setCode',[f.adapter.target,'0x60006000fd']);
 await advance(61);await sent(c.connect(f.executor).activateAdapter(1));
 assert.equal(await c.adapterVersion(),2n);assert.equal(await c.vault(),f.vault.target);assert.equal(await c.priceSource(),f.price.target);
 await assert.rejects(c.activateAdapter(1));await assert.rejects(async()=>c.convert(100,await f.deadline(),1));
 await sent(c.connect(f.executor).convert(100,await f.deadline(),2));await sent(c.forwardQuote());
 assert.equal(await f.quote.balanceOf(f.vault.target)-before,307n);
 assert.equal(await f.token.allowance(c.target,f.adapter.target),0n);assert.equal(await f.token.allowance(c.target,f.replacement.target),0n);
 assert.equal(await c.remainingToken(),0n);assert.equal(await c.heldQuote(),0n);
 for(const name of ['withdraw','setVault','setPriceSource','setSlippage','execute','burn'])assert.equal(c.interface.getFunction(name),null);
});

test('scheduled converter cancellations, stale ids and changed candidate runtime cannot bypass notice',async()=>{
 const f=await scheduled(),{c}=f;
 await assert.rejects(c.cancelAdapter(0));await assert.rejects(c.activateAdapter(0));
 await assert.rejects(c.announceAdapter(f.replacement.target,ethers.ZeroHash));
 const wrong=await f.deploy('PrizeSwapFixture',[f.quote.target,f.token.target,3,1]);
 await assert.rejects(async()=>c.announceAdapter(wrong.target,await f.digest(wrong)));
 await sent(c.announceAdapter(f.replacement.target,await f.digest(f.replacement)));
 await assert.rejects(c.connect(f.executor).cancelAdapter(1));await sent(c.cancelAdapter(1));
 await assert.rejects(c.activateAdapter(1));await assert.rejects(c.cancelAdapter(1));
 await sent(c.announceAdapter(f.replacement.target,await f.digest(f.replacement)));assert.equal((await c.pending()).id,2n);
 await advance(61);await assert.rejects(c.activateAdapter(1));
 await require('hardhat').network.provider.send('hardhat_setCode',[f.replacement.target,'0x60006000fd']);
 await assert.rejects(c.activateAdapter(2));assert.equal(await c.adapterVersion(),1n);
 await sent(c.cancelAdapter(2));await sent(c.convert(100,await f.deadline(),1));
});

test('scheduled converter enforces fresh independent price, portion, deadline and actual output',async()=>{
 const f=await scheduled(),{c}=f,now=(await f.provider.getBlock('latest')).timestamp;
 assert.equal(await c.minimumOutput(100),297n);
 for(const [n,d,time,failed] of [[0,1,now,false],[3,0,now,false],[3,1,0,false],[3,1,now+10000,false],[3,1,now-3601,false],[3,1,now,true]]){
  await sent(f.price.set(n,d,time,failed));await assert.rejects(async()=>c.convert(100,await f.deadline(),1));
  assert.equal(await c.tokenSold(),0n);assert.equal(await f.token.balanceOf(c.target),100n);assert.equal(await f.token.allowance(c.target,f.adapter.target),0n);
 }
 await f.fresh();
 for(const [amount,deadline] of [[0,now+200],[1001,now+200],[1,now-1],[1,now+10000]])await assert.rejects(c.convert(amount,deadline,1));
 for(const mode of [1,2,3,4,5]){
  await sent(f.adapter.setFailure(mode));await assert.rejects(async()=>c.convert(100,await f.deadline(),1));
  assert.equal(await c.tokenSold(),0n);assert.equal(await f.token.balanceOf(c.target),100n);assert.equal(await f.token.allowance(c.target,f.adapter.target),0n);
 }
 await sent(f.adapter.setFailure(0));await f.fresh(4,1);await assert.rejects(async()=>c.convert(100,await f.deadline(),1));
 await f.fresh(3,2);assert.equal(await c.minimumOutput(1),2n); // conservative upward rounding twice
 await sent(c.convert(100,await f.deadline(),1));assert.equal(await c.tokenSold(),100n);assert.equal(await c.heldQuote(),300n);
});

test('scheduled converter forwards existing quote despite unavailable price and rejects price code drift',async()=>{
 const f=await scheduled(),{c}=f,before=await f.quote.balanceOf(f.vault.target);
 await sent(f.quote.mint(c.target,13));await sent(f.price.set(3,1,1,true));
 await sent(c.forwardQuote());assert.equal(await f.quote.balanceOf(f.vault.target)-before,13n);
 await require('hardhat').network.provider.send('hardhat_setCode',[f.price.target,'0x60006000fd']);
 await assert.rejects(async()=>c.convert(100,await f.deadline(),1));
 await sent(c.announceAdapter(f.replacement.target,await f.digest(f.replacement)));await advance(61);
 await sent(c.activateAdapter(1));await assert.rejects(async()=>c.convert(100,await f.deadline(),2));
 assert.equal(await f.token.balanceOf(c.target),100n);
 await sent(c.forwardQuote());assert.equal(await f.quote.balanceOf(f.vault.target)-before,13n);
});
async function setup(){
  const f=await fixture(compiled);
  const adapter=await f.deploy('PrizeSwapFixture',[f.token.target,f.quote.target,3,1]);
  const make=destination=>f.deploy('LocalPrizeConverter',[f.token.target,f.quote.target,destination,adapter.target,2,1,1000,300]);
  const converter=await make(f.vault.target),project=await (await f.provider.getSigner(4)).getAddress();
  const end=(await f.provider.getBlock('latest')).timestamp+1000;
  const recipients=[converter.target,ethers.ZeroAddress,project],bps=[8000,0,2000];
  const router=await f.deploy('FeeRouter',[await f.admin.getAddress(),f.token.target,f.quote.target,[end,recipients,bps]]);
  const source=await f.deploy('MockPairVault',[f.token.target,router.target]);await sent(router.bindSource(source.target,123));
  await sent(f.quote.mint(adapter.target,100000));
  const deadline=async()=>(await f.provider.getBlock('latest')).timestamp+120;
  return {...f,adapter,converter,make,router,source,project,recipients,bps,deadline};
}
async function invariant(f,c=f.converter){
  assert.equal(await c.tokenObserved(),await c.tokenSold()+await f.token.balanceOf(c.target));
  assert.equal(await c.quoteObserved(),await c.quoteForwarded()+await f.quote.balanceOf(c.target));
  assert.equal(await f.token.allowance(c.target,f.adapter.target),0n);
}
test('permissionless TOKEN/USDG pay -> shared inventory -> actual USDG -> prize reserves',async()=>{
  const f=await setup(),c=f.converter,before=await f.quote.balanceOf(f.vault.target);
  await f.fundExecution();await advance(30*86400+1);
  const month=await f.prepare('converter frozen','MONTHLY');await sent(f.monthly.sealMonth(month.drawId));
  const reserved=await f.vault.reserved(f.quote.target);assert(reserved>0n);
  await sent(f.token.mint(f.router.target,600));await sent(f.quote.mint(f.router.target,100));
  for(const asset of [f.token.target,f.quote.target]){
    await sent(f.router.sync(asset));await sent(f.router.connect(f.executor).pay(asset,c.target));
  }
  await sent(c.sync());assert.equal(await c.remainingToken(),480n);assert.equal(await c.heldQuote(),80n);
  assert.equal(await f.token.balanceOf(f.vault.target),0n);
  await sent(c.connect(f.executor).convert(480,await f.deadline()));
  assert.equal(await c.quoteObserved(),1520n);await invariant(f);
  await sent(c.connect(f.executor).forwardQuote());await invariant(f);
  assert.equal(await f.quote.balanceOf(f.vault.target)-before,1520n);assert.equal(await f.vault.unrecognizedUSDG(),0n);
  assert.equal(await f.quote.balanceOf(f.vault.target),await f.vault.freeShort()+await f.vault.freeCurrent()+await f.vault.freeNext()+await f.vault.reserved(f.quote.target)+await f.vault.claimable(f.quote.target));
  assert.equal(await f.vault.reserved(f.quote.target),reserved);
  await sent(c.forwardQuote());assert.equal(await f.quote.balanceOf(f.vault.target)-before,1520n);
  await assert.rejects(async()=>c.convert(1,await f.deadline()),e=>e.code==='CALL_EXCEPTION');
  for(const asset of [f.token.target,f.quote.target])await sent(f.router.pay(asset,f.project));
  assert.equal(await f.token.balanceOf(f.project),120n);assert.equal(await f.quote.balanceOf(f.project),20n);
});
test('bad swaps fully revert; existing USDG forwards despite broken route, then TOKEN retries',async()=>{
  const f=await setup(),c=f.converter,before=await f.quote.balanceOf(f.vault.target);
  await sent(f.token.mint(c.target,100));await sent(f.quote.mint(c.target,7));await sent(c.sync());
  for(const mode of [1,2,3,4,5]){
    await sent(f.adapter.setFailure(mode));
    await assert.rejects(async()=>c.convert(100,await f.deadline()),e=>e.code==='CALL_EXCEPTION');
    assert.equal(await c.tokenSold(),0n);assert.equal(await f.token.balanceOf(c.target),100n);
    assert.equal(await f.quote.balanceOf(c.target),7n);await invariant(f);
  }
  await sent(c.forwardQuote());assert.equal(await f.quote.balanceOf(f.vault.target)-before,7n);
  await sent(f.adapter.setFailure(0));await sent(c.convert(100,await f.deadline()));await sent(c.forwardQuote());
  assert.equal(await f.quote.balanceOf(f.vault.target)-before,307n);await invariant(f);
});
test('fixed floor rounds upward, deadline/portion bounded, wrong bindings rejected',async()=>{
  const f=await setup(),c=f.converter;await sent(f.token.mint(c.target,2000));
  const now=(await f.provider.getBlock('latest')).timestamp;
  for(const [amount,deadline] of [[0,now+120],[1001,now+120],[1,now-1],[1,now+1000]])
    await assert.rejects(()=>c.convert(amount,deadline));
  await assert.rejects(()=>f.deploy('LocalPrizeConverter',[f.quote.target,f.token.target,f.vault.target,f.adapter.target,2,1,100,300]));
  const rounded=await f.deploy('LocalPrizeConverter',[f.token.target,f.quote.target,f.vault.target,f.adapter.target,3,2,100,300]);
  assert.equal(await rounded.minimumOutput(1),2n);assert.equal(await rounded.minimumOutput(3),5n);
  for(const forbidden of ['withdraw','setVault','setAdapter','execute'])assert.equal(c.interface.getFunction(forbidden),null);
});
test('same destination can aggregate campaigns; changed recipient preserves old inventory and unpaid debt',async()=>{
  const f=await setup(),old=f.converter,before=await f.quote.balanceOf(f.vault.target);
  await sent(f.token.mint(f.router.target,100));await sent(f.router.sync(f.token.target));
  await advance(1001);let end=(await f.provider.getBlock('latest')).timestamp+1000;
  await sent(f.router.rollCampaign(1,[end,f.recipients,f.bps]));
  await sent(f.token.mint(f.router.target,100));await sent(f.router.sync(f.token.target));
  assert.equal(await f.router.credit(f.token.target,old.target),160n);
  await sent(f.token.mint(old.target,5));await sent(old.sync());
  const nextVault=await f.deploy('PromoVault',[f.token.target,f.quote.target,f.short.target,100]);
  const next=await f.make(nextVault.target);
  await advance(1001);end=(await f.provider.getBlock('latest')).timestamp+1000;
  await sent(f.router.rollCampaign(2,[end,[next.target,ethers.ZeroAddress,f.project],f.bps]));
  await sent(f.token.mint(f.router.target,100));await sent(f.router.sync(f.token.target));
  await sent(f.router.connect(f.executor).pay(f.token.target,old.target));
  await sent(f.router.pay(f.token.target,next.target));
  await sent(old.convert(165,await f.deadline()));await sent(old.forwardQuote());
  await sent(next.convert(80,await f.deadline()));await sent(next.forwardQuote());
  assert.equal(await old.vault(),f.vault.target);assert.equal(await next.vault(),nextVault.target);
  assert.equal(await f.quote.balanceOf(f.vault.target)-before,495n);assert.equal(await f.quote.balanceOf(nextVault.target),240n);
  for(const campaign of [1,2,3])assert.equal(await f.router.received(campaign,f.token.target),100n);
  await invariant(f,old);await invariant(f,next);
});
test('failed forward preserves quote and retries once; TOKEN donation is not FeeRouter revenue',async()=>{
  const f=await setup(),c=f.converter;await sent(f.quote.mint(c.target,10));await sent(c.sync());
  await sent(f.quote.blockRecipient(f.vault.target));await assert.rejects(()=>c.forwardQuote());
  assert.equal(await c.quoteForwarded(),0n);assert.equal(await f.quote.balanceOf(c.target),10n);
  await sent(f.quote.blockRecipient(ethers.ZeroAddress));await sent(c.forwardQuote());await sent(c.forwardQuote());
  assert.equal(await c.quoteForwarded(),10n);
  await sent(f.token.mint(c.target,13));await sent(c.sync());
  assert.equal(await c.tokenObserved(),13n);assert.equal(await f.router.received(1,f.token.target),0n);await invariant(f);
});
