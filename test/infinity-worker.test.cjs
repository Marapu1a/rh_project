const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ethers}=require('ethers'),hre=require('hardhat'),compiled=require('../scripts/compile.cjs').compile();
const {runInfinityWorker}=require('../scripts/infinity-worker.cjs');
const send=async p=>(await p).wait();
async function fixture(bps=[10000,0,0]){
 await hre.network.provider.send('hardhat_reset');const provider=new ethers.BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
 const owner=await provider.getSigner(0),keeper=await provider.getSigner(1),other=await provider.getSigner(2);
 async function deploy(n,args=[]){const a=compiled[n],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;}
 const token=await deploy('MockToken'),quote=await deploy('MockToken'),hook=await deploy('InfinityHookFixture'),factory=await deploy('InfinityFactoryFixture');
 const c=await deploy('InfinityCollector',[await owner.getAddress(),token.target,quote.target,hook.target,factory.target]);
 const vault=await deploy('InfinityVaultFixture',[token.target,hook.target,factory.target,c.target]),promo=await deploy('PromoVault',[token.target,quote.target,hook.target,100]);
 const ends=(await provider.getBlock('latest')).timestamp+100,recipients=[promo.target,await owner.getAddress(),await other.getAddress()];
 await send(hook.configure(vault.target,300));await send(c.bindSource(vault.target,[ends,recipients,bps]));
 const anchor=await provider.getBlock('latest');
 const job={schema:'local-infinity-worker-v1',chainId:31337,collector:c.target,token:token.target,quote:quote.target,promo:promo.target,source:vault.target,
  collectorCodeHash:ethers.keccak256(await provider.getCode(c.target)),sourceFingerprint:await c.sourceFingerprint(),anchor:{number:anchor.number,hash:anchor.hash},campaignId:'1',recipients,bps,legacy:[],maxGasPrice:'1000000000000',nativeFloor:'1000000000000',gasUnits:{pull:'500000',pay:'500000'},pollSeconds:60};
 fs.mkdirSync('.local/logs',{recursive:true});const dir=fs.mkdtempSync(path.resolve('.local/logs/infinity-worker-')),statePath=path.join(dir,'state.json');
 const options={provider,collector:c.connect(provider),executor:keeper,job,statePath};
 async function fund(n){await send(quote.mint(vault.target,n));await send(vault.fund(quote.target,n));}
 return {provider,owner,keeper,other,token,quote,hook,c,vault,promo,job,options,fund,ends};
}
function faulty(f,kind){
 const real=f.c.connect(f.keeper),reader=f.c.connect(f.provider);let once=true;
 const wrap=name=>{const method=async(...args)=>{
  const tx=await real[name](...args);
  if(once){once=false;if(kind==='unknown')throw Object.assign(Error('connection lost after send'),{code:'ECONNRESET'});
   return {hash:tx.hash,from:tx.from,nonce:tx.nonce,wait:async()=>{throw Object.assign(Error('timeout'),{code:'TIMEOUT'});}};}
  return tx;
 };method.estimateGas=real[name].estimateGas;method.populateTransaction=real[name].populateTransaction;method.fragment=real[name].fragment;return method;};
 return new Proxy(reader,{get(t,k){if(k==='connect')return ()=>({pull:wrap('pull'),pay:wrap('pay')});return Reflect.get(t,k);}});
}
test('Infinity worker pulls and pays GENERAL, persists resolved intent, next pass sends nothing',async()=>{
 const f=await fixture();await f.fund(600);let r=await runInfinityWorker(f.options);assert.equal(r.status,'complete');assert.deepEqual(r.steps.map(x=>x.action),['pull','pay']);
 assert.equal(await f.promo.freeShort(),300n);assert.equal(await f.promo.freeCurrent(),200n);assert.equal(await f.promo.freeNext(),100n);
 const nonce=await f.provider.getTransactionCount(await f.keeper.getAddress());r=await runInfinityWorker(f.options);assert.equal(r.steps.length,0);assert.equal(await f.provider.getTransactionCount(await f.keeper.getAddress()),nonce);
 const state=JSON.parse(fs.readFileSync(f.options.statePath));assert(!state.pending);assert.equal(state.lastResolved.action,'pay');
});
test('Infinity worker drift skips new income but pays old credits and direct inventory remains untouched',async()=>{
 const f=await fixture();await f.fund(20);await send(f.c.pull());await f.fund(10);await send(f.quote.mint(f.c.target,3));await send(f.hook.bump(true));
 const r=await runInfinityWorker(f.options);assert.equal(r.status,'degraded');assert.equal(r.failures[0].reason,'sourceDrift');assert.deepEqual(r.steps.map(x=>x.action),['pay']);assert.equal(await f.quote.balanceOf(f.promo.target),20n);assert.equal(await f.quote.balanceOf(f.c.target),3n);
});
test('Infinity worker gas and native shortfall wait without intent, then resume after top-up',async()=>{
 const f=await fixture();await f.fund(10);const wallet=await f.keeper.getAddress();await hre.network.provider.send('hardhat_setBalance',[wallet,'0x0']);
 let r=await runInfinityWorker(f.options);assert.equal(r.status,'waiting');assert.equal(r.reason,'nativeFunding');assert(!fs.existsSync(f.options.statePath));
 await hre.network.provider.send('hardhat_setBalance',[wallet,'0xde0b6b3a7640000']);
 r=await runInfinityWorker({...f.options,job:{...f.job,maxGasPrice:'1'}});assert.equal(r.reason,'gasPrice');
 r=await runInfinityWorker(f.options);assert.equal(r.status,'complete');assert.equal(await f.quote.balanceOf(f.promo.target),10n);
});
test('Infinity worker unknown hash blocks repeated send even when chain transaction already mined',async()=>{
 const f=await fixture();await f.fund(10);let r=await runInfinityWorker({...f.options,collector:faulty(f,'unknown')});assert.equal(r.status,'blocked');assert(!r.pending.transactionHash);
 const nonce=await f.provider.getTransactionCount(await f.keeper.getAddress());r=await runInfinityWorker(f.options);assert.equal(r.reason,'unknownHash');assert.equal(await f.provider.getTransactionCount(await f.keeper.getAddress()),nonce);assert.equal(await f.c.credit(f.promo.target),10n);
});
test('Infinity worker known hash reconciles original receipt then pays without duplicate pull',async()=>{
 const f=await fixture();await f.fund(10);let r=await runInfinityWorker({...f.options,collector:faulty(f,'timeout')});assert.equal(r.reason,'pendingReceipt');assert(r.pending.transactionHash);
 r=await runInfinityWorker(f.options);assert.equal(r.status,'complete');assert.deepEqual(r.steps.map(x=>x.action),['pay']);assert.equal(await f.vault.calls(),1n);
});
test('Infinity worker prevents deployment/config mismatch and balance deficit before sending',async()=>{
 const f=await fixture();await f.fund(10);
 let r=await runInfinityWorker({...f.options,job:{...f.job,collectorCodeHash:ethers.ZeroHash}});assert.equal(r.status,'error');assert.equal(r.steps.length,0);
 await send(f.c.pull());await send(f.quote.blockRecipient('0x0000000000000000000000000000000000000001'));await send(f.quote.burn(f.c.target,1));
 r=await runInfinityWorker(f.options);assert.equal(r.status,'error');assert.match(r.error.message,/deficit/);assert.equal(r.steps.length,0);
});
test('Infinity worker validates old policy witnesses and pays unpaid historical recipient',async()=>{
 const f=await fixture([5000,5000,0]);await f.fund(20);await send(f.c.pull());await hre.network.provider.send('evm_setNextBlockTimestamp',[f.ends]);await hre.network.provider.send('evm_mine');
 const recipients=[f.promo.target,await f.other.getAddress(),ethers.ZeroAddress];await send(f.c.rollCampaign(1,[f.ends+1000,recipients,[10000,0,0]]));
 const job={...f.job,campaignId:'2',recipients,bps:[10000,0,0],legacy:[{recipient:await f.owner.getAddress(),campaignId:'1',slot:1}]};
 let r=await runInfinityWorker({...f.options,job:{...job,legacy:[{...job.legacy[0],slot:2}]}});assert.equal(r.status,'error');
 r=await runInfinityWorker({...f.options,job});assert.equal(r.status,'complete');assert.equal(r.steps.length,2);assert.equal(await f.quote.balanceOf(await f.owner.getAddress()),10n);
});
test('Infinity worker transient source read and failed recipient do not suppress other old credits',async()=>{
 const f=await fixture([5000,5000,0]);await f.fund(20);await send(f.c.pull());await send(f.quote.blockRecipient(f.promo.target));
 const reader=f.c.connect(f.provider),wrapped=new Proxy(reader,{get(t,k){if(k==='pull')return {staticCall:async()=>{throw Object.assign(Error('source timeout'),{code:'ETIMEDOUT'});}};return Reflect.get(t,k);}});
 const r=await runInfinityWorker({...f.options,collector:wrapped});assert.equal(r.status,'degraded');assert.deepEqual(r.failures.map(x=>x.reason),['sourceReadUnavailable','payRejected']);
 assert.equal(await f.quote.balanceOf(await f.owner.getAddress()),10n);assert.equal(await f.c.credit(f.promo.target),10n);
});
test('Infinity worker stops on deficit arising at estimate of the last recipient pay',async()=>{
 const f=await fixture([0,0,10000]);await f.fund(20);await send(f.c.pull());
 await send(f.quote.blockRecipient('0x0000000000000000000000000000000000000001'));
 const real=f.c.connect(f.keeper),reader=f.c.connect(f.provider);let estimates=0;
 const pay=async(...args)=>real.pay(...args);
 pay.fragment=real.pay.fragment;pay.populateTransaction=real.pay.populateTransaction;
 pay.estimateGas=async(...args)=>{estimates++;await send(f.quote.burn(f.c.target,1));return real.pay.estimateGas(...args);};
 const wrapped=new Proxy(reader,{get(t,k){if(k==='connect')return ()=>({pull:real.pull,pay});return Reflect.get(t,k);}});
 const nonce=await f.provider.getTransactionCount(await f.keeper.getAddress());
 const r=await runInfinityWorker({...f.options,collector:wrapped});
 assert.equal(estimates,1);assert.equal(r.status,'error');assert.match(r.error.message,/Collector balance deficit/);
 assert.deepEqual(r.steps,[]);assert.deepEqual(r.failures,[]);assert(!fs.existsSync(f.options.statePath));
 assert.equal(await f.provider.getTransactionCount(await f.keeper.getAddress()),nonce);
 assert.equal(await f.c.credit(await f.other.getAddress()),20n);assert.equal(await f.c.accounted(),20n);
 assert.equal(await f.quote.balanceOf(f.c.target),19n);
});
test('Infinity worker CLI rejects public RPC and duplicate arguments before signing',()=>{
 const {spawnSync}=require('node:child_process');
 for(const args of [['--job','unused','--state','unused','--rpc','https://pair.fund'],['--job','a','--job','b']]){
  const r=spawnSync(process.execPath,['scripts/run-infinity-worker.cjs',...args],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(JSON.parse(r.stderr.trim()).status,'error');
 }
});
