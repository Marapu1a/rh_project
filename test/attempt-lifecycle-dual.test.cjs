const {test}=require('node:test'),assert=require('node:assert/strict'),{id}=require('ethers');
const {ABI,domainFor,snapshotFor,replayAttempts}=require('../scripts/attempt-lifecycle.cjs');
const {hash}=require('../scripts/direct-buy.cjs');
const {history,addr}=require('./fixtures/attempt-history.cjs');
function fixture(){
  const h=history();Object.assign(h.config,{schema:'attempt-lifecycle-v3',monthlySource:addr(901),monthlySourceCodeHash:id('month code'),
    monthlyInstanceId:id('month instance'),vault:addr(902),vaultCodeHash:id('vault code'),
    shortRules:{rulesHash:id('short rules'),noticeSeconds:'10',startedAt:'0',firstBlock:'0'},
    monthlyPolicy:{rulesHash:id('month rules'),interval:'30',startedAt:'0'}});
  h.run=()=>replayAttempts(h.manifest,h.config,h.blocks);
  h.freezeDual=(name,kind,cutoff=h.head(),ps=[h.participant(1)],source)=>{
    const drawId=id(name),rulesHash=kind==='SHORT'?h.config.shortRules.rulesHash:h.config.monthlyPolicy.rulesHash;
    const snapshot=snapshotFor(domainFor(h.manifest,h.config),drawId,kind,cutoff,rulesHash,ps,1),snapshotHash=hash(snapshot);
    const emitter=source||(kind==='SHORT'?h.config.source:h.config.monthlySource);
    h.append(name,emitter,'0x',[h.log(ABI,'AttemptsFrozen',[drawId,kind==='SHORT'?0:1,cutoff.blockNumber,cutoff.blockHash,rulesHash,snapshotHash],emitter)]);
    return {drawId,kind,snapshotHash};
  };
  h.consume=d=>{const emitter=d.kind==='SHORT'?h.config.source:h.config.monthlySource;
    h.append('consume '+d.drawId,emitter,'0x',[h.log(ABI,'AttemptsConsumed',[d.drawId,d.kind==='SHORT'?0:1,d.snapshotHash,0,id('result')],emitter)]);};
  return h;
}
test('dual replay independently freezes and consumes both sources; new BUY remains open',()=>{
  const h=fixture(),cutoff=h.head(),s=h.freezeDual('short','SHORT',cutoff),m=h.freezeDual('month','MONTHLY',cutoff);
  assert.equal(h.run().pending.MONTHLY,m.drawId);h.buy(100_000000n);h.consume(s);
  let ledger=h.run(),w=ledger.wallets.find(w=>w.wallet===h.wallet);
  assert.equal(ledger.pending.SHORT,null);assert.equal(ledger.pending.MONTHLY,m.drawId);
  assert.equal(w.SHORT.consumedTotal,'1');assert.equal(w.MONTHLY.consumedTotal,'0');
  const before=structuredClone(h.blocks);h.consume(m);ledger=h.run();w=ledger.wallets.find(w=>w.wallet===h.wallet);
  assert.equal(w.MONTHLY.consumedTotal,'1');assert.equal(w.SHORT.open,'1');assert.equal(w.MONTHLY.open,'1');
  assert.equal(ledger.schema,'attempt-ledger-v3');h.blocks.splice(0,h.blocks.length,...before);
  assert.equal(h.run().pending.MONTHLY,m.drawId);
});
test('dual replay rejects wrong capability, global identity reuse and monthly early restart',()=>{
  let h=fixture();h.freezeDual('wrong','MONTHLY',h.head(),[h.participant(1)],h.config.source);
  assert.throws(()=>h.run(),/Wrong source/);
  h=fixture();const cutoff=h.head();h.freezeDual('same','SHORT',cutoff);h.freezeDual('same','MONTHLY',cutoff);
  assert.throws(()=>h.run(),/used|Duplicate|duplicate/);
  h=fixture();const m=h.freezeDual('month','MONTHLY');h.consume(m);h.buy(100_000000n);
  h.freezeDual('too soon','MONTHLY',h.head(),[h.participant(1,2)]);assert.throws(()=>h.run(),/Monthly|monthly/);
});
test('dual domain binds both deployments, immutable policy and vault; no silent v2 downgrade',()=>{
  const h=fixture();h.freezeDual('short','SHORT');h.config.monthlySourceCodeHash=id('replacement');
  assert.throws(()=>h.run(),/snapshot|Snapshot/);
  h.config.schema='attempt-lifecycle-v2';assert.throws(()=>h.run(),/require lifecycle v3/);
});
