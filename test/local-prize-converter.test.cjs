const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('../scripts/compile.cjs');
const {fixture,sent,advance}=require('./fixtures/local-controllers.cjs');
const compiled=compile();
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
