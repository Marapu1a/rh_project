const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {ethers}=require('ethers'),P=require('../scripts/pons-curve-buy.cjs'),D=require('../scripts/direct-buy.cjs');
const {indexOnce}=require('../scripts/persistent-buy-indexer.cjs');
const {fixture}=require('./fixtures/pons-indexer.cjs');

test('incremental scan processes only appended blocks; idle and engine upgrade remain explicit',async t=>{
 const f=fixture(t);await f.run();
 for(let n=13;n<=112;n++)f.blocks.push({number:n,hash:ethers.id('empty'+n),parentHash:f.blocks.at(-1).hash,timestamp:n,transactions:[]});
 const catchup=await f.run();assert.equal(catchup.metrics.scannedBlocks,100);assert.equal(catchup.metrics.replayedBlocks,100);assert.equal(catchup.metrics.replayMode,'checkpoint');
 f.calls.length=0;const idle=await f.run();assert.equal(idle.metrics.scannedBlocks,0);assert.equal(idle.metrics.replayedBlocks,0);assert(!f.calls.some(([m,p])=>m==='eth_getBlockByNumber'&&p[1]));
 const n=113;f.blocks.push({number:n,hash:ethers.id('empty'+n),parentHash:f.blocks.at(-1).hash,timestamp:n,transactions:[]});
 f.calls.length=0;const appended=await f.run();assert.equal(appended.metrics.scannedBlocks,1);assert.equal(f.calls.filter(([m,p])=>m==='eth_getBlockByNumber'&&p[1]).length,1);
 const state=f.read();state.index.replayRevision='old-engine';delete state.checksum;state.checksum=D.hash(state);fs.writeFileSync(f.statePath,JSON.stringify(state));
 const upgrade=await f.run();assert.equal(upgrade.metrics.scannedBlocks,0);assert.equal(upgrade.metrics.replayedBlocks,103);assert.equal((await f.run()).metrics.replayedBlocks,0);
 assert.equal(f.read().index.ledgerHash,D.hash(D.replay(f.m,f.blocks)));
});

test('Pons60+40 persists in bounded batches; restart performs no historical bindings or receipts reads',async t=>{
 const f=fixture(t);assert.equal((await f.run({batchSize:1})).state,'catchingUp');assert.equal(f.read().index.ledger.wallets[0].carryRaw,'60000000');await f.run({batchSize:1});assert.equal(f.read().index.ledger.wallets[0].entriesMinted,'1');
 f.calls.length=0;await f.run();assert(!f.calls.some(([m])=>['eth_call','eth_getCode','eth_getTransactionReceipt'].includes(m)));assert.equal(f.read().index.ledgerHash,D.hash(D.replay(f.m,f.blocks)));
});
test('reorg evicts Pons binding cache, rejects substituted curve and preserves prior ledger',async t=>{
 const f=fixture(t);await f.run();const before=f.read().index;f.replace();f.flags.badBinding=true;f.calls.length=0;
 await assert.rejects(f.run(),/binding mismatch/);assert(f.calls.some(([m,p])=>m==='eth_call'&&p[1]==='0xc'));assert.deepEqual(f.read().index,before);
 f.flags.badBinding=false;const status=await f.run();assert.equal(status.removedBlocks,1);assert.equal(f.read().index.ledger.wallets[0].entriesMinted,'0');assert.equal(f.read().index.ledger.wallets[0].carryRaw,'60000000');
});
test('Pons outage and excessive rollback retain state; consumer admission is not silently enabled',async t=>{
 const f=fixture(t);await f.run();const before=f.read().index;f.flags.outage=true;await assert.rejects(f.run(),/offline/);assert.deepEqual(f.read().index,before);f.flags.outage=false;await f.run();
 const resumed=f.read().index;f.replace();await assert.rejects(f.run({reorgLimit:0}),/Reorg exceeds/);assert.deepEqual(f.read().index,resumed);assert.equal(f.read().index.policyStatus.mode,'unadmitted');
});

