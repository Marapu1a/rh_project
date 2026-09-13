const {test} = require('node:test');
const assert = require('node:assert/strict');
const {ethers} = require('ethers');
const hre = require('hardhat');
const {compile} = require('../scripts/compile.cjs');
const compiled = compile();
const id = n => ethers.zeroPadValue(ethers.toBeHex(n),32);
let provider,admin,keeper,alice,bob;
async function deploy(name,args=[]) {
  const a=compiled[name];
  const c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);
  await c.waitForDeployment(); return c;
}
async function sent(promise) { return (await promise).wait(); }
async function rejects(action) {
  await assert.rejects(async()=>{const t=await action();if(t.wait) await t.wait();});
}
async function fixture(target=1000n, quoteName='MockToken') {
  await hre.network.provider.send('hardhat_reset');
  provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  [admin,keeper,alice,bob]=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
  const token=await deploy('MockToken'),quote=await deploy(quoteName);
  const controller=await deploy('DrawControllerFixture');
  const vault=await deploy('PromoVault',[token.target,quote.target,controller.target,target]);
  const control=(method,args)=>controller.execute(vault.target,vault.interface.encodeFunctionData(method,args));
  return {token,quote,controller,vault,control};
}
async function accounting(vault,asset,expected) {
  const actual=[await asset.balanceOf(vault.target),await vault.reserved(asset.target),await vault.claimable(asset.target),await vault.available(asset.target)];
  assert.deepEqual(actual,expected.map(BigInt));
  assert.equal(actual[0],actual[1]+actual[2]+actual[3]);
}

test('real FeeRouter credit is not vault funding until pay; both assets complete reserve/finalize/claim',async()=>{
  const {token,quote,vault,control}=await fixture();
  const now=(await provider.getBlock('latest')).timestamp;
  const router=await deploy('FeeRouter',[await admin.getAddress(),token.target,quote.target,[now+1000,[vault.target,ethers.ZeroAddress,ethers.ZeroAddress],[10000,0,0]]]);
  const source=await deploy('MockPairVault',[token.target,router.target]);
  await sent(router.bindSource(source.target,123));
  let index=1;
  for(const asset of [token,quote]) {
    const draw=id(index++);
    await sent(source.fund(asset.target,1000));
    await sent(router.connect(keeper).collect());
    await sent(router.connect(keeper).harvest(asset.target,1));
    assert.equal(await router.credit(asset.target,vault.target),1000n);
    await accounting(vault,asset,[0,0,0,0]);
    const isQuote=asset.target===quote.target;
    const budget=isQuote?400:800, first=isQuote?150:300, second=isQuote?200:400;
    const reserve=()=>isQuote?control('reserveUSDG',[draw,1,0,budget]):control('reserve',[draw,1,asset.target,budget]);
    await rejects(reserve);
    await sent(router.connect(keeper).pay(asset.target,vault.target));
    await sent(reserve());
    await accounting(vault,asset,[1000,budget,0,1000-budget]);
    await sent(control('finalize',[draw,[await alice.getAddress(),await bob.getAddress()],[first,second]]));
    await accounting(vault,asset,[1000,0,first+second,1000-first-second]);
    await sent(vault.connect(keeper).claim(draw,await alice.getAddress()));
    await accounting(vault,asset,[1000-first,0,second,1000-first-second]);
    await sent(vault.connect(bob).claim(draw,await bob.getAddress()));
    await accounting(vault,asset,[1000-first-second,0,0,1000-first-second]);
    assert.equal((await vault.draws(draw)).paid,BigInt(first+second));
    assert.equal(await asset.balanceOf(await alice.getAddress()),BigInt(first));
    assert.equal(await asset.balanceOf(await bob.getAddress()),BigInt(second));
  }
});

test('simultaneous draws cannot spend reserved/owed funds; late funding never changes an existing budget',async()=>{
  const {token,quote,vault,control}=await fixture();
  await sent(token.mint(vault.target,1000));
  await sent(control('reserve',[id(1),1,token.target,700]));
  await rejects(()=>control('reserve',[id(2),1,token.target,301]));
  await rejects(()=>control('reserve',[id(2),1,quote.target,1]));
  await sent(control('reserve',[id(2),1,token.target,300]));
  await sent(control('finalize',[id(1),[await alice.getAddress()],[600]]));
  await accounting(vault,token,[1000,300,600,100]);
  await rejects(()=>control('reserve',[id(3),2,token.target,101]));
  await sent(token.mint(vault.target,500));
  await accounting(vault,token,[1500,300,600,600]);
  assert.equal((await vault.draws(id(1))).budget,700n);
  assert.equal((await vault.draws(id(2))).budget,300n);
  await sent(control('reserve',[id(3),2,token.target,600]));
  await sent(vault.claim(id(1),await alice.getAddress()));
  await accounting(vault,token,[900,900,0,0]);
});

