const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers'),hre=require('hardhat');
const compiled=require('../scripts/compile.cjs').compile();
test('Infinity collector saved fork reaches GENERAL after rollover with old unpaid credits',()=>{
 const e=require('../research/infinity-source-audit/collector-fork-2026-09-27.json');assert.equal(e.success,true);
 const iface=new ethers.Interface(compiled.InfinityCollector.abi);
 const events=e.transactions.flatMap(t=>t.receipt.logs.filter(l=>l.address.toLowerCase()===e.collector.address.toLowerCase()).map(l=>iface.parseLog(l)));
 assert.equal(events.filter(x=>x.name==='CampaignClosed').length,1);
 const claimed=events.filter(x=>x.name==='Claimed').reduce((s,x)=>s+x.args.amount,0n);
 const closed=events.find(x=>x.name==='CampaignClosed');assert.equal(closed.args.revenue,claimed+7n);
 const recognized=events.filter(x=>x.name==='RevenueRecognized'&&x.args.id===2n).reduce((s,x)=>s+x.args.amount,0n);assert.equal(recognized,11n);
 const paid=events.filter(x=>x.name==='Paid').reduce((s,x)=>s+x.args.amount,0n);assert.equal(paid,claimed+18n);
 const transfer=new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
 const payment=e.transactions.find(t=>t.label==='pay Promo and sync GENERAL');
 const actual=payment.receipt.logs.filter(l=>l.address.toLowerCase()===e.launch.quote.toLowerCase()).map(l=>{try{return transfer.parseLog(l)}catch{return null}}).filter(l=>l?.name==='Transfer'&&l.args.to.toLowerCase()===e.collector.promo.toLowerCase()).reduce((s,l)=>s+l.args.value,0n);
 assert.equal(actual,paid);assert.equal(e.collector.reserves.reduce((s,x)=>s+BigInt(x),0n),paid);
});
const send=async p=>{const tx=await p;return tx.wait();};
const rejects=async p=>assert.rejects(async()=>send(p()));
async function fixture(bps=[10000,0,0],bind=true){
 await hre.network.provider.send('hardhat_reset');
 const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
 const owner=await provider.getSigner(0),keeper=await provider.getSigner(1),other=await provider.getSigner(2);
 async function deploy(n,args=[]){const a=compiled[n],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;}
 const token=await deploy('MockToken'),quote=await deploy('MockToken'),hook=await deploy('InfinityHookFixture'),factory=await deploy('InfinityFactoryFixture');
 const c=await deploy('InfinityCollector',[await owner.getAddress(),token.target,quote.target,hook.target,factory.target]);
 const vault=await deploy('InfinityVaultFixture',[token.target,hook.target,factory.target,c.target]);
 const promo=await deploy('PromoVault',[token.target,quote.target,hook.target,100]);
 const ends=Number((await provider.getBlock('latest')).timestamp)+100;
 const recipients=[promo.target,await keeper.getAddress(),await other.getAddress()];const policy=[ends,recipients,bps];
 await send(hook.configure(vault.target,300));if(bind)await send(c.bindSource(vault.target,policy));
 async function fund(n){await send(quote.mint(vault.target,n));await send(vault.fund(quote.target,n));}
 async function time(n){await hre.network.provider.send('evm_setNextBlockTimestamp',[n]);await hre.network.provider.send('evm_mine');}
 return {provider,owner,keeper,other,deploy,token,quote,hook,factory,c,vault,promo,ends,recipients,policy,fund,time};
}
test('Infinity binding is single-use, owner-only, pending policies rejected, prebind accounting closed',async()=>{
 const f=await fixture(undefined,false),{c,vault,hook,factory,policy,keeper}=f;
 await rejects(()=>c.pull());await rejects(()=>c.sync());await rejects(()=>c.rollCampaign(0,policy));
 await rejects(()=>c.connect(keeper).bindSource(vault.target,policy));
 await send(factory.setValid(false));await rejects(()=>c.bindSource(vault.target,policy));assert.equal(await c.source(),ethers.ZeroAddress);
 await send(factory.setValid(true));await send(hook.configure(vault.target,200));await rejects(()=>c.bindSource(vault.target,policy));
 await send(hook.configure(vault.target,300));await send(hook.bump(true));await rejects(()=>c.bindSource(vault.target,policy));
 // Restore the fixture's latest policy time, retaining a monotone counter.
 await send(hook.bump(false)); // futureAt remains nonzero, so use a fresh fixture for valid bind.
 const g=await fixture();await rejects(()=>g.c.bindSource(g.vault.target,g.policy));
});
test('Infinity permissionless empty/pull/pay funds GENERAL; TOKEN is not revenue',async()=>{
 const {c,vault,quote,token,promo,keeper,fund}=await fixture();
 await send(c.connect(keeper).pull());assert.equal(await vault.calls(),0n);
 await send(token.mint(c.target,777));await send(c.sync());assert.equal(await c.received(1),0n);
 await fund(600);await send(c.connect(keeper).pull());assert.equal(await c.credit(promo.target),600n);
 await send(c.connect(keeper).pay(promo.target));assert.equal(await promo.freeShort(),300n);assert.equal(await promo.freeNext(),100n);assert.equal(await promo.freeCurrent(),200n);
 assert.equal(await c.accounted(),0n);assert.equal(await quote.balanceOf(c.target),0n);await send(c.pay(promo.target));
});
test('Infinity wrong vault identities and wrong Promo quote cannot consume binding; failed pay preserves debt',async()=>{
 const {c,deploy,token,quote,hook,factory,vault,promo,policy,fund}=await fixture(undefined,false);
 for(const args of [[quote.target,hook.target,factory.target,c.target],[token.target,factory.target,factory.target,c.target],[token.target,hook.target,hook.target,c.target],[token.target,hook.target,factory.target,hook.target]]){
  const bad=await deploy('InfinityVaultFixture',args);await send(hook.configure(bad.target,300));await rejects(()=>c.bindSource(bad.target,policy));assert.equal(await c.source(),ethers.ZeroAddress);
 }
 await send(hook.configure(vault.target,300));
 const wrong=await deploy('PromoVault',[token.target,hook.target,hook.target,100]);
 await rejects(()=>c.bindSource(vault.target,[policy[0],[wrong.target,policy[1][1],policy[1][2]],policy[2]]));
 await send(c.bindSource(vault.target,policy));await fund(17);await send(c.pull());await send(quote.blockRecipient(promo.target));
 await rejects(()=>c.pay(promo.target));assert.equal(await c.credit(promo.target),17n);assert.equal(await c.accounted(),17n);
});
test('Infinity two atomic rollovers preserve unpaid credits, direct income and rounding',async()=>{
 const f=await fixture([3333,3333,3334]),{c,quote,promo,ends,recipients,fund,time,keeper}=f;
 for(let i=0;i<7;i++){await send(quote.mint(c.target,1));await send(c.sync());}
 await fund(11);await time(ends);await send(quote.mint(c.target,5)); // after endsAt still OLD
 await send(c.rollCampaign(1,[ends+100,recipients,[10000,0,0]]));
 assert.equal(await c.received(1),23n);assert.equal(await c.credit(promo.target),9n);
 assert.equal(await c.credit(recipients[1]),7n);assert.equal(await c.credit(recipients[2]),7n);
 await rejects(()=>c.rollCampaign(1,[ends+200,recipients,[10000,0,0]]));
 await rejects(()=>c.connect(keeper).rollCampaign(2,[ends+200,recipients,[10000,0,0]]));
 await send(quote.mint(c.target,13));await fund(17);await send(c.pull());assert.equal(await c.received(2),30n);
 await time(ends+100);await send(c.rollCampaign(2,[ends+200,recipients,[10000,0,0]]));
 assert.equal(await c.credit(promo.target),39n);assert.equal(await c.accounted(),53n);
 for(const r of recipients)await send(c.connect(keeper).pay(r));assert.equal(await c.accounted(),0n);
 assert.equal(await quote.balanceOf(promo.target),39n);
});
test('Infinity failed, short and lying claims rollback final claim and new campaign',async()=>{
 const {c,vault,quote,promo,ends,recipients,fund,time}=await fixture();await fund(10);await send(quote.mint(c.target,3));await time(ends);
 for(const mode of [1,2,3]){await send(vault.setFailure(mode));await rejects(()=>c.rollCampaign(1,[ends+500,recipients,[10000,0,0]]));
  assert.equal(await c.campaignId(),1n);assert.equal(await c.received(1),0n);assert.equal(await c.accounted(),0n);assert.equal(await vault.claimable(c.target,quote.target),10n);assert.equal(await quote.balanceOf(c.target),3n);}
 await send(vault.setFailure(0));await rejects(()=>c.rollCampaign(1,[ends+500,recipients,[9000,0,0]]));assert.equal(await vault.claimable(c.target,quote.target),10n);
 await send(c.rollCampaign(1,[ends+500,recipients,[10000,0,0]]));assert.equal(await c.credit(promo.target),13n);
});
test('Infinity scheduled and change-back drift stop accounting but preserve old pay',async()=>{
 for(const surface of ['hookFuture','hookBack','vaultFuture','vaultBack']){
  const {c,vault,hook,quote,promo,ends,recipients,fund,time}=await fixture();await fund(20);await send(c.pull());await fund(10);await send(quote.mint(c.target,3));
  if(surface==='hookFuture')await send(hook.bump(true));
  if(surface==='hookBack'){await send(hook.configure(vault.target,200));await send(hook.bump(false));await send(hook.configure(vault.target,300));await send(hook.bump(false));}
  if(surface==='vaultFuture')await send(vault.change(300,c.target,true));
  if(surface==='vaultBack'){await send(vault.change(200,c.target,false));await send(vault.change(300,c.target,false));}
  await rejects(()=>c.pull());await rejects(()=>c.sync());await time(ends);await rejects(()=>c.rollCampaign(1,[ends+500,recipients,[10000,0,0]]));
  await send(c.pay(promo.target));assert.equal(await quote.balanceOf(promo.target),20n);assert.equal(await quote.balanceOf(c.target),3n);assert.equal(await vault.claimable(c.target,quote.target),10n);
 }
});
test('Infinity deficit cannot be masked by new claim; reentrancy and claim-time drift revert safely',async()=>{
 const {c,vault,hook,quote,promo,fund}=await fixture();await fund(20);await send(c.pull());await send(quote.blockRecipient('0x0000000000000000000000000000000000000001'));await send(quote.burn(c.target,1));await fund(10);
 await rejects(()=>c.pull());await rejects(()=>c.pay(promo.target));assert.equal(await vault.claimable(c.target,quote.target),10n);
 await send(quote.mint(c.target,1));await send(vault.setCallback(c.target,c.interface.encodeFunctionData('pull')));await send(c.pull());assert.equal(await vault.reentered(),false);
 await send(quote.setCallback(c.target,c.interface.encodeFunctionData('pay',[promo.target])));await send(c.pay(promo.target));assert.equal(await quote.reentrySucceeded(),false);
 await fund(5);await send(vault.setCallback(hook.target,hook.interface.encodeFunctionData('bump',[false])));await rejects(()=>c.pull());
 assert.equal(await hook.latest(),1n);assert.equal(await vault.claimable(c.target,quote.target),5n);
});
