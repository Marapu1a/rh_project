const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),E=require('ethers');
const {setup,addr}=require('./fixtures/pons-zeroex.cjs'),D=require('../scripts/direct-buy.cjs');
const {indexOnce}=require('../scripts/persistent-buy-indexer.cjs'),API=require('../scripts/user-status-api.cjs');
test('admitted 0x BUY → persistent checkpoint → HTTP tickets; restart, re-inclusion, removal, outage',async t=>{
 const f=setup(t);await f.run();
 const server=API.createServer(f.config);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r));});
 const view=async()=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/v1/wallets/${f.wallet}`);assert.equal(r.status,200);return r.json();};
 let v=await view();assert.equal(v.status,'observed');assert.equal(v.balances.SHORT.open,'1');assert.equal(v.balances.MONTHLY.open,'1');assert.equal(v.balances.carryRaw,'1000000');assert.equal(v.purchases.items[0].routeFeeQuoteRaw,'151500');
 f.calls.length=0;await f.run();assert(!f.calls.some(([m])=>m==='eth_getTransactionReceipt'));assert.deepEqual((await view()).balances,v.balances);
 // Append an empty block to exercise the admitted incremental path.
 f.blocks.push({number:12,hash:E.id('0x appended block'),parentHash:f.block.hash,timestamp:Number(BigInt(f.block.timestamp))+1,transactions:[]});
 const result=await f.run();assert.equal(result.metrics.replayMode,'checkpoint');
 let saved=JSON.parse(fs.readFileSync(f.statePath));assert.deepEqual(saved.index.ledger,D.replay(saved.index.manifest,saved.index.blocks));
 f.block.hash=E.id('0x replacement with same tx');f.blocks[1].parentHash=f.block.hash;f.blocks[1].hash=E.id('0x replacement12');
 for(const o of [f.tx,f.receipt,...f.receipt.logs])o.blockHash=f.block.hash;
 f.calls.length=0;await f.run();assert(f.calls.some(([m])=>m==='eth_getTransactionReceipt'));assert.deepEqual((await view()).balances,v.balances);
 f.block.transactions=[];f.block.hash=E.id('0x removed BUY');f.blocks[1].parentHash=f.block.hash;f.blocks[1].hash=E.id('0x removed12');await f.run();v=await view();assert.equal(v.balances.SHORT.open,'0');assert.equal(v.balances.MONTHLY.open,'0');assert.equal(v.balances.carryRaw,'0');assert.equal(v.purchases.total,0);
 f.flags.outage=true;await assert.rejects(f.run(),/offline/);assert.equal((await view()).status,'stale');f.flags.outage=false;await f.run();assert.equal((await view()).status,'observed');
});
test('unqualified direct-holder candidate is visible as sender observation, never as tickets or beneficiary',async t=>{
 const f=setup(t),Z=require('../scripts/pons-zeroex-buy.cjs');
 const a=Z.HOLDER.decodeFunctionData('exec',f.tx.input).toArray(true),c=Z.SETTLER.decodeFunctionData('execute',a[4]).toArray(true);c[0][0]=addr(999);a[4]=Z.SETTLER.encodeFunctionData('execute',c);f.tx.input=Z.HOLDER.encodeFunctionData('exec',a);
 await f.run();const v=API.walletStatus({config:f.config,wallet:f.wallet});assert.equal(v.status,'observed');assert.equal(v.balances.SHORT.open,'0');assert.equal(v.purchases.total,1);assert.equal(v.purchases.items[0].reason,'ZEROEX_ENVELOPE_NOT_QUALIFIED');assert.equal(v.purchases.items[0].attribution,'transaction-sender-only');assert.equal(v.purchases.items[0].observedSender,f.wallet);
 assert.equal(API.walletStatus({config:f.config,wallet:addr(999)}).purchases.total,0);
});
test('changed Settler runtime and wrong policy commitment cannot admit a snapshot',async t=>{
 const f=setup(t);await f.run();const before=JSON.parse(fs.readFileSync(f.statePath)).index;
 await assert.rejects(indexOnce({config:f.config,statePath:f.statePath+'.bad',rpc:(m,p)=>m==='eth_getCode'&&p[0].toLowerCase()===f.m.zeroexSettler?'0x01':f.rpc(m,p)}),/runtime/);
 fs.unlinkSync(f.statePath+'.bad'); // Fresh state: exercise policy admission, not config-file binding.
 const config=structuredClone(f.config);config.buyPolicy.genesisHash=E.id('wrong commitment');
 await assert.rejects(indexOnce({config,statePath:f.statePath+'.bad',rpc:f.rpc}),/genesis|hash|binding|commitment/i);
 assert.deepEqual(JSON.parse(fs.readFileSync(f.statePath)).index,before);
});