test('only immutable controller can reserve/finalize; constructor rejects EOA controller',async()=>{
  const {token,quote,vault,control}=await fixture();
  await sent(token.mint(vault.target,100));
  await rejects(()=>vault.reserve(id(1),1,token.target,100));
  await sent(control('reserve',[id(1),1,token.target,100]));
  await rejects(()=>vault.connect(keeper).finalize(id(1),[],[]));
  const eoa=await admin.getAddress();
  await rejects(()=>deploy('PromoVault',[token.target,quote.target,eoa,1000]));
});

test('invalid or reused draw IDs and unsupported assets cannot reserve',async()=>{
  const {token,vault,control}=await fixture();
  await sent(token.mint(vault.target,100));
  const other=await deploy('MockToken');
  await rejects(()=>control('reserve',[id(0),1,token.target,1]));
  await rejects(()=>control('reserve',[id(1),0,token.target,1]));
  await rejects(()=>control('reserve',[id(1),1,token.target,0]));
  await rejects(()=>control('reserve',[id(1),1,other.target,1]));
  await sent(control('reserve',[id(1),1,token.target,100]));
  await rejects(()=>control('reserve',[id(1),2,token.target,1]));
  await rejects(()=>vault.claim(id(1),ethers.ZeroAddress));
  await rejects(()=>control('finalize',[id(2),[],[]]));
  await sent(control('finalize',[id(1),[],[]]));
  await rejects(()=>control('reserve',[id(1),2,token.target,100]));
  await accounting(vault,token,[100,0,0,100]);
});

test('invalid award list reverts all partial assignments and preserves the full reserve',async()=>{
  const {token,vault,control}=await fixture();
  const a=await alice.getAddress(),b=await bob.getAddress();
  await sent(token.mint(vault.target,100));
  await sent(control('reserve',[id(1),1,token.target,100]));
  for(const [winners,amounts] of [[[a,b],[50,51]],[[a,a],[30,40]],[[a,ethers.ZeroAddress],[20,30]],[[a,vault.target],[20,30]],[[a,b],[20,0]],[[a,b],[20]]]) {
    await rejects(()=>control('finalize',[id(1),winners,amounts]));
    assert.equal(await vault.reward(id(1),a),0n);
    assert.equal(await vault.reward(id(1),b),0n);
    assert.equal((await vault.draws(id(1))).status,1n);
    await accounting(vault,token,[100,100,0,0]);
  }
  await sent(control('finalize',[id(1),[a,b],[40,60]]));
  await rejects(()=>control('finalize',[id(1),[a],[1]]));
  await accounting(vault,token,[100,0,100,0]);
});

test('unclaimed prizes have no expiry and cannot be redirected or claimed twice',async()=>{
  const {token,vault,control}=await fixture();
  const a=await alice.getAddress(),k=await keeper.getAddress();
  await sent(token.mint(vault.target,100));
  await sent(control('reserve',[id(1),1,token.target,100]));
  await sent(control('finalize',[id(1),[a],[100]]));
  await hre.network.provider.send('evm_increaseTime',[86400*365]);
  await hre.network.provider.send('evm_mine');
  await rejects(()=>vault.connect(keeper).claim(id(1),k));
  await sent(vault.connect(keeper).claim(id(1),a));
  await rejects(()=>vault.claim(id(1),a));
  assert.equal(await token.balanceOf(k),0n);
  assert.equal(await token.balanceOf(a),100n);
  await accounting(vault,token,[0,0,0,0]);
});

test('failed transfer retains the winner debt and does not block another winner',async()=>{
  const {token,vault,control}=await fixture();
  const a=await alice.getAddress(),b=await bob.getAddress();
  await sent(token.mint(vault.target,100));
  await sent(control('reserve',[id(1),1,token.target,100]));
  await sent(control('finalize',[id(1),[a,b],[40,60]]));
  await sent(token.blockRecipient(a));
  await rejects(()=>vault.claim(id(1),a));
  assert.equal(await vault.reward(id(1),a),40n);
  assert.equal((await vault.draws(id(1))).paid,0n);
  await sent(vault.claim(id(1),b));
  await accounting(vault,token,[40,0,40,0]);
  await sent(token.blockRecipient(ethers.ZeroAddress));
  await sent(vault.claim(id(1),a));
  await accounting(vault,token,[0,0,0,0]);
});

