const {test} = require('node:test');
const assert = require('node:assert/strict');
const {ethers} = require('ethers');
const hre = require('hardhat');
const {compile} = require('../scripts/compile.cjs');
const compiled = compile();

test('dependency audit: failed external collection blocks rollover but not old credits or direct income',async()=>{
  const {router,source,quote,promo,endsAt,recipients}=await fixture();
  await (await quote.mint(router.target,70)).wait();
  await (await router.sync(quote.target)).wait();
  await (await source.setFailures(true,quote.target,false)).wait();
  await nextTime(endsAt);
  await rejects(()=>router.rollCampaign(1,[endsAt+2000,recipients,[10000,0,0]]));
  assert.equal(await router.campaignId(),1n);
  await (await quote.mint(router.target,30)).wait();
  await (await router.connect(keeper).sync(quote.target)).wait();
  await (await router.connect(keeper).pay(quote.target,promo.target)).wait();
  assert.equal(await quote.balanceOf(promo.target),100n);
  assert.equal(await router.received(1,quote.target),100n);
});

test('dependency audit: epoch drift blocks rollover while old-epoch harvest remains usable if vault permits',async()=>{
  const {router,source,quote,promo,endsAt,recipients}=await fixture();
  await (await source.fund(quote.target,31)).wait();
  await (await source.setEpoch(2)).wait();
  await nextTime(endsAt);
  await rejects(()=>router.rollCampaign(1,[endsAt+2000,recipients,[10000,0,0]]));
  await (await router.connect(keeper).harvest(quote.target,1)).wait();
  await (await router.connect(keeper).pay(quote.target,promo.target)).wait();
  assert.equal(await quote.balanceOf(promo.target),31n);
  assert.equal(await router.campaignId(),1n);
});
let provider, admin, keeper, investor, treasury;
async function deploy(name, args = []) {
  const a = compiled[name];
  const c = await new ethers.ContractFactory(a.abi, a.evm.bytecode.object, admin).deploy(...args);
  await c.waitForDeployment(); return c;
}
async function fixture(bps = [10000,0,0]) {
  await hre.network.provider.send('hardhat_reset');
  provider = new ethers.BrowserProvider(hre.network.provider, undefined, {cacheTimeout: -1});
  [admin,keeper,investor,treasury] = await Promise.all([0,1,2,3].map(i => provider.getSigner(i)));
  const token = await deploy('MockToken'), quote = await deploy('MockToken');
  const promo = await deploy('PromoVaultFixture');
  const endsAt = Number((await provider.getBlock('latest')).timestamp)+1000;
  const recipients = [promo.target, await investor.getAddress(), await treasury.getAddress()];
  const router = await deploy('FeeRouter',[await admin.getAddress(),token.target,quote.target,[endsAt,recipients,bps]]);
  const source = await deploy('MockPairVault',[token.target,router.target]);
  await (await router.bindSource(source.target,123)).wait();
  return {token,quote,promo,router,source,endsAt,recipients};
}
async function nextTime(t) {
  await hre.network.provider.send('evm_setNextBlockTimestamp',[t]);
  await hre.network.provider.send('evm_mine');
}
async function rejects(action) { await assert.rejects(async () => {const tx = await action(); if(tx.wait) await tx.wait();}); }