test('bounded RPC cache preserves all evidence and tickets across restart and cache-miss reorg',async t=>{
 const f=fixture(t);await f.run();
 for(let n=13;n<=22;n++)f.blocks.push({number:n,hash:ethers.id('tail'+n),parentHash:f.blocks.at(-1).hash,timestamp:n,transactions:[]});
 await f.run({reorgLimit:1});const before=f.read().index;
 assert.equal(before.blocks.length,12);assert.equal(before.ledger.wallets[0].entriesMinted,'1');
 assert(Object.values(before.cache).every(r=>r.height>=21&&r.height<=22));
 assert(!Object.values(before.cache).some(r=>r.value?.transactionHash));
 f.calls.length=0;await f.run({reorgLimit:1});
 assert.equal(f.read().index.ledgerHash,before.ledgerHash);
 assert(!f.calls.some(([m,p])=>m==='eth_getTransactionReceipt'||m==='eth_getBlockByNumber'&&p[1]));
 // Increase the rollback limit after pruning. Missing cache must trigger fresh
 // reads, never loss of the preserved canonical prefix or duplicate tickets.
 for(let i=1;i<f.blocks.length;i++){
  const b=f.blocks[i];b.hash=ethers.id('new-branch'+b.number);b.parentHash=f.blocks[i-1].hash;
  if(i===1)b.transactions=[];
 }
 f.calls.length=0;const result=await f.run({reorgLimit:20});
 assert.equal(result.removedBlocks,11);assert(f.calls.some(([m,p])=>m==='eth_call'&&p[1]==='0xc'));
 assert.equal(f.read().index.ledgerHash,D.hash(D.replay(f.m,f.blocks)));
 assert.equal(f.read().index.ledger.wallets[0].entriesMinted,'0');
 assert.equal(f.read().index.ledger.wallets[0].carryRaw,'60000000');
});

test('zero rollback window bounds catch-up cache and leaves the last good snapshot on failure',async t=>{
 const f=fixture(t);await f.run({batchSize:1,reorgLimit:0});
 assert(Object.values(f.read().index.cache).every(r=>r.height===11));
 await f.run({batchSize:1,reorgLimit:0});const before=f.read().index;
 assert(Object.values(before.cache).every(r=>r.height===12));
 assert.equal(before.blocks.length,2);assert.equal(before.ledger.wallets[0].entriesMinted,'1');
 f.flags.outage=true;await assert.rejects(f.run({reorgLimit:0}),/offline/);
 assert.deepEqual(f.read().index,before);f.flags.outage=false;
 await f.run({reorgLimit:0});assert.equal(f.read().index.ledgerHash,before.ledgerHash);
});

test('checkpoint restart extends only suffix; explicit audit and old engine rebuild from evidence',async t=>{
 const f=fixture(t);await f.run({batchSize:1});
 const continued=await f.run();assert.equal(continued.metrics.replayedBlocks,1);assert.equal(continued.metrics.replayMode,'checkpoint');
 const expected=D.hash(D.replay(f.m,f.blocks));assert.equal(f.read().index.ledgerHash,expected);
 assert.match(f.read().checksum,/^sha256-v1:/);
 const audit=await f.run({fullRewardAudit:true});assert.equal(audit.metrics.replayMode,'full');assert.equal(audit.metrics.replayedBlocks,2);
 assert.equal(f.read().index.ledgerHash,expected);
 const s=f.read();delete s.checksum;delete s.index.replayCheckpoint;s.index.replayRevision='pons-pool-batch-range-v1';
 // A legacy disk snapshot is migrated without rebuilding it from RPC.
 fs.writeFileSync(f.statePath,JSON.stringify({...s,checksum:D.hash(s)},null,2));f.calls.length=0;
 const migration=await f.run();assert.equal(migration.metrics.replayMode,'full');assert.equal(migration.metrics.scannedBlocks,0);
 assert(!f.calls.some(([m])=>m==='eth_getTransactionReceipt'));assert.equal(f.read().index.ledgerHash,expected);
 assert.match(f.read().checksum,/^sha256-v1:/);assert.equal((await f.run()).metrics.replayMode,'reused');
 const missing=f.read();delete missing.checksum;delete missing.index.replayCheckpoint;
 fs.writeFileSync(f.statePath,JSON.stringify({...missing,checksum:D.hash(missing)}));
 assert.equal((await f.run()).metrics.replayMode,'full');
 assert.equal((await f.run()).metrics.replayMode,'reused');assert.equal(f.read().index.ledgerHash,expected);
});
