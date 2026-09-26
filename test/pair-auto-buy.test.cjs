const test=require('node:test'),assert=require('node:assert/strict');
const {id,AbiCoder,keccak256}=require('ethers');
const AUTO=require('../scripts/pair-auto-buy.cjs');
const {decodeTransaction,validateManifest,routeDependencies,replay,hash,REGISTER_ABI,TRANSFER_ABI,SWAP_ABI}=require('../scripts/direct-buy.cjs');
const {extend,adapterId,initialAdapters}=require('../scripts/buy-policy-format.cjs');
const e=require('../research/pair-auto/fork-buy-2026-09-25.json');
const sample=e.auto.cases[1],copy=x=>structuredClone(x),coder=AbiCoder.defaultAbiCoder();
function manifest(){return {schema:'direct-buy-v2',routeVersion:'scheduled-routes-v1',chainId:31337,
 token:sample.event.projectToken,quote:AUTO.USDG,router:AUTO.ROUTER,manager:AUTO.MANAGER,hook:AUTO.HOOK,
 registry:'0x0000000000000000000000000000000000000900',codeHashes:{router:e.codeHashes.router},
 quoteDecimals:6,entryThresholdRaw:'100000000',anchor:{number:100,hash:id('synthetic AUTO anchor')},routes:[{id:AUTO.ID,fromBlock:101}]};}