test('TOKEN and USDG: collect, claim, credit, permissionless pay; repeated calls cannot double-spend',async()=>{
  const {token,quote,promo,router,source}=await fixture();
  for (const [asset,amount] of [[token,900000000000000000000n],[quote,123456n]]) {
    await (await source.fund(asset.target,amount)).wait();
    await (await router.connect(keeper).collect()).wait();
    await (await router.connect(keeper).harvest(asset.target,1)).wait();
    assert.equal(await router.credit(asset.target,promo.target),amount);
    assert.equal(await asset.balanceOf(source.target),0n);
    await (await router.connect(keeper).pay(asset.target,promo.target)).wait();
    await (await router.connect(keeper).pay(asset.target,promo.target)).wait();
    await (await router.connect(keeper).harvest(asset.target,1)).wait();
    assert.equal(await asset.balanceOf(promo.target),amount);
    assert.equal(await router.accounted(asset.target),0n);
  }
});
test('fixed source, allowed assets and owner authorization',async()=>{
  const {token,router,source,endsAt,recipients}=await fixture();
  await rejects(()=>router.bindSource(source.target,123));
  await rejects(()=>router.connect(keeper).rollCampaign(1,[endsAt+2000,recipients,[7000,2000,1000]]));
  await rejects(()=>router.rollCampaign(1,[endsAt+2000,recipients,[7000,2000,1000]]));
  const other=await deploy('MockToken');
  await rejects(()=>router.sync(other.target));
  await rejects(()=>router.harvest(other.target,1));
  await (await token.mint(router.target,77)).wait();
  await (await router.sync(token.target)).wait();
  await (await router.connect(keeper).pay(token.target,await keeper.getAddress())).wait();
  assert.equal(await token.balanceOf(await keeper.getAddress()),0n);
});
test('cumulative split is invariant to tiny batches; rounding reserve is conserved and closed to old promo',async()=>{
  const {token,router,promo,endsAt,recipients}=await fixture([7000,2000,1000]);
  for(let i=0;i<17;i++) {
    await (await token.mint(router.target,1)).wait();
    await (await router.sync(token.target)).wait();
    for (const r of recipients) await (await router.pay(token.target,r)).wait();
  }
  assert.equal(await token.balanceOf(promo.target),11n);
  assert.equal(await token.balanceOf(recipients[1]),3n);
  assert.equal(await token.balanceOf(recipients[2]),1n);
  assert.equal(await router.accounted(token.target),2n);
  await nextTime(endsAt);
  await (await router.rollCampaign(1,[endsAt+1000,recipients,[10000,0,0]])).wait();
  await (await router.pay(token.target,promo.target)).wait();
  assert.equal(await token.balanceOf(promo.target),13n);
  assert.equal(await token.balanceOf(router.target),0n);
});
test('rollover sweeps pending fees and direct transfers to old campaign, preserving unpaid credits',async()=>{
  const {token,quote,router,source,promo,endsAt,recipients}=await fixture();
  const nextPromo=await deploy('PromoVaultFixture');
  for (const asset of [token,quote]) {
    await (await source.fund(asset.target,19)).wait();
    await (await router.harvest(asset.target,1)).wait(); // old unpaid debt
    await (await source.fund(asset.target,1000)).wait(); // already claimable
    await (await source.queueFees(asset.target,43)).wait(); // collect still required
    await (await asset.mint(router.target,37)).wait(); // unsynced direct transfer
    await (await asset.blockRecipient(promo.target)).wait(); // old payout failure must not block rollover
  }
  await nextTime(endsAt+20);
  await (await router.rollCampaign(1,[endsAt+1000,[nextPromo.target,...recipients.slice(1)],[7000,2000,1000]])).wait();
  assert.equal(await router.campaignId(),2n);
  assert.equal(await source.collections(),1n);
  for (const asset of [token,quote]) {
    assert.equal(await router.credit(asset.target,promo.target),1099n);
    assert.equal(await router.received(1,asset.target),1099n);
    assert.equal(await router.received(2,asset.target),0n);
    assert.equal(await source.due(asset.target),0n);
    assert.equal(await asset.balanceOf(promo.target),0n); // rollover didn't pay
    await (await source.queueFees(asset.target,1000)).wait();
  }
  await (await router.collect()).wait();
  for (const asset of [token,quote]) {
    await (await asset.mint(router.target,100)).wait();
    await (await router.harvest(asset.target,1)).wait();
    assert.equal(await router.received(1,asset.target),1099n);
    assert.equal(await router.received(2,asset.target),1100n);
    assert.equal(await router.credit(asset.target,nextPromo.target),770n);
    await (await asset.blockRecipient(ethers.ZeroAddress)).wait();
    await (await router.pay(asset.target,promo.target)).wait();
    assert.equal(await asset.balanceOf(promo.target),1099n);
  }
});
test('blocked recipient cannot stop other payouts; failed transfer restores credit',async()=>{
  const {token,router,promo,recipients}=await fixture([7000,2000,1000]);
  await (await token.mint(router.target,1000)).wait();
  await (await router.sync(token.target)).wait();
  await (await token.blockRecipient(recipients[1])).wait();
  await rejects(()=>router.pay(token.target,recipients[1]));
  assert.equal(await router.credit(token.target,recipients[1]),200n);
  await (await router.pay(token.target,promo.target)).wait();
  await (await router.pay(token.target,recipients[2])).wait();
  assert.equal(await token.balanceOf(promo.target),700n);
  assert.equal(await router.accounted(token.target),200n);
});
test('callback cannot reenter payout or duplicate credit',async()=>{
  const {token,router,promo}=await fixture();
  await (await token.mint(router.target,100)).wait();
  await (await router.sync(token.target)).wait();
  await (await token.setCallback(router.target,router.interface.encodeFunctionData('pay',[token.target,promo.target]))).wait();
  await (await router.pay(token.target,promo.target)).wait();
  assert.equal(await token.reentrySucceeded(),false);
  assert.equal(await token.balanceOf(promo.target),100n);
  assert.equal(await router.credit(token.target,promo.target),0n);
});
test('invalid policy is rejected atomically; source binding requires matching token and sole recipient',async()=>{
  const {router,token,quote,endsAt,recipients}=await fixture();
  await nextTime(endsAt);
  await rejects(()=>router.rollCampaign(1,[endsAt+1000,recipients,[9999,0,0]]));
  assert.equal(await router.campaignId(),1n);
  const other=await deploy('FeeRouter',[await admin.getAddress(),token.target,quote.target,[endsAt+1000,recipients,[10000,0,0]]]);
  const wrong=await deploy('MockPairVault',[quote.target,other.target]);
  await rejects(()=>other.bindSource(wrong.target,123));
  const wrongRecipient=await deploy('MockPairVault',[token.target,await keeper.getAddress()]);
  await rejects(()=>other.bindSource(wrongRecipient.target,123));
  assert.equal(await other.pairVault(),ethers.ZeroAddress);
});