test('reentrant token callback cannot pay twice',async()=>{
  const {token,vault,control}=await fixture();
  const a=await alice.getAddress();
  await sent(token.mint(vault.target,100));
  await sent(control('reserve',[id(1),1,token.target,100]));
  await sent(control('finalize',[id(1),[a],[100]]));
  await sent(token.setCallback(vault.target,vault.interface.encodeFunctionData('claim',[id(1),a])));
  await sent(vault.claim(id(1),a));
  assert.equal(await token.reentrySucceeded(),false);
  assert.equal((await vault.draws(id(1))).paid,100n);
  assert.equal(await token.balanceOf(a),100n);
  await accounting(vault,token,[0,0,0,0]);
});

test('unexpected balance deficit fails closed for reserve, finalize and claim',async()=>{
  const {token,vault,control}=await fixture();
  const a=await alice.getAddress();
  await sent(token.mint(vault.target,100));
  await sent(control('reserve',[id(1),1,token.target,80]));
  // Fixture-only destruction models a balance change outside supported ordinary ERC20 semantics.
  await sent(token.blockRecipient(await keeper.getAddress())); // permit burns to zero in this mock
  await sent(token.burn(vault.target,30));
  await rejects(()=>vault.available(token.target));
  await rejects(()=>control('reserve',[id(2),1,token.target,1]));
  await rejects(()=>control('finalize',[id(1),[a],[60]]));
  assert.equal((await vault.draws(id(1))).status,1n);
  await sent(token.mint(vault.target,30));
  await sent(control('finalize',[id(1),[a],[60]]));
  await sent(token.burn(vault.target,50));
  await rejects(()=>vault.claim(id(1),a));
  assert.equal(await vault.reward(id(1),a),60n);
  await sent(token.mint(vault.target,10));
  await sent(vault.claim(id(1),a));
  await accounting(vault,token,[0,0,0,0]);
});

async function fundingCapital(quote,vault,amount=1000000n) {
  await sent(quote.mint(await alice.getAddress(),amount));
  await sent(quote.connect(alice).approve(vault.target,ethers.MaxUint256));
  return (amount,destination=0)=>sent(vault.connect(alice).fundUSDG(amount,destination));
}
async function buckets(vault) {
  return Promise.all([vault.freeShort(),vault.freeCurrent(),vault.freeNext(),vault.generalFundingPhase()]);
}
async function conserved(vault,quote) {
  const [s,c,n]=await buckets(vault);
  const r=await vault.reserved(quote.target),owed=await vault.claimable(quote.target),u=await vault.unrecognizedUSDG();
  assert.equal(await quote.balanceOf(vault.target),s+c+n+r+owed+u);
  assert.equal(await vault.available(quote.target),s+c+n+u);
  assert.ok(n<=await vault.nextStartTarget());
}

test('USDG general and targeted funding: exact cap crossing, overflow, no project fee',async()=>{
  const {quote,vault}=await fixture(100n);
  const fund=await fundingCapital(quote,vault);
  await fund(120); // 60 short, 40 current, 20 next
  assert.deepEqual(await buckets(vault),[60n,40n,20n,0n]);
  await fund(600); // only 80 of nominal 100 to next
  assert.deepEqual(await buckets(vault),[360n,260n,100n,0n]);
  await fund(600);
  assert.deepEqual(await buckets(vault),[660n,560n,100n,0n]);
  await fund(12,3); // filled targeted NEXT -> CURRENT
  await fund(7,1);
  await fund(11,2);
  assert.deepEqual(await buckets(vault),[667n,583n,100n,0n]);
  assert.equal(await quote.balanceOf(vault.target),1350n);
  await conserved(vault,quote);
});

test('direct transfers are GENERAL, never attributed to a later targeted caller; sync is idempotent',async()=>{
  const {quote,vault}=await fixture(100n);
  const fund=await fundingCapital(quote,vault);
  await sent(quote.connect(alice).transfer(vault.target,120));
  assert.equal(await vault.unrecognizedUSDG(),120n);
  assert.deepEqual(await buckets(vault),[0n,0n,0n,0n]);
  const receipt=await fund(100,3);
  const events=receipt.logs.map(l=>{try{return vault.interface.parseLog(l);}catch{return null;}}).filter(e=>e?.name==='USDGAllocated');
  assert.equal(events.length,2);
  assert.equal(events[0].args.payer,ethers.ZeroAddress);
  assert.equal(events[0].args.destination,0n);
  assert.equal(events[0].args.received,120n);
  assert.equal(events[1].args.payer,await alice.getAddress());
  assert.deepEqual(await buckets(vault),[60n,60n,100n,0n]);
  await sent(vault.connect(keeper).syncUSDG());
  await sent(vault.connect(bob).syncUSDG());
  assert.deepEqual(await buckets(vault),[60n,60n,100n,0n]);
  await conserved(vault,quote);
});

