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

const {scanPayouts}=require('../scripts/pons-payout-scan.cjs');
function payoutFixture(){
 const {ethers}=require('ethers'),block=n=>({number:n,hash:ethers.id('block '+n)}),calls=[],state={},saved=[];
 const winner=sender,draw=ethers.id('draw'),resultHash=ethers.id('result');
 const event={blockNumber:12,blockHash:block(12).hash,args:{drawId:draw,resultHash}};
 const source=kind=>({filters:{AttemptsConsumed:()=>kind},queryFilter:async(k,from,to)=>{assert(to-from<10);calls.push([k,from,to]);return from<=12&&to>=12?[event,event]:[];},shortResult:async(id,at)=>{assert.equal(at.blockTag,20);return {resultHash,winners:[winner,winner,ethers.ZeroAddress]};},month:async(id,at)=>{assert.equal(at.blockTag,20);return {resultHash,winner};}});
 const f={provider:{getBlock:async n=>block(n==='latest'?25:n)},short:source(0),monthly:source(1),state,save:s=>saved.push(structuredClone(s)),anchor:block(0),calls,saved,event,block};return f;
}
test('payout scan pages both controllers, pins results, deduplicates and resumes without rescanning',async()=>{
 const f=payoutFixture();await scanPayouts(f);assert.equal(f.state.cursor.number,25);assert.equal(f.state.payouts.length,1);assert.equal(f.saved.length,3);
 assert.deepEqual(f.calls,[[0,1,10],[1,1,10],[0,11,20],[1,11,20],[0,21,25],[1,21,25]]);
 f.calls.length=0;await scanPayouts(f);assert.deepEqual(f.calls,[]);
});
test('failed second source preserves completed page only; retry starts at failed page',async()=>{
 const f=payoutFixture(),read=f.monthly.queryFilter;f.monthly.queryFilter=async(k,a,b)=>{if(a===11)throw Error('RPC down');return read(k,a,b);};
 await assert.rejects(scanPayouts(f),/RPC down/);assert.equal(f.state.cursor.number,10);assert.equal(f.state.payouts.length,0);assert.equal(f.saved.length,1);
 f.state=structuredClone(f.saved.at(-1));f.monthly.queryFilter=read;f.calls.length=0;await scanPayouts(f);assert.equal(f.calls[0][1],11);assert.equal(f.state.payouts.length,1);
});
test('payout page reorg, removed/out-of-window log and result drift never advance failed page',async()=>{
 for(const mode of ['end','start','removed','range','result']){
  const f=payoutFixture(),read=f.monthly.queryFilter;
  f.monthly.queryFilter=async(k,a,b)=>{const events=await read(k,a,b);if(a===11){if(['start','end'].includes(mode)){const n=mode==='start'?10:20,old=f.provider.getBlock;f.provider.getBlock=async x=>x===n?{number:n,hash:'changed'}:old(x);}if(mode==='removed')f.event.removed=true;if(mode==='range')f.event.blockNumber=99;}return events;};
  if(mode==='result')f.monthly.month=async()=>({resultHash:'wrong',winner:sender});
  await assert.rejects(scanPayouts(f));assert.equal(f.state.cursor.number,10);assert.equal(f.state.payouts.length,0);assert.equal(f.saved.length,1);
 }
});
test('payout scan bounds catch-up to 1000 blocks and cancellation retains saved cursor',async()=>{
 const f=payoutFixture();f.provider.getBlock=async n=>f.block(n==='latest'?5000:n);f.short.queryFilter=f.monthly.queryFilter=async(k,a,b)=>{assert(b-a<10);return [];};
 await scanPayouts(f);assert.equal(f.state.cursor.number,1000);assert.equal(f.saved.length,100);
 await assert.rejects(scanPayouts({...f,signal:{aborted:true}}),/stopped/);assert.equal(f.saved.length,100);
});
test('payout anchor/cursor reorg is rejected even with no newer blocks',async()=>{
 const f=payoutFixture();f.state.cursor={number:25,hash:'bad'};await assert.rejects(scanPayouts(f),/cursor reorg/);assert.equal(f.saved.length,0);assert.equal(f.calls.length,0);
});
