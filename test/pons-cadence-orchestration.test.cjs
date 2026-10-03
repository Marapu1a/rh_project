// Real coordinator control flow + durable journals; simulated contracts/RPC/workers.
// Complements, does not replace, the separate real-chain/fork runs.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{ethers}=require('ethers');
function setup(){
 const address=n=>ethers.getAddress('0x'+n.toString(16).padStart(40,'0'));
 const [sender,short,monthly,vault,adapter,collector,escrow]=[1,2,3,4,5,6,7].map(address),blockHash=ethers.id('block'),instanceId=ethers.id('instance');
 const config={schema:'pons-rehearsal-automation-v1',manifest:{anchor:{number:0,hash:blockHash},quote:address(8)},lifecycle:{schema:'attempt-lifecycle-v4',source:short,monthlySource:monthly,vault},collector,escrow,vault,executor:sender,codeHashes:{},maxGasPrice:'10',nativeFloor:'0',gasLimit:'3000000',maxTransactions:2,pollSeconds:10,instanceId,deliveryJob:{adapter,short,monthly},campaignId:'1',recipients:[vault,address(9),address(10)]};
 const codeHash=ethers.keccak256('0x00');for(const k of ['collector','escrow'])config.codeHashes[k]=codeHash;
 for(const k of ['vaultCodeHash','sourceCodeHash','monthlySourceCodeHash'])config.lifecycle[k]=codeHash;config.deliveryJob.adapterCodeHash=codeHash;
 let nonce=0,boundary,unknown=false,remaining=100,price=1n,reward=1n;const sent=[],orders=[],receipts=new Map(),transactions=new Map();
 const provider={send:async()=>({instanceId,forkedNetwork:{chainId:4663}}),getBlock:async()=>({number:1,hash:blockHash}),getCode:async()=> '0x00',getTransactionCount:async()=>nonce,getFeeData:async()=>({gasPrice:price}),getBalance:async()=>100000000n,getTransactionReceipt:async h=>receipts.get(h),getTransaction:async h=>transactions.get(h)};
 const method=(target,action)=>({target,action});
 const contracts=Object.fromEntries([short,monthly,vault,adapter,collector].map(target=>[target,{target,randomProvider:async()=>adapter,filters:{AttemptsConsumed:()=>({})},queryFilter:async()=>[],reward:async()=>reward,connect(){return {claim:method(target,'claim')};}}]));
 async function send(method){
  const request={to:method.target,data:'0x1234',value:0n,gasLimit:100n};
  try{await boundary.preflight(request,method.action);}catch(e){e.stage='estimate';throw e;}
  await boundary.before(request,method.action);
  if(unknown)throw Error('Unknown broadcast outcome');
  const hash=ethers.id('tx'+nonce),tx={hash,nonce:nonce++,from:sender,to:request.to,data:request.data,value:0n};
  await boundary.sent(tx);transactions.set(hash,tx);
  const receipt={hash,status:1,blockNumber:1,blockHash};receipts.set(hash,receipt);sent.push(method.action+':'+method.target);
  await boundary.confirmed(receipt);if(method.action==='claim')reward=0n;return receipt;
 }
 const file=path.resolve('scripts/pons-automation.cjs'),realRequire=createRequire(file);
 const mocks={
  ethers:{ethers:{...ethers,Contract:function(target){return contracts[target];}}},
  './runtime-network.cjs':{withRobinhoodNetwork:async(_,fn)=>fn()},
  './pons-profiles.cjs':{pool:()=>({validate(){}})},
  './compile.cjs':{compile:()=>Object.fromEntries(['RobinhoodShortController','RobinhoodMonthlyController','DualControllerPromoVault','DrandRandomAdapter'].map(k=>[k,{abi:[]}]))},
  './local-receipt.cjs':{sendLocalTransaction:send,withTransactionBoundary:async(b,fn)=>{boundary=b;return fn();}},
  './drand-delivery-worker.cjs':{runDrandDelivery:async()=>({status:'waiting',reason:'noRequests'})},
  './local-promo-scheduler.cjs':{runScheduler:async o=>{
   orders.push(o.kinds);const results={};
   for(let tick=0;tick<16;tick++){
    for(const kind of o.kinds){
     if(o.signal?.aborted)return {status:"stopped",results};
     if(!remaining){results[kind]={status:'waiting',reason:'schedule'};continue;}
     try{await send(method(kind==='SHORT'?short:monthly,'process'));remaining--;results[kind]={status:'progress'};}
     catch(e){if(e.code==='LOCAL_BUDGET_WAIT'){results[kind]={status:'waiting',budget:e.budget};continue;}throw e;}
    }
    if(Object.values(results).every(r=>r.status==='waiting'))return {status:'waiting',results};
   }
   return {status:'yielded',results};
  }},
 };
 const mod={exports:{}};vm.runInThisContext('(function(require,module,exports){'+fs.readFileSync(file,'utf8')+'\n})',{filename:file})(id=>mocks[id]??realRequire(id),mod,mod.exports);
 fs.mkdirSync('.local/logs',{recursive:true});const statePath=path.join(fs.mkdtempSync(path.resolve('.local/logs/pons-orchestration-')),'state.json');
 const options={provider,executor:{provider,getAddress:async()=>sender},config,rpcUrl:'http://127.0.0.1:1',statePath,drain:true};
 return {run:(limit,extra={},hooks={})=>mod.exports.runPonsAutomation({...options,maxTransactions:limit,...extra},hooks),options,sent,orders,short,monthly,vault,blockHash,setUnknown:()=>unknown=true,setRemaining:n=>remaining=n,setPrice:n=>price=n};
}
test('Pons actual coordinator changes 2/8/2 limit on one journal, resumes and alternates lanes',async()=>{
 const f=setup(),stop=new AbortController();
 const stopped=await f.run(2,{signal:stop.signal},{onStep:()=>stop.abort()});
 assert.equal(stopped.status,'stopped');assert.equal(stopped.steps.length,1);assert.equal(stopped.continueImmediately,false);
 const identity=JSON.parse(fs.readFileSync(f.options.statePath)).configHash;
 for(const limit of [2,8,2]){
  const r=await f.run(limit);assert.equal(r.status,'waiting');assert.equal(r.steps.length,limit);assert.equal(r.continueImmediately,true);
  assert.equal(JSON.parse(fs.readFileSync(f.options.statePath)).configHash,identity);
 }
 assert.deepEqual(f.orders[1],['MONTHLY','SHORT']);
 assert(f.sent.some(x=>x.endsWith(f.short)));assert(f.sent.some(x=>x.endsWith(f.monthly)));
 f.setRemaining(0);const idle=await f.run(8);assert.equal(idle.steps.length,0);assert.equal(idle.continueImmediately,false);
 f.setRemaining(10);f.setPrice(11n);const gas=await f.run(8);assert.equal(gas.steps.length,0);assert.equal(gas.continueImmediately,false);
});
test('Pons actual coordinator keeps unknown intent across a changed operational limit',async()=>{
 const f=setup();f.setUnknown();const r=await f.run(2);assert.equal(r.reason,'unknownHash');assert.equal(r.continueImmediately,false);
 const bytes=fs.readFileSync(f.options.statePath);
 const again=await f.run(8);assert.equal(again.reason,'unknownHash');assert.equal(again.steps.length,0);assert.deepEqual(fs.readFileSync(f.options.statePath),bytes);assert.equal(f.sent.length,0);
});
test('Pons actual coordinator prioritizes an existing claim over both frozen lanes',async()=>{
 const f=setup(),{withState}=require('../scripts/local-scheduler-state.cjs');
 const {config,rpcUrl,statePath}=f.options;
 await withState(statePath,{config,rpcUrl,sender:config.executor},async(s,save)=>{s.payouts=[{draw:ethers.id('draw'),winner:config.executor,blockNumber:1,blockHash:f.blockHash}];save(s);});
 const r=await f.run(2);assert.equal(r.steps.length,2);assert.equal(r.steps[0].action,'claim');assert.equal(r.steps[1].action,'process');
 assert.equal(JSON.parse(fs.readFileSync(statePath)).payouts.length,0);
 const next=await f.run(2);assert.equal(next.steps[0].target,f.monthly);
});
