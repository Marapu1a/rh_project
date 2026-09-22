const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {ethers}=require('ethers'),{hash}=require('../scripts/direct-buy.cjs'),{opsProfile}=require('./fixtures/execution-budget.cjs');
const {refillDomainHash}=require('../scripts/local-native-refill.cjs');
const {stageNativeRefill,recordNativeRefillHash}=require('../scripts/local-native-refill-state.cjs');
const {inspectNativeRefill}=require('../scripts/local-native-refill-inspector.cjs');
async function fixture(t){
 const dir=fs.mkdtempSync(path.resolve('.local/refill-inspect-')),file=path.join(dir,'state.json');
 t.after(()=>{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);});
 const source='0x'+'33'.repeat(20),to='0x'+'11'.repeat(20),vault='0x'+'44'.repeat(20),ops=opsProfile();
 ops.network.reserveGasPrice=ops.settings.maxGasPrice='1';ops.network.safetyBps=10000;ops.network.signerBuffer='0';for(const key of Object.keys(ops.network.gasUnits))ops.network.gasUnits[key]='1';
 const anchor={number:'10',hash:ethers.id('anchor'),timestamp:'1000'};
 const input={ops,source:{kind:'BOOTSTRAP_NATIVE',address:source,minimumBalance:'100',transferGas:'21000'},
  policy:{targets:[{address:to,lowWatermark:'10',target:'10'}],maxPerRefill:'30000',maxPerPeriod:'50000',periodSeconds:'100',cooldownSeconds:'30'},
  protectedAddresses:[vault],anchor,head:anchor,balances:{[source]:'100000',[to]:'0'},gasPrice:'1',committedObligations:[],candidateObligations:[]};
 const configHash=hash({fixture:'inspector'}),expected={configHash,refill:input};
 const initial={schema:'local-scheduler-state-v1',configHash,jobs:{SHORT:[],MONTHLY:[]},nativeRefillHistory:{domainHash:refillDomainHash(input),pending:false,windowStart:'1000',spent:'7',lastAttemptAt:null,lastNonce:null,lastSuccessAt:null}};
 const tx={chainId:'31337',from:source,to,value:'10',nonce:'0',data:'0x',hash:ethers.id('tx'),type:2,gasLimit:'21000',maxFeePerGas:'1',maxPriorityFeePerGas:'0'};
 const prepared=stageNativeRefill(initial,input,'0'),state=recordNativeRefillHash(prepared,tx);
 const receipt={hash:tx.hash,status:1,gasUsed:21000n,gasPrice:1n,blockHash:ethers.id('mined'),blockNumber:11};
 const block={number:11,hash:receipt.blockHash,timestamp:1001};let reads=0;
 const provider={getNetwork:async()=>{reads++;return {chainId:31337n};},getTransactionCount:async()=>0,
  getTransaction:async()=>tx,getTransactionReceipt:async()=>receipt,getBlock:async n=>Number(n)===10?anchor:block};
 // These methods must never be requested by a read-only tool.
 for(const method of ['getSigner','broadcastTransaction','sendTransaction','send'])provider[method]=()=>assert.fail('Forbidden provider method: '+method);
 const write=(s=state)=>fs.writeFileSync(file,JSON.stringify({...s,checksum:hash(s)}));write();
 const snapshot=()=>Object.fromEntries(fs.readdirSync(dir).map(n=>[n,fs.readFileSync(path.join(dir,n),'utf8')]));
 async function inspect(overrides={}){const before=snapshot();const report=await inspectNativeRefill({statePath:file,expected,provider,...overrides});assert.deepEqual(snapshot(),before);return report;}
 return {dir,file,expected,input,initial,prepared,state,tx,receipt,block,provider,write,inspect,snapshot,reads:()=>reads};
}
for(const status of [0,1])test('read-only receipt '+status+' projects actual expense without persisting',async t=>{
 const f=await fixture(t);f.receipt.status=status;const report=await f.inspect();assert.equal(report.status,'recoverableReceipt');assert.equal(report.exitCode,0);
 assert.equal(report.projectedAccounting.actualDebit,String(21000+status*10));assert.equal(report.projectedAccounting.spent,String(21007+status*10));assert.equal(report.projectedAccounting.persisted,false);
 assert(f.snapshot()['state.json'].includes('transactionHash'));
});
test('stale-looking lock is reported, never removed or declared safe from PID',async t=>{
 const f=await fixture(t);fs.writeFileSync(f.file+'.lock','999999');const report=await f.inspect();
 assert.equal(report.status,'recoverableReceipt');assert.equal(report.lock.owner,'999999');assert.equal(report.ownershipUnresolved,true);assert.equal(report.exitCode,1);
 f.provider.getTransactionReceipt=async()=>null;assert.equal((await f.inspect()).exitCode,1);
});
test('hashless intent always requires manual search even with equal nonces or failed RPC',async t=>{
 const f=await fixture(t);f.write(f.prepared);let report=await f.inspect();assert.equal(report.status,'manualTransactionSearchRequired');assert.equal(report.sourceNonce.isRetryProof,false);
 f.provider.getNetwork=async()=>{throw Error('offline');};report=await f.inspect();assert.equal(report.status,'manualTransactionSearchRequired');assert.equal(report.exitCode,1);
});
test('known unmined/unknown hash stays pending; receipt outage leaves evidence untouched',async t=>{
 const f=await fixture(t);f.provider.getTransactionReceipt=async()=>null;assert.equal((await f.inspect()).status,'pendingReceipt');
 f.provider.getTransaction=async()=>null;assert.equal((await f.inspect()).status,'pendingReceipt');
 f.provider.getTransactionReceipt=async()=>{throw Error('offline');};assert.equal((await f.inspect()).status,'rpcUnavailable');
});
test('policy mismatch and durable halt cannot be presented as normal recovery',async t=>{
 const f=await fixture(t);f.tx.maxFeePerGas='2';assert.equal((await f.inspect()).status,'policyMismatch');
 f.write({...f.initial,nativeRefillHalt:{reason:'broadcastPolicyMismatch'}});assert.equal((await f.inspect()).status,'policyMismatch');assert.equal(f.reads(),1);
});
test('config/checksum/history and conflicting RPC identity fail closed',async t=>{
 const f=await fixture(t);assert.equal((await f.inspect({expected:{...f.expected,configHash:hash('wrong')}})).status,'invalidState');assert.equal(f.reads(),0);
 const extra=structuredClone(f.expected);extra.refill.ops.network.feeModel='LOCAL_EIP1559_EXTRA';assert.equal((await f.inspect({expected:extra})).status,'invalidState');
 f.write({...f.state,nativeRefillHistory:{...f.state.nativeRefillHistory,spent:'8'}});assert.equal((await f.inspect()).status,'invalidState');
 f.write();f.receipt.blockHash=ethers.id('wrong');assert.equal((await f.inspect()).status,'evidenceConflict');
 f.receipt.blockHash=f.block.hash;f.tx.value='11';assert.equal((await f.inspect()).status,'evidenceConflict');
 f.tx.value='10';f.provider.getNetwork=async()=>({chainId:1n});assert.equal((await f.inspect()).status,'evidenceConflict');
 f.write();fs.appendFileSync(f.file,'broken');assert.equal((await f.inspect()).status,'invalidState');
});
test('changed journal or lock invalidates inspection snapshot',async t=>{
 for(const change of ['state','lock']){
  const f=await fixture(t);f.provider.getTransactionReceipt=async()=>{
   if(change==='state')f.write({...f.state,otherWriter:true});else fs.writeFileSync(f.file+'.lock','123');return f.receipt;
  };
  const report=await inspectNativeRefill({statePath:f.file,expected:f.expected,provider:f.provider});
  assert.equal(report.status,'snapshotChanged');assert.equal(report.projectedAccounting,undefined);assert.notEqual(report.exitCode,0);
 }
});
test('CLI returns JSON/nonzero for hashless and uses only read RPC methods',async t=>{
 const f=await fixture(t);f.write(f.prepared);const expectedFile=path.join(f.dir,'expected.json');fs.writeFileSync(expectedFile,JSON.stringify(f.expected));
 const methods=[];const server=http.createServer(async(req,res)=>{
  let raw='';for await(const p of req)raw+=p;
  const handle=q=>{methods.push(q.method);assert(['eth_chainId','eth_getTransactionCount'].includes(q.method));return {jsonrpc:'2.0',id:q.id,result:q.method==='eth_chainId'?'0x7a69':'0x0'};};
  const q=JSON.parse(raw);res.setHeader('content-type','application/json');res.end(JSON.stringify(Array.isArray(q)?q.map(handle):handle(q)));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const before=f.snapshot(),execFile=require('node:util').promisify(require('node:child_process').execFile);
 await assert.rejects(()=>execFile(process.execPath,['scripts/inspect-local-native-refill.cjs','--state',f.file,'--expected',expectedFile,'--rpc','http://127.0.0.1:'+server.address().port],{timeout:10000}),e=>{
  assert.equal(e.code,1);assert.equal(JSON.parse(e.stdout).status,'manualTransactionSearchRequired');return true;
 });assert(methods.length>0);assert.deepEqual(f.snapshot(),before);
});

test('idle and other-worker journals do not trigger RPC or imply full readiness',async t=>{
 const f=await fixture(t);f.write(f.initial);const idle=await f.inspect();assert.equal(idle.status,'noPending');assert.equal(idle.exitCode,0);
 f.write({...f.initial,pending:{worker:'draw'}});assert.equal((await f.inspect()).status,'unsupportedPending');assert.equal(f.reads(),0);
});
