const {test}=require('node:test'),assert=require('node:assert/strict'),{keccak256}=require('ethers');
const {compile}=require('../scripts/compile.cjs');
const {fixture,rpc,sent}=require('./fixtures/dual-controller.cjs');
const {observePublic}=require('../scripts/public-observation.cjs');
test('real local contracts: pinned reserve snapshot, decimals, funding delta and wrong code',async()=>{
 const f=await fixture(compile(),{real:true});
 const code=async a=>keccak256(await rpc('eth_getCode',[a,'latest']));
 const config={lifecycle:{vault:f.vault.target,source:f.short.target,monthlySource:f.monthly.target,vaultCodeHash:await code(f.vault.target),sourceCodeHash:await code(f.short.target),monthlySourceCodeHash:await code(f.monthly.target)}};
 const manifest={quote:f.quote.target,quoteDecimals:Number(await f.quote.decimals()),codeHashes:{quote:await code(f.quote.target)}};
 const head=await rpc('eth_getBlockByNumber',['latest',false]);
 const o=await observePublic({config,manifest,rpc,blockTag:head.number,blockHash:head.hash});
 assert.equal(o.reserves.freeShort,'1000');assert.equal(o.reserves.freeCurrent,'1000');assert.equal(o.reserves.freeNext,'100');assert.equal(o.reserves.balance,'2100');
 assert.equal(o.timing.SHORT.minimumRaw,'15');
 await sent(f.vault.fundUSDG(100,1));
 assert.deepEqual(await observePublic({config,manifest,rpc,blockTag:head.number,blockHash:head.hash}),o,'historical snapshot does not mix in later funding');
 const latest=await rpc('eth_getBlockByNumber',['latest',false]);assert.equal((await observePublic({config,manifest,rpc,blockTag:latest.number,blockHash:latest.hash})).reserves.freeShort,'1100');
 await assert.rejects(()=>observePublic({config,manifest:{...manifest,quoteDecimals:5},rpc,blockTag:head.number,blockHash:head.hash}),/binding/);
 await assert.rejects(()=>observePublic({config,manifest:{...manifest,codeHashes:{quote:keccak256('0x01')}},rpc,blockTag:head.number,blockHash:head.hash}),/runtime/);
});
