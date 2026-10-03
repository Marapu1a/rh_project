const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./fixtures/pons-indexer.cjs');
const D=require('../scripts/direct-buy.cjs');
const {createVerifiedBuyReplay}=require('../scripts/verified-buy-replay.cjs');
test('cached BUY verification preserves independent freeze/consume accounting and rejects bad lifecycle',()=>{
 const {history}=require('./fixtures/attempt-history.cjs'),{createReplayAttempts,replayAttempts}=require('../scripts/attempt-lifecycle.cjs');
 const h=history(),run=createReplayAttempts(),check=()=>assert.deepEqual(run(h.manifest,h.config,h.blocks),replayAttempts(h.manifest,h.config,h.blocks));
 check();const cutoff=h.head();h.buy(300_000000n);check();
 const draw=h.freeze('cached short','SHORT',cutoff,[h.participant(1)]);check();
 h.terminal(draw);check();h.freeze('cached month','MONTHLY',h.head(),[h.participant(4)]);check();
 const last=structuredClone(h.blocks.at(-1));h.blocks.at(-1).transactions[0].receipt.logs[0].data='0x';
 assert.throws(()=>run(h.manifest,h.config,h.blocks));h.blocks[h.blocks.length-1]=last;check();
});
test('private verifier checks cold history, continues carry, reuses idle and isolates returned ledgers',t=>{
 const f=fixture(t),v=createVerifiedBuyReplay();
 assert.deepEqual(v.replay(f.m,f.blocks.slice(0,1)),D.replay(f.m,f.blocks.slice(0,1)));assert.equal(v.metrics().mode,'full');
 const result=v.replay(f.m,f.blocks);assert.deepEqual(result,D.replay(f.m,f.blocks));assert.equal(v.metrics().replayedBlocks,1);
 result.wallets[0].entriesMinted='999';result.decisions.length=0;
 assert.deepEqual(v.replay(f.m,structuredClone(f.blocks)),D.replay(f.m,f.blocks));assert.equal(v.metrics().mode,'reused');
 assert.equal(v.metrics().replayedBlocks,0);
});
test('rollback, policy change and changed old receipt cannot hide behind identical block hashes',t=>{
 const f=fixture(t),v=createVerifiedBuyReplay();v.replay(f.m,f.blocks);
 assert.deepEqual(v.replay(f.m,f.blocks.slice(0,1)),D.replay(f.m,f.blocks.slice(0,1)));assert.equal(v.metrics().mode,'full');
 const changed={...f.m,codeHashes:{...f.m.codeHashes,token:require('ethers').id('new runtime')}};
 assert.deepEqual(v.replay(changed,f.blocks),D.replay(changed,f.blocks));assert.equal(v.metrics().mode,'full');
 v.replay(f.m,f.blocks);const altered=structuredClone(f.blocks);altered[0].transactions[0].receipt.transactionHash=require('ethers').ZeroHash;
 assert.throws(()=>v.replay(f.m,altered));assert.deepEqual(v.replay(f.m,f.blocks),D.replay(f.m,f.blocks));assert.equal(v.metrics().mode,'full');
 f.replace();assert.deepEqual(v.replay(f.m,f.blocks),D.replay(f.m,f.blocks));assert.equal(v.metrics().mode,'full');
});
test('invalid appended provenance clears private checkpoint; duplicate delivery retains full replay semantics',t=>{
 const f=fixture(t),v=createVerifiedBuyReplay();v.replay(f.m,f.blocks.slice(0,1));
 const bad=structuredClone(f.blocks);bad[1].transactions[0].receipt.transactionHash=bad[0].transactions[0].tx.hash;
 assert.throws(()=>v.replay(f.m,bad));assert.deepEqual(v.replay(f.m,f.blocks),D.replay(f.m,f.blocks));assert.equal(v.metrics().mode,'full');
 const duplicated=[f.blocks[0],f.blocks[0],f.blocks[1]];assert.deepEqual(v.replay(f.m,duplicated),D.replay(f.m,duplicated));assert.equal(v.metrics().mode,'full');
});
