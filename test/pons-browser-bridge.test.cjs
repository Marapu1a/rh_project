const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {createBridge}=require('../scripts/pons-browser-bridge.cjs');
const account='0x'+'1'.repeat(40),to='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64);
function fixture(t){
 const journal='.local/logs/bridge-'+crypto.randomUUID()+'.json';fs.mkdirSync('.local/logs',{recursive:true});t.after(()=>{if(fs.existsSync(journal))fs.unlinkSync(journal);});
 let sends=0;const state={identity:{account,chainId:'0x1237'},canonical:blockHash,failSend:false,pending:false};
 const tx={hash,from:account,to,input:'0x1234',value:'0x0',chainId:'0x1237',blockHash,blockNumber:'0x1'};
 const receipt={transactionHash:hash,from:account,to,blockHash,blockNumber:'0x1',status:'0x1'};
 const rpc=async(method)=>{switch(method){case 'eth_chainId':return '0x1237';case 'hardhat_metadata':return {chainId:4663,instanceId:'local'};case 'eth_getBlockByNumber':return {hash:state.canonical};case 'eth_call':return '0x';case 'eth_sendTransaction':sends++;if(state.failSend)throw Error('lost response');return hash;case 'eth_getTransactionReceipt':return state.pending?null:receipt;case 'eth_getTransactionByHash':return tx;default:throw Error(method);}};
 const prepare=async({amountRaw})=>({kind:'buy',venue:'pool',amountRaw,quoteOut:'1000',minimumOut:'990',expiresAt:Math.floor(Date.now()/1000)+1200,snapshot:{number:1,hash:blockHash},request:{method:'eth_sendTransaction',params:[{from:account,to,data:'0x1234',value:'0x0',chainId:'0x1237'}]}});
 const options={rpc,prepare,instanceId:'local',manifest:{},account,journal,identity:async()=>state.identity};
 return {bridge:createBridge(options),options,state,tx,receipt,sends:()=>sends};
}
test('exact retained payload; duplicate ID and recovered journal never resend',async t=>{
 const f=fixture(t),p=await f.bridge.prepare({amountRaw:'101000000'});assert.equal(await f.bridge.send(p),hash);assert.equal(await f.bridge.send(p),hash);assert.equal(f.sends(),1);
 const restored=createBridge(f.options);assert.equal((await restored.recover()).hash,hash);await assert.rejects(restored.prepare({amountRaw:'1'}),/Unresolved/);
 assert.equal((await restored.receipt(hash)).status,'success');assert.equal(await restored.send(p),hash);assert.equal(f.sends(),1);
});
test('calldata/amount tampering and account/network changes fail before sending',async t=>{
 const f=fixture(t),p=await f.bridge.prepare({amountRaw:'101000000'});
 const altered=structuredClone(p);altered.request.params[0].data='0xabcd';await assert.rejects(f.bridge.send(altered),/Changed request/);
 await assert.rejects(f.bridge.send({...p,amountRaw:'1'}),/Changed request/);
 f.state.identity={account:to,chainId:'0x1237'};await assert.rejects(f.bridge.send(p),/Account changed/);
 f.state.identity={account,chainId:'0x1'};await assert.rejects(f.bridge.send(p),/Chain changed/);assert.equal(f.sends(),0);
});
test('unknown submission is durable and never resubmitted after restart',async t=>{
 const f=fixture(t),p=await f.bridge.prepare({amountRaw:'101000000'});f.state.failSend=true;await assert.rejects(f.bridge.send(p),/lost response/);
 const restored=createBridge(f.options);assert.equal((await restored.recover()).hash,null);await assert.rejects(restored.send(p),/never resend/);assert.equal(f.sends(),1);
});
test('receipt validates exact payload and canonical block; failed checks retain pending',async t=>{
 const f=fixture(t),p=await f.bridge.prepare({amountRaw:'101000000'});await f.bridge.send(p);
 f.state.pending=true;assert.equal(await f.bridge.receipt(hash),null);f.state.pending=false;
 f.state.canonical='0x'+'c'.repeat(64);await assert.rejects(f.bridge.receipt(hash),/Noncanonical/);assert.equal((await f.bridge.recover()).hash,hash);
 f.state.canonical=blockHash;f.tx.input='0xabcd';await assert.rejects(f.bridge.receipt(hash),/calldata/);f.tx.input='0x1234';f.receipt.status='0x0';assert.equal((await f.bridge.receipt(hash)).status,'reverted');
});
test('quote reorg and wrong local instance stop before send',async t=>{
 const f=fixture(t),p=await f.bridge.prepare({amountRaw:'101000000'});f.state.canonical='0x'+'c'.repeat(64);await assert.rejects(f.bridge.send(p),/Quote reorg/);assert.equal(f.sends(),0);
 const bad=createBridge({...f.options,instanceId:'other'});await assert.rejects(bad.prepare({amountRaw:'1'}),/instance mismatch/);
});
