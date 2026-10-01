const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {ethers}=require('ethers'),P=require('../scripts/pons-curve-buy.cjs'),D=require('../scripts/direct-buy.cjs');
const {indexOnce}=require('../scripts/persistent-buy-indexer.cjs');
const {fixture}=require('./fixtures/pons-indexer.cjs');

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
