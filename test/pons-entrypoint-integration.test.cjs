const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),E=require('ethers');
const source=require('../docs/evidence/PONS_ENTRYPOINT_POOL_BUY_2026-10-02.json'),base=require('./fixtures/pons-zeroex.cjs');
const D=require('../scripts/direct-buy.cjs'),API=require('../scripts/user-status-api.cjs'),{indexOnce}=require('../scripts/persistent-buy-indexer.cjs');
test('AA policy/index/API credits account, not bundler; checkpoint restart and canonical rollback',async t=>{
 const f=base.setup(t,source);await f.run();
 const server=API.createServer(f.config);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r));});
 const view=async wallet=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/v1/wallets/${wallet}`);assert.equal(r.status,200);return r.json();};
 let v=await view(f.wallet);assert.equal(v.balances.SHORT.open,'1');assert.equal(v.balances.MONTHLY.open,'1');assert.equal(v.balances.carryRaw,'1000000');assert.equal(v.purchases.items[0].userOpHash,source.entrypoint.userOpHash);
 const bundler=await view(f.tx.from);assert.equal(bundler.purchases.total,0);assert.equal(bundler.balances.SHORT.open,'0');
 f.calls.length=0;await f.run();assert(!f.calls.some(([method])=>method==='eth_getTransactionReceipt'));assert.deepEqual((await view(f.wallet)).balances,v.balances);
 f.blocks.push({number:12,hash:E.id('AA append'),parentHash:f.block.hash,timestamp:Number(BigInt(f.block.timestamp))+1,transactions:[]});assert.equal((await f.run()).metrics.replayMode,'checkpoint');
 const saved=JSON.parse(fs.readFileSync(f.statePath));assert(saved.index.blocks[0].entrypointAccounts[f.wallet]);assert.deepEqual(saved.index.ledger,D.replay(saved.index.manifest,saved.index.blocks));
 f.block.hash=E.id('AA re-included');for(const o of [f.tx,f.receipt,...f.receipt.logs])o.blockHash=f.block.hash;f.blocks[1].hash=E.id('AA re-included12');f.blocks[1].parentHash=f.block.hash;await f.run();assert.deepEqual((await view(f.wallet)).balances,v.balances);
 f.block.transactions=[];f.block.hash=E.id('AA removed');f.blocks[1].hash=E.id('AA removed12');f.blocks[1].parentHash=f.block.hash;await f.run();v=await view(f.wallet);assert.equal(v.balances.SHORT.open,'0');assert.equal(v.balances.MONTHLY.open,'0');assert.equal(v.purchases.total,0);
});
test('missing account proof remains visible to UserOperation sender without minting or crediting bundler',async t=>{
 const f=base.setup(t,source),rpc=(m,p)=>m==='eth_getCode'&&p[0].toLowerCase()===f.wallet?'0x':f.rpc(m,p);
 await indexOnce({config:f.config,rpc,statePath:f.statePath});const v=API.walletStatus({config:f.config,wallet:f.wallet});assert.equal(v.balances.SHORT.open,'0');assert.equal(v.purchases.items[0].attribution,'user-operation-sender-only');assert.equal(v.purchases.items[0].observedAccount,f.wallet);assert.equal(v.purchases.items[0].reason,'ENTRYPOINT_ACCOUNT_NOT_QUALIFIED');assert.equal(API.walletStatus({config:f.config,wallet:f.tx.from}).purchases.total,0);
});
test('parent read only for target candidate; unavailable target state and runtime drift fail closed',async t=>{
 const f=base.setup(t,source);let reads=0;
 const rpc=async(m,p)=>{if(m==='eth_getCode'&&p[0].toLowerCase()===f.wallet)reads++;return f.rpc(m,p);};
 await indexOnce({config:f.config,rpc,statePath:f.statePath});assert.equal(reads,1);
 const before=JSON.parse(fs.readFileSync(f.statePath)).index;
 await assert.rejects(indexOnce({config:f.config,statePath:f.statePath+'.bad',rpc:(m,p)=>{if(m==='eth_getCode'&&p[0].toLowerCase()===f.wallet)throw Error('account parent unavailable');return f.rpc(m,p);}}),/account parent unavailable/);
 fs.unlinkSync(f.statePath+'.bad');
 await assert.rejects(indexOnce({config:f.config,statePath:f.statePath+'.bad',rpc:(m,p)=>m==='eth_getCode'&&p[0].toLowerCase()===f.m.entryPointAccount?'0x01':f.rpc(m,p)}),/runtime/);assert.deepEqual(JSON.parse(fs.readFileSync(f.statePath)).index,before);
 fs.unlinkSync(f.statePath+'.bad');f.block.transactions[0].receipt.logs=[];reads=0;
 await indexOnce({config:f.config,statePath:f.statePath+'.bad',rpc});assert.equal(reads,0);
});
