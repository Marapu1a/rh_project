const {test}=require('node:test'),assert=require('node:assert/strict');
const {ethers}=require('ethers'),hre=require('hardhat');
const compiled=require('../scripts/compile.cjs').compile();
const send=async p=>(await p).wait();
const fail=async fn=>assert.rejects(async()=>send(fn()));
const {inspect,executeLocal}=require('../scripts/pons-collector-manual.cjs');
async function fixture(){
 await hre.network.provider.send('hardhat_reset');
 const p=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
 const owner=await p.getSigner(),ops=await p.getSigner(1),team=await p.getSigner(2);
 const deploy=async(n,args=[])=>{let a=compiled[n],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;};
 const token=await deploy('MockToken'),quote=await deploy('MockToken'),escrow=await deploy('PonsEscrowFixture');
 const c=await deploy('LocalPonsCollector',[await owner.getAddress(),token.target,quote.target,escrow.target]);
 const promo=await deploy('PromoVault',[token.target,quote.target,escrow.target,100]);
 const ends=Number((await p.getBlock('latest')).timestamp)+100;
 const policy=[ends,[promo.target,await ops.getAddress(),await team.getAddress()],[9000,500,500]];
 const fund=async n=>{await send(quote.mint(escrow.target,n));await send(escrow.fund(c.target,quote.target,n));};
 return {p,owner,ops,team,deploy,token,quote,escrow,c,promo,ends,policy,fund};
}
test('Pons: binding restrictions, real PromoVault funding and idempotent pull/pay',async()=>{
 const f=await fixture(),{c,policy,ops,quote,promo,token,fund}=f;
 await fail(()=>c.pull());await fail(()=>c.connect(ops).bindPromo(policy));
 await fail(()=>c.bindPromo([policy[0],policy[1],[10000,0,0]]));
 await send(c.bindPromo(policy));await fail(()=>c.bindPromo(policy));
 await fund(1000);await send(token.mint(c.target,100000));await send(c.connect(ops).pull());
 await send(c.pull());assert.equal(await c.received(1),1000n);
 assert.equal(await c.credit(promo.target),900n);assert.equal(await c.credit(await ops.getAddress()),50n);
 await send(c.pay(promo.target));await send(c.pay(promo.target));
 assert.equal(await quote.balanceOf(promo.target),900n);
 assert.equal((await promo.freeShort())+(await promo.freeCurrent())+(await promo.freeNext()),900n);
 assert.equal(await token.balanceOf(c.target),100000n);
});
test('Pons: blocked or partial claim cannot consume escrow or existing credits',async()=>{
 const {c,policy,escrow,quote,promo,fund}=await fixture();await send(c.bindPromo(policy));
 await fund(1000);await send(c.pull());await fund(200);
 await send(escrow.configure(true,false));await fail(()=>c.pull());
 await send(c.pay(promo.target));assert.equal(await quote.balanceOf(promo.target),900n);
 await send(escrow.configure(false,true));await fail(()=>c.pull());
 assert.equal(await escrow.balanceOfToken(c.target,quote.target),200n);
 assert.equal(await c.received(1),1000n);
 await send(escrow.configure(false,false));await send(c.pull());assert.equal(await c.received(1),1200n);
});
test('Pons: failed payout preserves credit; cumulative rounding and rollover survive escrow outage',async()=>{
 const {c,policy,escrow,quote,promo,fund,ends,ops,team}=await fixture();await send(c.bindPromo(policy));
 for(let i=0;i<3;i++){await fund(7);await send(c.pull());}
 assert.equal(await c.credit(promo.target),18n);assert.equal(await c.credit(await ops.getAddress()),1n);
 await send(quote.blockRecipient(promo.target));await fail(()=>c.pay(promo.target));
 assert.equal(await c.credit(promo.target),18n);
 await send(escrow.configure(true,false));await hre.network.provider.send('evm_setNextBlockTimestamp',[ends]);await hre.network.provider.send('evm_mine');
 await send(c.rollCampaign(1,[ends+1000,policy[1],policy[2]]));
 assert.equal(await c.credit(promo.target),19n);
 assert.equal((await c.credit(promo.target))+(await c.credit(await ops.getAddress()))+(await c.credit(await team.getAddress())),21n);
 await send(quote.mint(c.target,100));await send(c.sync());assert.equal(await c.received(2),100n);
});
test('Pons: wrong vault cannot bind; changed escrow code blocks pull but not earned payments',async()=>{
 const {c,deploy,token,quote,escrow,promo,policy,fund}=await fixture();
 // Use a valid vault for a different quote, rather than a malformed constructor.
 const otherQuote=await deploy('MockToken');
 const other=await deploy('PromoVault',[token.target,otherQuote.target,escrow.target,100]);
 await fail(()=>c.bindPromo([policy[0],[other.target,...policy[1].slice(1)],policy[2]]));
 assert.equal(await c.promoVault(),ethers.ZeroAddress);
 await send(c.bindPromo(policy));await fund(1000);await send(c.pull());
 await hre.network.provider.send('hardhat_setCode',[escrow.target,'0x00']);
 await fail(()=>c.pull());await send(c.pay(promo.target));
 assert.equal(await quote.balanceOf(promo.target),900n);
});
async function venueFixture(){
 const f=await fixture();await send(f.c.bindPromo(f.policy));
 f.venue=await f.deploy('PonsVenueFixture');
 await send(f.venue.configure(f.token.target,f.quote.target,f.c.target,f.escrow.target));
 return f;
}
test('Pons venue: owner-only one-time binding, wrong quote and recipient rejected',async()=>{
 const {c,venue,ops,token,quote}=await venueFixture();
 await fail(()=>c.sweepCurve());await fail(()=>c.connect(ops).bindVenue(venue.target));
 await send(venue.setQuote(token.target));await fail(()=>c.bindVenue(venue.target));
 assert.equal(await c.factory(),ethers.ZeroAddress);
 await send(venue.setQuote(quote.target));await send(venue.setRecipient(await ops.getAddress()));await fail(()=>c.bindVenue(venue.target));
 await send(venue.setRecipient(c.target));await send(c.bindVenue(venue.target));await fail(()=>c.bindVenue(venue.target));
});
test('Pons venue: curve and pool sweeps fund actual vault; operator wait preserves independent claims',async()=>{
 const {c,venue,quote,escrow,promo,p,owner}=await venueFixture();await send(c.bindVenue(venue.target));
 await send(quote.mint(venue.target,2000));await send(venue.fund(1000));
 await fail(()=>c.sweepPool());await send(c.sweepCurve());assert.equal(await escrow.balanceOfToken(c.target,quote.target),1000n);
 await send(venue.setState(2,true,false));await fail(()=>c.sweepCurve());await fail(()=>c.sweepPool());
 let plan=await inspect(p,c.target,await owner.getAddress());assert.equal(plan.actions.sweep.status,'waiting');assert.equal(plan.actions.pull.status,'ready');
 await send(c.pull());await send(c.pay(promo.target));assert.equal(await quote.balanceOf(promo.target),900n);
 await send(venue.setState(2,false,false));await send(venue.fund(1000));await send(c.sweepPool());await send(c.pull());await send(c.pay(promo.target));assert.equal(await quote.balanceOf(promo.target),1800n);
 await send(venue.setRecipient(ethers.ZeroAddress));await fail(()=>c.sweepPool());
 await send(c.pay(await c.owner())); // zero credit is a safe no-op
 await assert.rejects(()=>executeLocal(p,c.target,awaitAddress(owner),'sweep','wrong-instance'));
});
function awaitAddress(signer){return signer.address;}
test('Pons manual: failing sweep simulation does not hide ready escrow claim',async()=>{
 const {c,venue,quote,p,owner,fund}=await venueFixture();await send(c.bindVenue(venue.target));
 await fund(1000);await send(quote.mint(venue.target,1000));await send(venue.fund(1000));await send(venue.setState(0,false,true));
 const plan=await inspect(p,c.target,await owner.getAddress());assert.equal(plan.actions.sweep.status,'blocked');assert.equal(plan.actions.pull.status,'ready');
 await send(c.pull());await send(venue.setState(1,false,false));const wait=await inspect(p,c.target,await owner.getAddress());assert.equal(wait.actions.sweep.reason,'graduation-incomplete');
});