test('general allocation is partition invariant across all phases and Next saturation',async()=>{
  const {quote,vault}=await fixture(3n);
  const fund=await fundingCapital(quote,vault);
  for(let phase=0;phase<6;phase++) {
    assert.equal(await vault.generalFundingPhase(),BigInt(phase));
    let snapshot=await hre.network.provider.send('evm_snapshot');
    await fund(29);
    const whole=await buckets(vault);
    await hre.network.provider.send('evm_revert',[snapshot]);
    snapshot=await hre.network.provider.send('evm_snapshot');
    for(const x of [1,1,2,5,7,13]) await fund(x);
    assert.deepEqual(await buckets(vault),whole);
    await conserved(vault,quote);
    await hre.network.provider.send('evm_revert',[snapshot]);
    await fund(1);
  }
});

test('targeted deposits and prize release do not advance or reset general rounding phase',async()=>{
  const {quote,vault,control}=await fixture(100n);
  const fund=await fundingCapital(quote,vault);
  await fund(5);
  assert.deepEqual(await buckets(vault),[3n,2n,0n,5n]);
  await fund(99,3);
  await sent(control('reserveUSDG',[id(1),1,0,3]));
  await sent(control('finalize',[id(1),[],[]]));
  assert.equal(await vault.generalFundingPhase(),5n);
  await fund(1);
  assert.deepEqual(await buckets(vault),[3n,2n,100n,0n]);
  await fund(6);
  assert.deepEqual(await buckets(vault),[6n,5n,100n,0n]);
  await conserved(vault,quote);
});

test('USDG reserve sources isolate frozen budgets and unpaid debts; unused budget returns to source',async()=>{
  const {quote,vault,control}=await fixture(100n);
  const fund=await fundingCapital(quote,vault);
  await fund(600);
  await sent(control('reserveUSDG',[id(1),1,0,250]));
  await sent(control('reserveUSDG',[id(2),1,1,150]));
  assert.deepEqual(await buckets(vault),[50n,50n,100n,0n]);
  await rejects(()=>control('reserveUSDG',[id(3),1,0,51]));
  await rejects(()=>control('reserveUSDG',[id(3),1,1,51]));
  await rejects(()=>control('reserve',[id(3),1,quote.target,1]));
  await sent(quote.connect(alice).transfer(vault.target,60));
  await sent(vault.syncUSDG());
  assert.equal((await vault.draws(id(1))).budget,250n);
  assert.equal((await vault.draws(id(2))).budget,150n);
  await sent(control('finalize',[id(1),[await alice.getAddress()],[200]]));
  await sent(control('finalize',[id(2),[],[]]));
  assert.deepEqual(await buckets(vault),[130n,230n,100n,0n]);
  assert.equal(await vault.claimable(quote.target),200n);
  await sent(control('reserveUSDG',[id(3),2,0,130]));
  const before=await buckets(vault);
  await sent(quote.blockRecipient(await alice.getAddress()));
  await rejects(async()=>vault.claim(id(1),await alice.getAddress()));
  assert.equal(await vault.reward(id(1),await alice.getAddress()),200n);
  await sent(quote.blockRecipient(ethers.ZeroAddress));
  await sent(vault.connect(keeper).claim(id(1),await alice.getAddress()));
  assert.deepEqual(await buckets(vault),before);
  await conserved(vault,quote);
});

test('USDG reserve/finalize validation reverts source debits and partial winner assignments',async()=>{
  const {quote,vault,control,token,controller}=await fixture();
  const fund=await fundingCapital(quote,vault);
  await fund(60,1);
  await rejects(()=>vault.reserveUSDG(id(1),1,0,1));
  for(const args of [[id(0),1,0,1],[id(1),0,0,1],[id(1),1,0,0],[id(1),1,2,1]])
    await rejects(()=>control('reserveUSDG',args));
  assert.deepEqual(await buckets(vault),[60n,0n,0n,0n]);
  await sent(control('reserveUSDG',[id(1),1,0,60]));
  await rejects(()=>control('reserveUSDG',[id(1),2,1,1]));
  const a=await alice.getAddress(),b=await bob.getAddress();
  for(const [w,amounts] of [[[a,b],[30,31]],[[a,a],[20,20]],[[a,b],[20,0]]]) {
    await rejects(()=>control('finalize',[id(1),w,amounts]));
    assert.equal(await vault.reward(id(1),a),0n);
    assert.equal(await vault.reserved(quote.target),60n);
    assert.deepEqual(await buckets(vault),[0n,0n,0n,0n]);
  }
  await sent(control('finalize',[id(1),[a],[40]]));
  await rejects(()=>control('finalize',[id(1),[],[]]));
  assert.deepEqual(await buckets(vault),[20n,0n,0n,0n]);
  await rejects(()=>deploy('PromoVault',[token.target,quote.target,controller.target,0]));
  await rejects(()=>deploy('PromoVault',[quote.target,quote.target,controller.target,1]));
  await conserved(vault,quote);
});

