const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
require('node:fs').mkdirSync('.local',{recursive:true});
const {fork}=require('node:child_process'),{ethers}=require('ethers');
const {opsProfile}=require('./fixtures/execution-budget.cjs');
const {hash}=require('../scripts/direct-buy.cjs'),{inspectNativeRefill}=require('../scripts/local-native-refill-inspector.cjs');
async function fixture(t){
 const rpc=require('hardhat').network.provider;await rpc.send('hardhat_reset');
 const provider=new ethers.BrowserProvider(rpc,undefined,{cacheTimeout:-1});
 const source=await (await provider.getSigner(0)).getAddress(),target=await (await provider.getSigner(1)).getAddress();
 await rpc.send('hardhat_setBalance',[target,'0x0']);let failReceipts=false,sends=0;
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const part of req)raw+=part;
  const handle=async q=>{try{
   if(q.method==='eth_getTransactionReceipt'&&failReceipts)throw Error('test receipt RPC outage');
   if(q.method==='eth_sendTransaction')sends++;
   return {jsonrpc:'2.0',id:q.id,result:await rpc.send(q.method,q.params)};
  }catch(e){return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:e.message}};}};
  const q=JSON.parse(raw);res.setHeader('content-type','application/json');res.end(JSON.stringify(Array.isArray(q)?await Promise.all(q.map(handle)):await handle(q)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const directory=fs.mkdtempSync(path.resolve('.local/refill-process-')),file=path.join(directory,'state.json'),marker=path.join(directory,'checkpoint.json'),configFile=path.join(directory,'config.json');
 const ops=opsProfile();ops.network.reserveGasPrice=ops.settings.maxGasPrice='10000000000';ops.settings.receiptTimeoutMs=1000;
 const input={ops,source:{kind:'BOOTSTRAP_NATIVE',address:source,minimumBalance:'1000000000000000000',transferGas:'30000'},
  policy:{targets:[{address:target,lowWatermark:'1000000000000000',target:'2000000000000000'}],maxPerRefill:'10000000000000000',maxPerPeriod:'20000000000000000',periodSeconds:'3600',cooldownSeconds:'30'},
  protectedAddresses:['0x'+'44'.repeat(20)],committedObligations:[],candidateObligations:[]};
 fs.writeFileSync(configFile,JSON.stringify({file,marker,input,rpcUrl:'http://127.0.0.1:'+server.address().port}));
 const children=[];
 function launch(mode='normal'){
  const child=fork(path.resolve('test/fixtures/refill-process-child.cjs'),[configFile,mode],{silent:true,windowsHide:true});children.push(child);
  let output='',errors='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>errors+=d);
  const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal,output,errors}));});
  return {child,done};
 }
 async function run(){const {done}=launch();const result=await done;assert.equal(result.errors,'');return JSON.parse(result.output.trim());}
 t.after(async()=>{
  for(const child of children)if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGKILL');await exited;}
  await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});provider.destroy();
  for(const name of fs.readdirSync(directory))fs.unlinkSync(path.join(directory,name));fs.rmdirSync(directory);
 });
 return {expected:{configHash:hash({fixture:'refill-process-v1'}),refill:input},provider,source,target,file,marker,directory,launch,run,sends:()=>sends,failReceipts:v=>{failReceipts=v;},read:()=>JSON.parse(fs.readFileSync(file))};
}
async function crash(f,mode){
 const {child,done}=f.launch(mode),deadline=Date.now()+15000;
 while(!fs.existsSync(f.marker)){
  assert.equal(child.exitCode,null,'child exited before checkpoint');assert(Date.now()<deadline,'checkpoint timeout');
  await new Promise(r=>setTimeout(r,25));
 }
 assert.deepEqual(JSON.parse(fs.readFileSync(f.marker)),{pid:child.pid,stage:mode});
 child.kill('SIGKILL');await done;return child.pid;
}
function releaseTestLock(f,pid){
 // ONLY the private fixture lock, after observing the owned child exit. No runtime recovery API.
 const lock=path.resolve(f.file+'.lock');assert.equal(path.dirname(lock),f.directory);
 assert.equal(fs.readFileSync(lock,'utf8'),String(pid));fs.unlinkSync(lock);
}
for(const mode of ['prepared','sent','hashed','receipt','finalized'])test('process death at '+mode+' preserves evidence and never repeats a native transfer',{timeout:30000},async t=>{
 const f=await fixture(t),before=await f.provider.getBalance(f.source),pid=await crash(f,mode),bytes=fs.readFileSync(f.file,'utf8');
 const locked=await f.run();assert.equal(locked.status,'error');assert.match(locked.message,/state locked/);assert.equal(fs.readFileSync(f.file,'utf8'),bytes); // stale lock blocks even after death
 assert.equal(f.sends(),mode==='prepared'?0:1);
 const report=await inspectNativeRefill({statePath:f.file,expected:f.expected,provider:f.provider});
 assert.equal(report.status,['prepared','sent'].includes(mode)?'manualTransactionSearchRequired':mode==='finalized'?'noPending':'recoverableReceipt');
 assert.equal(report.ownershipUnresolved,true);assert.equal(report.exitCode,1);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
 releaseTestLock(f,pid);
 const result=await f.run();
 if(['prepared','sent'].includes(mode)){
  assert.equal(result.reason,'unknownHash');assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
 }else{
  assert.equal(result.status,mode==='finalized'?'ready':'confirmed');
  assert(!f.read().pending);assert.equal(BigInt(f.read().nativeRefillHistory.spent),before-await f.provider.getBalance(f.source));
  const accounted=fs.readFileSync(f.file,'utf8');assert.equal((await f.run()).status,'ready');assert.equal(fs.readFileSync(f.file,'utf8'),accounted);
 }
 assert.equal(f.sends(),mode==='prepared'?0:1);
 assert.equal(await f.provider.getBalance(f.target),mode==='prepared'?0n:2000000000000000n);
});
test('receipt RPC outage after crash leaves journal unchanged; restored RPC accounts original send',{timeout:30000},async t=>{
 const f=await fixture(t),pid=await crash(f,'hashed');releaseTestLock(f,pid);
 const bytes=fs.readFileSync(f.file,'utf8');f.failReceipts(true);
 assert.equal((await f.run()).status,'error');assert.equal(fs.readFileSync(f.file,'utf8'),bytes);assert.equal(f.sends(),1);
 f.failReceipts(false);assert.equal((await f.run()).status,'confirmed');assert.equal((await f.run()).status,'ready');assert.equal(f.sends(),1);
});
