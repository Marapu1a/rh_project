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
async function fixture() {
  await hre.network.provider.send('hardhat_reset');
  provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
  [admin,keeper,alice,bob]=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
  const token=await deploy('MockToken'),quote=await deploy('MockToken');
  const controller=await deploy('DrawControllerFixture');
  const vault=await deploy('PromoVault',[token.target,quote.target,controller.target]);
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
    await rejects(()=>control('reserve',[draw,1,asset.target,800]));
    await sent(router.connect(keeper).pay(asset.target,vault.target));
    await sent(control('reserve',[draw,1,asset.target,800]));
    await accounting(vault,asset,[1000,800,0,200]);
    await sent(control('finalize',[draw,[await alice.getAddress(),await bob.getAddress()],[300,400]]));
    await accounting(vault,asset,[1000,0,700,300]);
    await sent(vault.connect(keeper).claim(draw,await alice.getAddress()));
    await accounting(vault,asset,[700,0,400,300]);
    await sent(vault.connect(bob).claim(draw,await bob.getAddress()));
    await accounting(vault,asset,[300,0,0,300]);
    assert.equal((await vault.draws(draw)).paid,700n);
    assert.equal(await asset.balanceOf(await alice.getAddress()),300n);
    assert.equal(await asset.balanceOf(await bob.getAddress()),400n);
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
  await rejects(()=>deploy('PromoVault',[token.target,quote.target,eoa]));
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
