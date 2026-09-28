const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {fixture,beacon,target,rpc,sent}=require('./fixtures/promo-automation.cjs');
const {runPromoAutomation,MONTHLY_ACTIONS}=require('../scripts/promo-automation.cjs');
const {hash}=require('../scripts/direct-buy.cjs'),{initialAdapters}=require('../scripts/buy-policy-format.cjs');
async function setup(t){
 const f=await fixture(t);const owner=await f.admin.getAddress();
 const p=await f.deploy('BuyPolicySource',[f.config.lifecycle.instanceId,hash(f.config.manifest),owner,2,initialAdapters(f.config.manifest)]);
 f.config.buyPolicy={chainId:31337,source:p.target,sourceCodeHash:ethers.keccak256(await f.provider.getCode(p.target)),publisher:owner,instanceId:f.config.lifecycle.instanceId,genesisHash:hash(f.config.manifest),noticeBlocks:2};
 f.config.cutoffMode='FINALIZED_CHECKPOINT';f.options.ops.schema='local-promo-automation-v1';
 for(const a of [...MONTHLY_ACTIONS,'checkpointCutoff'])f.options.ops.gasUnits[a]='3000000';
 await rpc('evm_setNextBlockTimestamp',[target-4000]);await rpc('evm_mine');return f;
}

test('shared automation budgets and journals checkpoints for both controller targets without duplicate writes',async t=>{
 const f=await setup(t);const result=await runPromoAutomation(f.options,{getBeacon:beacon});
 assert(!['error','blocked'].includes(result.status),JSON.stringify(result));
 assert.equal(result.steps.filter(s=>s.action==='checkpointCutoff').length,2,JSON.stringify(result));
 assert(result.steps.some(s=>s.action==='begin'));assert(result.steps.some(s=>s.action==='beginMonth'));
 assert.equal(f.read().pending,undefined);
 const again=await runPromoAutomation(f.options,{getBeacon:beacon});
 assert.equal(again.steps.filter(s=>s.action==='checkpointCutoff').length,0,JSON.stringify(again));
});

test('unknown checkpoint broadcast blocks the shared signer even when its hash is already on chain',async t=>{
 const f=await setup(t),reader=f.options.short,real=f.short.connect(f.admin);let sends=0;
 const checkpointCutoff=async(...a)=>{sends++;await real.checkpointCutoff(...a);throw Object.assign(Error('checkpoint hash lost'),{code:'ECONNRESET'});};
 for(const k of ['estimateGas','populateTransaction','fragment'])checkpointCutoff[k]=real.checkpointCutoff[k];
 f.options.short=new Proxy(reader,{get(t,k){if(k==='connect')return ()=>new Proxy(real,{get(c,m){return m==='checkpointCutoff'?checkpointCutoff:Reflect.get(c,m);}});return Reflect.get(t,k);}});
 const first=await runPromoAutomation(f.options,{getBeacon:beacon});assert.equal(first.status,'blocked',JSON.stringify(first));
 assert.equal(f.read().pending.action,'checkpointCutoff');assert.equal(f.read().pending.transactionHash,undefined);
 const again=await runPromoAutomation(f.options,{getBeacon:beacon});assert.equal(again.status,'blocked');assert.equal(sends,1);
 assert.equal(await f.short.activeProposal(),ethers.ZeroHash);assert.equal(await f.monthly.activeMonth(),ethers.ZeroHash);
});


test('checkpoint gas bound waits before broadcast without reserving prizes',async t=>{
 const f=await setup(t);f.options.ops.gasUnits.checkpointCutoff='1';
 const result=await runPromoAutomation(f.options,{getBeacon:beacon});
 assert(!['error','blocked'].includes(result.status),JSON.stringify(result));
 assert.equal(result.steps.filter(s=>s.action==='checkpointCutoff').length,0);
 const state=JSON.parse(require('node:fs').readFileSync(f.options.statePath+'.scheduler','utf8'));
 for(const [kind,c] of [['SHORT',f.short],['MONTHLY',f.monthly]]){
  assert.equal(await c.cutoffHashes(state.cutoffs[kind].number),ethers.ZeroHash);assert.equal(state.jobs[kind].length,0);
 }
 assert.equal(f.read().pending,undefined);assert.equal(await f.vault.reserved(f.quote.target),0n);
 assert.match(JSON.stringify(result),/actionGasBound/);
});