test('endsAt does not stop keeper recognition; rollover remains owner-only and not early',async()=>{
  const {router,source,token,quote,promo,endsAt,recipients}=await fixture();
  await nextTime(endsAt+20);
  await (await source.fund(token.target,101)).wait();
  await (await router.connect(keeper).harvest(token.target,1)).wait();
  await (await quote.mint(router.target,29)).wait();
  await (await router.connect(keeper).sync(quote.target)).wait();
  assert.equal(await router.credit(token.target,promo.target),101n);
  assert.equal(await router.received(1,quote.target),29n);
  await rejects(()=>router.connect(keeper).rollCampaign(1,[endsAt+1000,recipients,[10000,0,0]]));
});

for (const failure of ['collect','token claim','quote claim','short claim','invalid config']) {
  test(`rollover ${failure} reverts collection, claims, credits and campaign atomically`,async()=>{
    const {router,source,token,quote,promo,endsAt,recipients}=await fixture();
    for(const asset of [token,quote]) {
      await (await source.queueFees(asset.target,71)).wait();
      await (await source.fund(asset.target,23)).wait();
      await (await asset.mint(router.target,11)).wait();
    }
    await (await source.setFailures(failure==='collect',failure==='token claim'?token.target:failure==='quote claim'?quote.target:ethers.ZeroAddress,failure==='short claim')).wait();
    await nextTime(endsAt);
    await rejects(()=>router.rollCampaign(1,[endsAt+1000,recipients,failure==='invalid config'?[9999,0,0]:[7000,2000,1000]],{gasLimit:3000000}));
    assert.equal(await router.campaignId(),1n);
    assert.equal(await source.collections(),0n);
    assert.equal((await router.policy(2)).endsAt,0n);
    for (const asset of [token,quote]) {
      assert.equal(await source.queued(asset.target),71n);
      assert.equal(await source.due(asset.target),23n);
      assert.equal(await asset.balanceOf(source.target),23n);
      assert.equal(await asset.balanceOf(router.target),11n);
      assert.equal(await router.received(1,asset.target),0n);
      assert.equal(await router.accounted(asset.target),0n);
      assert.equal(await router.credit(asset.target,promo.target),0n);
    }
  });
}

