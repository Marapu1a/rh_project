const {test, before} = require('node:test');
const assert = require('node:assert/strict');
const {ethers} = require('ethers');
const hre = require('hardhat');
const {compile} = require('../scripts/compile.cjs');
const compiled = compile();
let provider, admin, alice, bob, basket;
async function deploy(name, args=[]) {
  const a = compiled[name];
  const c = await new ethers.ContractFactory(a.abi, a.evm.bytecode.object, admin).deploy(...args);
  await c.waitForDeployment();
  return c;
}
async function sent(tx) { return (await tx).wait(); }
async function rejectsWith(promise, signature) {
  await assert.rejects(promise, e => e.code === 'CALL_EXCEPTION' && e.data === ethers.id(signature).slice(0,10));
}
before(async () => {
  await hre.network.provider.send('hardhat_reset');
  provider = new ethers.BrowserProvider(hre.network.provider, undefined, {cacheTimeout:-1});
  [admin, alice, bob] = await Promise.all([0,1,2].map(i => provider.getSigner(i)));
  basket = await deploy('ShortPrizeBasketFixture');
});

test('accepted example: threshold, fixed places, larger budget and exact raw dust', async () => {
  const weights = [7,5,2,2,1,1,1,1,1,1]; // Experimental template, not production defaults.
  const minimum = 5_000_000n;
  await rejectsWith(basket.build(109_999_999n,weights,minimum),'BudgetNotReady()');
  const [prizes,total,remainder] = await basket.build(110_000_000n,weights,minimum);
  assert.deepEqual(Array.from(prizes),[35n,25n,10n,10n,5n,5n,5n,5n,5n,5n].map(x=>x*1_000_000n));
  assert.equal(total,110_000_000n);
  assert.equal(remainder,0n);
  const bigger = await basket.build(220_000_021n,weights,minimum);
  assert.deepEqual(Array.from(bigger[0]),Array.from(prizes,x=>2n*x));
  assert.equal(bigger[1],220_000_000n);
  assert.equal(bigger[2],21n);
});

test('minimum applies to base unit, not merely the smallest resulting prize', async () => {
  await rejectsWith(basket.build(10,[2,2],3),'BudgetNotReady()');
  assert.deepEqual(Array.from((await basket.build(12,[2,2],3))[0]),[6n,6n]);
});

test('malformed templates and empty budgets cannot create zero awards', async () => {
  for (const [weights,minimum] of [[[],1],[[1,0],1],[[1],0],[[ethers.MaxUint256,1],1]]) {
    await rejectsWith(basket.build(100,weights,minimum),'InvalidTemplate()');
  }
  await rejectsWith(basket.build(0,[1],1),'BudgetNotReady()');
  // A mathematically unreachable threshold must not overflow multiplication.
  await rejectsWith(basket.build(ethers.MaxUint256,[2],ethers.MaxUint256),'BudgetNotReady()');
});

test('uint256 boundary is safe without truncating weights or monetary values', async () => {
  const max = ethers.MaxUint256;
  assert.deepEqual(Array.from((await basket.build(max,[max],1))[0]),[max]);
  const [prizes,total,remainder] = await basket.build(max,[max-1n,1n],1);
  assert.deepEqual(Array.from(prizes),[max-1n,1n]);
  assert.equal(total,max);
  assert.equal(remainder,0n);
});

test('deterministic varied templates conserve budgets and scale proportionally', async () => {
  let seed=20260915n;
  const next=()=>{seed=(1664525n*seed+1013904223n)%4294967296n;return seed;};
  for (let i=0;i<64;i++) {
    const weights=Array.from({length:1+Number(next()%12n)},()=>1n+next()%30n);
    const sum=weights.reduce((a,b)=>a+b,0n);
    const minimum=1n+next()%1000n;
    const unit=minimum+next()%100000n;
    const budget=unit*sum+next()%sum;
    const [prizes,total,remainder]=await basket.build(budget,weights,minimum);
    assert.equal(prizes.reduce((a,b)=>a+b,0n)+remainder,budget);
    assert.equal(total,budget-remainder);
    assert.ok(remainder>=0n && remainder<sum);
    for (let j=0;j<weights.length;j++) {
      assert.ok(prizes[j]>=minimum);
      assert.equal(prizes[j],unit*weights[j]);
    }
    const larger=await basket.build(budget+sum,weights,minimum);
    assert.deepEqual(Array.from(larger[0]),Array.from(prizes,(p,j)=>p+weights[j]));
    assert.equal(larger[2],remainder);
  }
});

test('computed prizes flow through vault: late funding, unused slots, old unpaid claims and no-win', async () => {
  const token=await deploy('MockToken'),quote=await deploy('MockToken');
  const controller=await deploy('DrawControllerFixture');
  const vault=await deploy('PromoVault',[token.target,quote.target,controller.target,100]);
  const control=(method,args)=>controller.execute(vault.target,vault.interface.encodeFunctionData(method,args));
  const draw=ethers.id('basket draw'),empty=ethers.id('no win draw');
  const aliceAddress=await alice.getAddress(),bobAddress=await bob.getAddress();
  await sent(quote.mint(await admin.getAddress(),300));
  await sent(quote.approve(vault.target,300));
  await sent(vault.fundUSDG(223,1)); // SHORT, no dependence on GENERAL rounding here.
  const budget=await vault.freeShort();
  const [prizes,total,dust]=await basket.build(budget,[7,5,2,2,1,1,1,1,1,1],5);
  assert.equal(total,220n);
  assert.equal(dust,3n);
  await sent(control('reserveUSDG',[draw,1,0,budget]));
  await sent(vault.fundUSDG(77,1));
  assert.equal((await vault.draws(draw)).budget,223n);
  // Selection is deliberately supplied by the test: this does NOT authenticate RNG.
  await sent(control('finalize',[draw,[aliceAddress,bobAddress],[prizes[0],prizes[9]]]));
  assert.equal(await vault.claimable(quote.target),80n);
  assert.equal(await vault.freeShort(),220n); // 77 new + 3 dust + 140 unused slots.
  await sent(control('reserveUSDG',[empty,1,0,220]));
  await sent(control('finalize',[empty,[],[]]));
  assert.equal(await vault.freeShort(),220n);
  assert.equal(await vault.reward(draw,aliceAddress),70n);
  await sent(vault.connect(bob).claim(draw,aliceAddress));
  await sent(vault.claim(draw,bobAddress));
  assert.equal(await quote.balanceOf(aliceAddress),70n);
  assert.equal(await quote.balanceOf(bobAddress),10n);
  assert.equal(await vault.claimable(quote.target),0n);
  assert.equal(await quote.balanceOf(vault.target),220n);
  assert.equal(await vault.reserved(quote.target),0n);
});