test('failed funding restores allowance, direct-transfer recognition and rounding; invalid input rejected',async()=>{
  const {quote,vault}=await fixture();
  const fund=await fundingCapital(quote,vault,100n);
  await sent(quote.connect(alice).transfer(vault.target,5));
  await sent(quote.blockRecipient(vault.target));
  await rejects(()=>fund(12,1));
  assert.equal(await vault.unrecognizedUSDG(),5n);
  assert.deepEqual(await buckets(vault),[0n,0n,0n,0n]);
  await sent(quote.blockRecipient(ethers.ZeroAddress));
  await rejects(()=>fund(0));
  await rejects(()=>fund(1,4));
  await sent(quote.connect(alice).approve(vault.target,0));
  await rejects(()=>fund(1));
  assert.equal(await vault.unrecognizedUSDG(),5n);
  await sent(vault.syncUSDG());
  assert.deepEqual(await buckets(vault),[3n,2n,0n,5n]);
  await conserved(vault,quote);
});

test('short transfer is rejected rather than accounting nominal or fee-on-transfer funding',async()=>{
  const {quote,vault}=await fixture(100n,'ShortTransferToken');
  const fund=await fundingCapital(quote,vault,20n);
  await rejects(()=>fund(10));
  assert.equal(await quote.balanceOf(vault.target),0n);
  assert.equal(await quote.balanceOf(await alice.getAddress()),20n);
  assert.deepEqual(await buckets(vault),[0n,0n,0n,0n]);
});

test('incoming and outgoing callbacks cannot reenter funding, sync or claim',async()=>{
  const {quote,vault,control}=await fixture();
  const fund=await fundingCapital(quote,vault);
  for(const [method,args] of [['syncUSDG',[]],['fundUSDG',[1,0]]]) {
    await sent(quote.setCallback(vault.target,vault.interface.encodeFunctionData(method,args)));
    await fund(12,1);
    assert.equal(await quote.reentrySucceeded(),false);
  }
  assert.deepEqual(await buckets(vault),[24n,0n,0n,0n]);
  await sent(control('reserveUSDG',[id(1),1,0,24]));
  await sent(control('finalize',[id(1),[await alice.getAddress()],[24]]));
  await sent(quote.setCallback(vault.target,vault.interface.encodeFunctionData('claim',[id(1),await alice.getAddress()])));
  await sent(vault.claim(id(1),await alice.getAddress()));
  assert.equal(await quote.reentrySucceeded(),false);
  assert.equal((await vault.draws(id(1))).paid,24n);
  await conserved(vault,quote);
});

test('USDG deficit includes free buckets, fails closed, and cannot be hidden by new funding',async()=>{
  const {quote,vault,control}=await fixture();
  const fund=await fundingCapital(quote,vault);
  await fund(60,1);
  await sent(control('reserveUSDG',[id(1),1,0,20]));
  await sent(control('finalize',[id(1),[await alice.getAddress()],[10]]));
  await sent(quote.blockRecipient(await bob.getAddress()));
  await sent(quote.burn(vault.target,1)); // actual 59, buckets 50 + claimable 10
  await rejects(()=>vault.available(quote.target));
  await rejects(()=>vault.syncUSDG());
  await rejects(()=>fund(100));
  await rejects(()=>control('reserveUSDG',[id(2),1,0,1]));
  await rejects(async()=>vault.claim(id(1),await alice.getAddress()));
  assert.equal(await vault.reward(id(1),await alice.getAddress()),10n);
  await sent(quote.mint(vault.target,1)); // restore fixture-only destruction, not a funding operation
  await conserved(vault,quote);
});

test('allocation handles maximum uint256 funding without amount-sized iteration or rounding overflow',async()=>{
  const {quote,vault}=await fixture(ethers.MaxUint256);
  const fund=await fundingCapital(quote,vault,ethers.MaxUint256);
  await fund(ethers.MaxUint256);
  const x=ethers.MaxUint256;
  assert.deepEqual(await buckets(vault),[(x+1n)/2n,x-(x+1n)/2n-x/6n,x/6n,x%6n]);
  await conserved(vault,quote);
});
