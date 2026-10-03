const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{ethers:E}=require('ethers');
const {hash}=require('../scripts/direct-buy.cjs'),{create}=require('../scripts/deployment-signing-queue.cjs');
function fixture(t,allowSend=true){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'signing-queue-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const governor='0x0000000000000000000000000000000000000011',txHash=E.id('transaction'),blockHash=E.id('block');
 const body={schema:'qianqi-construction-prefix-v1',authorizationToSend:false,governor,transactions:Array.from({length:6},(_,i)=>({label:'deploy',predictedAddress:E.getCreateAddress({from:governor,nonce:i}),expectedRuntimeHash:E.keccak256('0x01'),request:{from:governor,chainId:'0x1237',nonce:E.toQuantity(i),value:'0x0',data:'0x1234'}}))};
 body.maxGasPrice='10000000000';
 body.chainId=4663;body.startNonce=0;
 const plan={...body,planHash:hash(body)},state={nonce:0,mined:false,data:'0x1234',blockHash};
 const provider={getNetwork:async()=>({chainId:4663n}),getTransactionCount:async()=>state.nonce,getCode:async(a,b)=>b?'0x01':'0x',estimateGas:async()=>100n,getFeeData:async()=>({gasPrice:1n}),getBalance:async()=>1000000n,getTransaction:async()=>({from:governor,to:null,chainId:4663n,nonce:0,data:state.data,value:0n}),getTransactionReceipt:async()=>state.mined?{status:1,blockNumber:1,blockHash,contractAddress:plan.transactions[0].predictedAddress}:null,getBlock:async()=>({hash:state.blockHash})};
 const options={plan,file:path.join(dir,'journal.json'),provider,check:async()=>{},allowSend};return {queue:create(options),options,state,txHash};
}
test('review-only queue cannot arm or create a pending send',async t=>{
 const f=fixture(t,false),p=await f.queue.prepare();await assert.rejects(f.queue.arm(p.id),/disabled/);assert.equal(fs.existsSync(f.options.file),false);
});
test('intent persists before wallet call; restart cannot duplicate an unknown send',async t=>{
 const f=fixture(t),p=await f.queue.prepare();await f.queue.arm(p.id);
 const resumed=create(f.options);await assert.rejects(resumed.prepare(),/Unresolved/);
 f.state.data='0xdead';await assert.rejects(resumed.submitted(f.txHash));
 assert.equal(JSON.parse(fs.readFileSync(f.options.file)).pending.hash,null);
 f.state.data='0x1234';await resumed.submitted(f.txHash);
 f.state.mined=true;f.state.nonce=1;assert.equal((await resumed.refresh()).completed,1);
 f.state.blockHash=E.id('reorg');await assert.rejects(resumed.prepare(),/reorg/);
});
test('nonce drift and concurrent arms cannot send the same step twice',async t=>{
 const f=fixture(t),p=await f.queue.prepare();f.state.nonce=1;await assert.rejects(f.queue.arm(p.id),/Nonce/);
 f.state.nonce=0;const results=await Promise.allSettled([f.queue.arm(p.id),f.queue.arm(p.id)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('deployment runtime permits only compiler-marked creation time and checks receipt timestamp',()=>{
 const {runtimeMatches}=require('../scripts/deployment-signing-queue.cjs');
 const original='0xaa'+E.toBeHex(100,32).slice(2)+'bb',actual='0xaa'+E.toBeHex(200,32).slice(2)+'bb';
 const step={expectedRuntimeHash:E.keccak256(original),timestampLayout:{byteLength:34,rehearsalTimestamp:'100',references:[{start:1,length:32}]}};
 assert(runtimeMatches(actual,step,200));assert.throws(()=>runtimeMatches(actual,step,201));
 assert.equal(runtimeMatches(actual.slice(0,-2)+'cc',step,200),false);
});
test('gas above configured ceiling does not create a wallet intent',async t=>{
 const f=fixture(t);f.options.provider.getFeeData=async()=>({gasPrice:10000000001n});await assert.rejects(f.queue.prepare(),/ceiling/);assert.equal(fs.existsSync(f.options.file),false);
});
