const {test}=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {reconcilePending}=require('../scripts/pons-automation.cjs');
const sender='0x1111111111111111111111111111111111111111',target='0x2222222222222222222222222222222222222222';
function fixture(status=1){
 const state={pending:{action:'pull',target,data:'0x1234',value:'0',transactionHash:'0xaa',nonce:7}},r={hash:'0xaa',blockNumber:20,blockHash:'0xbb',status},tx={hash:'0xaa',nonce:7,from:sender,to:target,data:'0x1234',value:0n};
 let saves=0;const p={getTransactionReceipt:async()=>r,getTransaction:async()=>tx,getBlock:async()=>({hash:'0xbb'})};return {state,r,tx,p,save:()=>saves++,saves:()=>saves};
}
test('Pons known success/failure receipts reconcile exactly once without another send',async()=>{
 for(const status of [0,1]){const f=fixture(status);assert.equal(await reconcilePending(f.state,f.save,f.p,sender),null);assert.equal(f.state.pending,undefined);assert.equal(f.state.lastResolved.status,status);assert.equal(f.saves(),1);assert.equal(await reconcilePending(f.state,f.save,f.p,sender),null);assert.equal(f.saves(),1);}
});
test('Pons lost hash remains blocking; no nonce guesses or journal clearing',async()=>{
 const f=fixture();delete f.state.pending.transactionHash;const before=JSON.stringify(f.state);f.p.getTransactionReceipt=()=>{throw Error('must not guess');};assert.equal((await reconcilePending(f.state,f.save,f.p,sender)).reason,'unknownHash');assert.equal(JSON.stringify(f.state),before);assert.equal(f.saves(),0);
});
test('Pons pending receipt survives restart',async()=>{
 const f=fixture();f.p.getTransactionReceipt=async()=>null;assert.equal((await reconcilePending(f.state,f.save,f.p,sender)).reason,'pendingReceipt');assert(f.state.pending);assert.equal(f.saves(),0);
});
test('Pons rejects receipt reorg, target/data/value/nonce/sender substitution',async()=>{
 for(const change of [f=>f.r.blockHash='0xcc',f=>f.tx.to=sender,f=>f.tx.from=target,f=>f.tx.data='0x5678',f=>f.tx.value=1n,f=>f.tx.nonce=8,f=>f.r.hash='0xcc',f=>f.r.status=2]){const f=fixture();change(f);assert.equal((await reconcilePending(f.state,f.save,f.p,sender)).reason,'unconfirmedReceipt');assert(f.state.pending);assert.equal(f.saves(),0);}
});
test('Pons CLI refuses public RPC before reading config or accessing a signer',()=>{
 assert.throws(()=>execFileSync(process.execPath,['scripts/run-pons-automation.cjs','--config','missing.json','--state','unused.json','--rpc','https://rpc.mainnet.chain.robinhood.com'],{stdio:'pipe'}),e=>String(e.stderr).includes('Loopback HTTP only'));
});
test('Pons unadmitted scheduler switch is unavailable outside verified rehearsal context',()=>{
 assert.throws(()=>require('../scripts/local-promo-scheduler.cjs').validateConfig({schema:'local-promo-scheduler-v1',cutoffMode:'LOCAL_HEAD',ponsRehearsal:true,manifest:{schema:'direct-buy-pons-v2'}},'http://127.0.0.1:8545'),/identified local rehearsal/);
});