function decode(c=sample,m=manifest()){return decodeTransaction(m,c.transaction,c.receipt);}
function mutated(fn){const c=copy(sample);fn(c);return decode(c);}
function changeCall(c,fn){const p=AUTO.ABI.parseTransaction({data:c.transaction.input}),args=p.args.toArray(true);fn(args);c.transaction.input=AUTO.ABI.encodeFunctionData('buyExactInput',args);}
function changeEvent(c,fn){const l=c.receipt.logs.find(l=>l.topics[0]===AUTO.ABI.getEvent('AggregatedBuy').topicHash);const a=AUTO.ABI.parseLog(l).args.toArray();fn(a);Object.assign(l,AUTO.ABI.encodeEventLog('AggregatedBuy',a));}
test('real AUTO fork registration/admission/full scan saved history replays two purchases with 3 USDG carry',()=>{
 const f=require('../research/pair-auto/fork-admission-2026-09-25.json'),i=f.auto.integration;
 assert.equal(f.stage,'complete');assert.equal(f.error,undefined);assert.equal(i.policyStatus.mode,'admitted');
 const ledger=replay(i.raw.manifest,i.raw.blocks);assert.equal(hash(ledger),i.ledgerHash);assert.equal(ledger.decisions.length,2);
 assert(ledger.decisions.every(d=>d.status==='ELIGIBLE'));assert.equal(ledger.wallets[0].carryRaw,'3000000');assert.equal(ledger.wallets[0].entriesMinted,'0');
 // Recorded admission is historical test evidence, not fresh verification of public finality.
});
test('AUTO raw fork receipts produce one purchase and gross USDG exactly once for one/two legs',()=>{
 const m=manifest();validateManifest(m);assert.deepEqual(initialAdapters(m),[adapterId(AUTO.ID)]);
 for(const c of e.auto.cases){const ds=decode(c,m);assert.equal(ds.length,1);const d=ds[0];assert.equal(d.status,'ELIGIBLE');assert.equal(d.grossQuoteRaw,c.spent);assert.equal(d.poolIds.length,c.legs);assert.equal(d.payer,c.transaction.from);assert.equal(new Set(d.evidenceLogIndexes).size,d.evidenceLogIndexes.length);}
 const before=copy(m);before.routes[0].fromBlock=Number(BigInt(sample.transaction.blockNumber))+1;assert.deepEqual(decode(sample,before),[]);
 assert.deepEqual(routeDependencies(m,100),[]);assert.equal(routeDependencies(m,101).at(-1).codeHash,AUTO.CODE_HASH);
});
test('AUTO fails closed on wrappers, recipients, wrong funding and noncanonical calls',()=>{
 for(const fn of [
  c=>c.transaction.input+='00',c=>c.transaction.input='0x1234',c=>c.transaction.value='0x1',c=>c.receipt.status='0x0',
  c=>changeCall(c,a=>a[1]=AUTO.ROUTER),c=>changeCall(c,a=>a[2]=AUTO.ROUTER),c=>changeCall(c,a=>a[0]=AUTO.ROUTER),
  c=>changeCall(c,a=>a[3].push(copy(a[3][0]))),c=>changeCall(c,a=>a[3][1][0]=a[3][0][0]),
  c=>changeCall(c,a=>a[3][0][1][4]=AUTO.ROUTER),c=>changeCall(c,a=>a[3][0][2]+=1n),
  c=>changeCall(c,a=>a[4]=BigInt(sample.received)+1n),c=>changeEvent(c,a=>a[4]+=1n),c=>changeEvent(c,a=>a[2]=AUTO.ROUTER)
 ]){assert.notEqual(mutated(fn)[0]?.status,'ELIGIBLE');}
 const wrapped=copy(sample);wrapped.transaction.to=AUTO.ROUTER;assert.deepEqual(decode(wrapped),[]);
 for(const key of ['hook','quote','manager','router']){const m=manifest();m[key]=m.registry;assert.throws(()=>validateManifest(m),/AUTO profile/);}
});
test('AUTO rejects missing/extra/misattributed transfers, swap mismatches and duplicate purchase events',()=>{
 const transferTopic=TRANSFER_ABI.getEvent('Transfer').topicHash,swapTopic=SWAP_ABI.getEvent('Swap').topicHash;
 for(const fn of [
  c=>c.receipt.logs.splice(c.receipt.logs.findIndex(l=>l.topics[0]===transferTopic),1),
  c=>c.receipt.logs.push(copy(c.receipt.logs.find(l=>l.topics[0]===transferTopic))),
  c=>c.receipt.logs.push(copy(c.receipt.logs.find(l=>l.topics[0]===AUTO.ABI.getEvent('AggregatedBuy').topicHash))),
  c=>{const l=c.receipt.logs.find(l=>l.topics[0]===transferTopic);l.topics[1]='0x'+'0'.repeat(24)+AUTO.ROUTER.slice(2);},
  c=>{const l=c.receipt.logs.find(l=>l.topics[0]===swapTopic&&l.address===AUTO.MANAGER);l.topics[1]=id('wrong pool');},
  c=>c.receipt.logs.reverse()
 ])assert.notEqual(mutated(fn)[0]?.status,'ELIGIBLE');
});
// Explicit synthetic registration and block placement over unchanged saved AUTO calls/log data.
function branch(count=50){const m=manifest(),blocks=[];let parent=m.anchor.hash;
 function append(c){const n=101+blocks.length,bh=id('synthetic AUTO block '+n),th=id('synthetic AUTO tx '+n),tag='0x'+n.toString(16);
  c.transaction={...c.transaction,chainId:'0x7a69',hash:th,blockHash:bh,blockNumber:tag,transactionIndex:'0x0'};
  c.receipt={...c.receipt,from:c.transaction.from,to:c.transaction.to,transactionHash:th,blockHash:bh,blockNumber:tag,transactionIndex:'0x0',logs:c.receipt.logs.map((l,i)=>({...l,transactionHash:th,blockHash:bh,blockNumber:tag,transactionIndex:'0x0',logIndex:'0x'+i.toString(16),removed:false}))};
  blocks.push({number:tag,hash:bh,parentHash:parent,timestamp:'0x1234',transactions:[{tx:c.transaction,receipt:c.receipt}]});parent=bh;
 }
 const reg=copy(sample);reg.transaction.to=null;reg.receipt.contractAddress=m.registry;reg.receipt.logs=[{address:m.registry,...REGISTER_ABI.encodeEventLog('Registered',[sample.transaction.from])}];append(reg);
 for(let i=0;i<count;i++){const c=copy(sample);c.receipt.contractAddress=null;append(c);}
 return {m,blocks};
}
test('AUTO replay registration, carry, duplicate delivery and provenance; 50 split buys mint one entry',()=>{
 const {m,blocks}=branch();const ledger=replay(m,blocks);assert.equal(ledger.decisions.length,50);assert.equal(ledger.wallets[0].entriesMinted,'1');assert.equal(ledger.wallets[0].carryRaw,'0');
 const dup=copy(blocks);dup[1].transactions[0].receipt.logs.push(copy(dup[1].transactions[0].receipt.logs[0]));dup.push(copy(dup.at(-1)));assert.equal(hash(replay(m,dup)),hash(ledger));
 const missing=copy(blocks);missing[0].transactions[0].receipt.logs=[];assert.equal(replay(m,missing).wallets.length,0);
 const bad=copy(blocks);bad[1].transactions[0].receipt.logs[0].blockHash=id('wrong branch');assert.throws(()=>replay(m,bad),/provenance/);
});
test('registration inside a purchase after payment cannot retroactively qualify AUTO',()=>{
 const {m,blocks}=branch(1);const reg=blocks[0].transactions[0].receipt.logs[0];
 blocks[0].transactions[0].receipt.logs=[];
 const r=blocks[1].transactions[0].receipt;
 r.logs.splice(1,0,{...copy(reg),blockHash:r.blockHash,blockNumber:r.blockNumber,transactionHash:r.transactionHash});
 r.logs.forEach((l,i)=>l.logIndex='0x'+i.toString(16));
 const ledger=replay(m,blocks);assert.equal(ledger.decisions.length,1);assert.equal(ledger.decisions[0].reason,'NOT_REGISTERED_AT_SWAP');assert.equal(ledger.wallets.length,0);
});
test('typed AUTO extension keeps previous direct manifest and old cutoff unchanged',()=>{
 // Hypothetical direct USDG pool only for policy shape testing; no deployed pool assertion.
 const m=manifest(),key=[m.token,m.quote].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));
 m.poolKey=[...key,10000,200,m.hook];m.poolId=keccak256(coder.encode(['address','address','uint24','int24','address'],m.poolKey));m.routes=[{id:'rh-ur-10-060b0e-v1',fromBlock:0}];
 const before=hash(m),next=extend(m,adapterId(AUTO.ID),110,105);assert.equal(hash(m),before);
 const {buyPolicyHistory}=require('../scripts/direct-buy.cjs');const h=buyPolicyHistory({schema:'buy-policy-history-v1',versions:[{fromBlock:100,manifest:m},{fromBlock:110,announcedAtBlock:105,announcedBlockHash:id('notice'),manifest:next}]});
 assert.equal(hash(h.at(109)),before);assert.equal(h.at(110).routes.at(-1).id,AUTO.ID);assert.deepEqual(routeDependencies(m,110),[]);
 const malformed=manifest();malformed.routes.push({id:'rh-ur-10-060b0e-v1',fromBlock:102});assert.throws(()=>validateManifest(malformed),/pool key/);
});