test('stale rollover fails even after next deadline; no double rounding finalization',async()=>{
  const {router,token,promo,endsAt,recipients}=await fixture([7000,2000,1000]);
  await (await token.mint(router.target,17)).wait();
  await nextTime(endsAt);
  const next=[endsAt+1000,recipients,[7000,2000,1000]];
  await (await router.rollCampaign(1,next)).wait();
  assert.equal(await router.credit(token.target,promo.target),13n);
  await rejects(()=>router.rollCampaign(1,next));
  await rejects(()=>router.rollCampaign(2,[endsAt+2000,recipients,[7000,2000,1000]])); // early
  await (await token.mint(router.target,17)).wait();
  await (await router.sync(token.target)).wait();
  assert.equal(await router.credit(token.target,promo.target),24n);
  await nextTime(endsAt+1000);
  await rejects(()=>router.rollCampaign(1,[endsAt+3000,recipients,[7000,2000,1000]]));
  await (await router.rollCampaign(2,[endsAt+3000,recipients,[10000,0,0]])).wait();
  assert.equal(await router.credit(token.target,promo.target),26n);
  for (const r of recipients) await (await router.pay(token.target,r)).wait();
  assert.equal(await token.balanceOf(router.target),0n);
  assert.equal(await router.accounted(token.target),0n);
  assert.equal(await token.balanceOf(promo.target),26n);
});

test('source epoch drift and missing source prevent rollover',async()=>{
  const {router,source,token,quote,endsAt,recipients}=await fixture();
  const unbound=await deploy('FeeRouter',[await admin.getAddress(),token.target,quote.target,[endsAt,recipients,[10000,0,0]]]);
  await (await source.setEpoch(2)).wait();
  await nextTime(endsAt);
  await rejects(()=>router.rollCampaign(1,[endsAt+1000,recipients,[10000,0,0]]));
  await rejects(()=>unbound.rollCampaign(1,[endsAt+1000,recipients,[10000,0,0]]));
  assert.equal(await router.campaignId(),1n);
  assert.equal(await source.collections(),0n);
});

test('rollover cannot reenter even when callback caller is the owner',async()=>{
  const {router,source,token,promo,endsAt,recipients}=await fixture();
  await (await router.transferOwnership(source.target)).wait();
  await (await source.execute(router.target,router.interface.encodeFunctionData('acceptOwnership'))).wait();
  const data=router.interface.encodeFunctionData('rollCampaign',[1,[endsAt+1000,recipients,[10000,0,0]]]);
  await (await source.setCallback(router.target,data)).wait();
  await (await source.queueFees(token.target,101)).wait();
  await nextTime(endsAt);
  await (await source.execute(router.target,data)).wait();
  assert.equal(await source.callbackSucceeded(),false);
  assert.equal(await source.callbackResult(),ethers.id('ReentrancyGuardReentrantCall()').slice(0,10));
  assert.equal(await router.campaignId(),2n);
  assert.equal(await source.collections(),1n);
  assert.equal(await router.credit(token.target,promo.target),101n);
});
