const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./fixtures/pons-indexer.cjs'),{scanWithRpc}=require('../scripts/replay-direct-buy.cjs');
const {replay,hash}=require('../scripts/direct-buy.cjs'),{mapLimit}=require('../scripts/bounded-map.cjs');
const {ethers}=require('ethers');
const {indexOnce}=require('../scripts/persistent-buy-indexer.cjs');
function setup(t){
 const f=fixture(t);const rpc=async(method,params=[])=>{
  if(method==='eth_getBlockReceipts')return structuredClone(f.blocks.find(b=>BigInt(b.number)===BigInt(params[0])).transactions.map(x=>x.receipt));
  return f.rpc(method,params);
 };return {...f,rpc};
}
test('bulk receipts preserve exact evidence and ledger; unrelated block avoids historical venue reads',async t=>{
 const f=setup(t);f.blocks[0].transactions[0].receipt.logs=[];f.blocks[0].transactions[0].tx.to=f.blocks[0].transactions[0].tx.from;f.blocks[0].transactions[0].receipt.to=f.blocks[0].transactions[0].tx.to;
 const old=await scanWithRpc(f.m,f.rpc,12);f.calls.length=0;
 const fast=await scanWithRpc(f.m,f.rpc,12,null,{mode:'pons-block-receipts-v1'});
 assert.deepEqual(fast,old);assert.equal(hash(replay(f.m,fast.blocks)),hash(replay(f.m,old.blocks)));
 assert(!f.calls.some(([m,p])=>m==='eth_call'&&p[1]==='0xb'));assert(!f.calls.some(([m])=>m==='eth_getTransactionReceipt'));
 assert(f.calls.some(([m,p])=>m==='eth_call'&&p[1]==='0xc'));
});
test('bulk receipt omission, duplication and branch substitution fail closed',async t=>{
 for(const mutation of [r=>[],r=>[...r,...r],r=>r.map(x=>({...x,blockHash:ethers.ZeroHash})),r=>r.map(x=>({...x,transactionHash:ethers.ZeroHash}))]){
  const f=setup(t),rpc=async(m,p)=>m==='eth_getBlockReceipts'?mutation(await f.rpc(m,p)):f.rpc(m,p);
  await assert.rejects(scanWithRpc(f.m,rpc,12,null,{mode:'pons-block-receipts-v1'}),/receipt/i);
 }
});
test('candidate binding drift and final checkpoint reorg are still rejected',async t=>{
 const f=setup(t);f.flags.badBinding=true;
 await assert.rejects(scanWithRpc(f.m,f.rpc,12,null,{mode:'pons-block-receipts-v1'}),/binding/);
 f.flags.badBinding=false;let endReads=0;
 const rpc=async(m,p)=>{const v=await f.rpc(m,p);return m==='eth_getBlockByNumber'&&p[0]==='0xc'&&!p[1]&&++endReads===2?{...v,hash:ethers.ZeroHash}:v;};
 await assert.rejects(scanWithRpc(f.m,rpc,12,null,{mode:'pons-block-receipts-v1'}),/Chain changed/);
});
test('fast index restart and reorg preserve ledger; concurrent cache heights follow each request',async t=>{
 const f=setup(t),config={...f.config,indexer:{scanMode:'pons-block-receipts-v1'}};
 const rpc=async(m,p)=>{if(m==='eth_getCode')await new Promise(r=>setTimeout(r,p[1]==='0xb'?8:1));return f.rpc(m,p);};
 const run=()=>indexOnce({config,rpc,statePath:f.statePath});
 await run();const before=f.read().index;
 assert.equal(before.ledger.wallets[0].entriesMinted,'1');
 for(const n of [11,12])for(const field of ['curve','token']){
  const params=[f.m[field],'0x'+n.toString(16)];assert.equal(before.cache[hash({method:'eth_getCode',params})].height,n);
 }
 assert.equal((await run()).metrics.replayedBlocks,0);const afterIdle=f.read().index;
 f.replace();f.flags.badBinding=true;await assert.rejects(run(),/binding/);assert.deepEqual(f.read().index,afterIdle);
 f.flags.badBinding=false;assert.equal((await run()).removedBlocks,1);assert.equal(f.read().index.ledger.wallets[0].entriesMinted,'0');
});
test('bounded work drains in-flight operations on error and keeps output order',async()=>{
 let active=0,peak=0,finished=0;
 await assert.rejects(mapLimit([0,1,2,3,4],2,async n=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,n===0?2:15));active--;finished++;if(n===0)throw Error('read failed');return n;}),/read failed/);
 assert.equal(active,0);assert.equal(peak,2);assert.equal(finished,2);
 assert.deepEqual(await mapLimit([3,2,1],2,async n=>{await new Promise(r=>setTimeout(r,n));return n;}),[3,2,1]);
});
test('paced index reads retry transient errors within a bound, never validation or sends',async()=>{
 const {pacedReads}=require('../scripts/index-read-rpc.cjs');let calls=0;
 const rpc=pacedReads(async()=>{if(++calls<=2)throw Object.assign(Error('unavailable'),{code:'RPC_READ_UNAVAILABLE'});return 'ok';},{intervalMs:1,retryMs:1,retries:2});
 assert.equal(await rpc('eth_chainId'),'ok');assert.equal(calls,3);
 await assert.rejects(rpc('eth_sendRawTransaction',['0x']),/read-only/);assert.equal(calls,3);
 calls=0;await assert.rejects(pacedReads(async()=>{calls++;throw Error('bad proof');},{intervalMs:1,retryMs:1})('eth_call'),/bad proof/);assert.equal(calls,1);
 calls=0;await assert.rejects(pacedReads(async()=>{calls++;throw Object.assign(Error('offline'),{code:'RPC_READ_UNAVAILABLE'});},{intervalMs:1,retryMs:1,retries:2})('eth_call'),/offline/);assert.equal(calls,3);
});
function withHeaders(f){
 let parent=f.m.anchor.hash;
 for(const b of f.blocks){
  Object.assign(b,{parentHash:parent,sha3Uncles:ethers.ZeroHash,miner:ethers.ZeroAddress,stateRoot:ethers.ZeroHash,transactionsRoot:ethers.ZeroHash,receiptsRoot:ethers.ZeroHash,logsBloom:'0x'+(b.transactions.some(x=>x.receipt.logs.length)?'ff':'00').repeat(256),difficulty:'0x0',gasLimit:'0x100000',gasUsed:'0x0',extraData:'0x',mixHash:ethers.ZeroHash,nonce:'0x0000000000000000',baseFeePerGas:'0x1'});
  const keys=['parentHash','sha3Uncles','miner','stateRoot','transactionsRoot','receiptsRoot','logsBloom','difficulty','number','gasLimit','gasUsed','timestamp','extraData','mixHash','nonce','baseFeePerGas'];
  const qs=new Set(['difficulty','number','gasLimit','gasUsed','timestamp','baseFeePerGas']);
  b.hash=ethers.keccak256(ethers.encodeRlp(keys.map(k=>qs.has(k)?BigInt(b[k])===0n?'0x':ethers.toBeHex(BigInt(b[k])):b[k])));parent=b.hash;
  for(const {tx,receipt}of b.transactions){tx.blockHash=receipt.blockHash=b.hash;for(const l of receipt.logs)l.blockHash=b.hash;}
 }
 return f;
}
test('real Robinhood launch header reproduces block hash and contains the launched token',()=>{
 const h=require('./fixtures/pons-live-launch-header.json'),B=require('../scripts/pons-bloom-evidence.cjs');
 assert.equal(ethers.keccak256(B.encodeHeader(h)),'0x000fc74b62d1e6f26533117cbb84085fc799c0855d694e6f8c59ed2588725bc1');
 assert.equal(B.contains(h.logsBloom,'0x6EA39A23AA46E51CA6CD2d1cbc0B5bfb29ECB216'),true);
 assert.equal(B.contains(h.logsBloom,ethers.ZeroAddress),false);
 assert.throws(()=>B.encodeHeader({...h,logsBloom:'0x'+'00'.repeat(256)}),/mismatched/);
 const omitted={...h,transactions:[],ponsOmission:B.encodeHeader(h)};
 assert.throws(()=>require('../scripts/reward-observation.cjs').projectRewards([omitted],'0x6EA39A23AA46E51CA6CD2d1cbc0B5bfb29ECB216'),/potential project event/);
});
test('sparse history preserves lifecycle tickets and reward projection independently',async t=>{
 const f=setup(t);f.blocks.push({number:13,timestamp:13,transactions:[]});withHeaders(f);
 const lifecycle={schema:'attempt-lifecycle-v1',instanceId:ethers.id('bloom lifecycle'),source:'0x'+'8'.repeat(40),sourceCodeHash:ethers.keccak256('0x01')};
 const full=await scanWithRpc(f.m,f.rpc,13,lifecycle),fast=await scanWithRpc(f.m,f.rpc,13,lifecycle,{mode:'pons-bloom-receipts-v1'});
 const {replayAttempts}=require('../scripts/attempt-lifecycle.cjs');
 assert.deepEqual(replayAttempts(f.m,lifecycle,fast.blocks),replayAttempts(f.m,lifecycle,full.blocks));
 assert.equal(replayAttempts(f.m,lifecycle,fast.blocks).wallets[0].SHORT.open,'1');
 const {projectRewards}=require('../scripts/reward-observation.cjs');
 assert.deepEqual(projectRewards(fast.blocks,lifecycle.source),projectRewards(full.blocks,lifecycle.source));
});
test('large candidate block uses complete bulk receipts; reversed RPC order is normalized',async t=>{
 const f=setup(t),b=f.blocks[0],sample=b.transactions[0];
 for(let i=1;i<25;i++){const row=structuredClone(sample),txHash=ethers.id('extra '+i);row.tx.hash=row.receipt.transactionHash=txHash;row.tx.transactionIndex=row.receipt.transactionIndex=i;row.receipt.logs=[];b.transactions.push(row);}
 withHeaders(f);let bulk=0;
 const rpc=async(m,p)=>{const result=await f.rpc(m,p);if(m==='eth_getBlockReceipts'){bulk++;return result.reverse();}return result;};
 const result=await scanWithRpc(f.m,rpc,12,null,{mode:'pons-bloom-receipts-v1'});
 assert.equal(bulk,1);assert.equal(result.blocks[0].transactions.length,25);assert.equal(replay(f.m,result.blocks).wallets[0].entriesMinted,'1');
});
test('hash-bound negative bloom omits unrelated block; positive bloom keeps all receipts and same tickets',async t=>{
 const f=setup(t);f.blocks[0].transactions[0].receipt.logs=[];withHeaders(f);
 const full=await scanWithRpc(f.m,f.rpc,12);let receiptBlocks=[];
 const rpc=async(m,p)=>{if(m==='eth_getBlockReceipts')receiptBlocks.push(p[0]);return f.rpc(m,p);};
 const fast=await scanWithRpc(f.m,rpc,12,null,{mode:'pons-bloom-receipts-v1'});
 assert.deepEqual(receiptBlocks,[]);assert.equal(fast.blocks[0].transactions.length,0);assert(fast.blocks[0].ponsOmission);
 assert.equal(hash(replay(f.m,fast.blocks)),hash(replay(f.m,full.blocks)));
 for(const mutate of [b=>{b.ponsOmission=b.ponsOmission.replace(/00/,'01');},b=>{b.timestamp++;},b=>{b.transactions=[full.blocks[0].transactions[0]];}]){
  const bad=structuredClone(fast.blocks);mutate(bad[0]);assert.throws(()=>replay(f.m,bad));
 }
 const positive={...fast.blocks[1],transactions:[],ponsOmission:require('../scripts/pons-bloom-evidence.cjs').encodeHeader(f.blocks[1])};
 assert.throws(()=>replay(f.m,[fast.blocks[0],positive]),/potential project event/);
 // Independent consumers must reject omission of their own event addresses too.
 assert.throws(()=>require('../scripts/pons-bloom-evidence.cjs').validateOmission(positive,null,[f.m.token]),/potential project event/);
});
test('legacy no-chainId traffic is signature-bound; malformed and wrong-chain traffic fail',async t=>{
 const f=setup(t),row=f.blocks[0].transactions[0];row.receipt.logs=[];
 const wallet=ethers.Wallet.createRandom();
 const raw=await wallet.signTransaction({type:0,chainId:0,nonce:0,gasLimit:21000,gasPrice:1,to:wallet.address,value:0});
 const signed=ethers.Transaction.from(raw);
 Object.assign(row.tx,{type:'0x0',nonce:'0x0',gas:'0x5208',gasPrice:'0x1',value:'0x0',input:'0x',from:wallet.address,to:wallet.address,hash:signed.hash,v:ethers.toQuantity(signed.signature.v),r:signed.signature.r,s:signed.signature.s});delete row.tx.chainId;
 Object.assign(row.receipt,{from:wallet.address,to:wallet.address,transactionHash:signed.hash});
 assert.doesNotThrow(()=>replay(f.m,f.blocks));
 for(const patch of [{type:'0x2'},{v:'0x25'},{chainId:'0x1'},{hash:ethers.ZeroHash},{from:ethers.ZeroAddress}]){
  assert.equal(require('../scripts/transaction-chain.cjs').matchesChain({...row.tx,...patch},4663),false);
 }
 assert.equal(require('../scripts/transaction-chain.cjs').matchesChain({...row.tx,chainId:'0x0'},4663),true);
});
