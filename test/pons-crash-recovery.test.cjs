const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{fork}=require('node:child_process');
const {ethers}=require('ethers'),hre=require('hardhat');
const vector=require('../research/drand-feasibility/vector.json').beacon,target=1727521075+(vector.round-1)*3;
hre.config.networks.hardhat.initialDate=new Date((target-40*86400)*1000).toISOString();
const compiled=require('../scripts/compile.cjs').compile(),{fixture,sent,rpc}=require('./fixtures/local-controllers.cjs');
async function setup(){
 const f=await fixture(compiled,{drandTiming:[3600,30,5,1800,15]});await f.fundExecution();
 await rpc('evm_setNextBlockTimestamp',[target-4000]);await rpc('evm_mine');
 const short=await f.prepare('crash short'),month=await f.prepare('crash month','MONTHLY');
 await rpc('evm_setNextBlockTimestamp',[target-3601]);await rpc('evm_setAutomine',[false]);
 try{const a=await f.short.seal(short.proposalId,{gasLimit:2500000}),b=await f.monthly.sealMonth(month.drawId,{gasLimit:2500000});await rpc('evm_mine');await a.wait();await b.wait();}finally{await rpc('evm_setAutomine',[true]);}
 const anchor=await f.provider.getBlock('latest'),sender=await f.executor.getAddress();
 const job={schema:'local-drand-delivery-v1',chainId:31337,adapter:f.random.target,short:f.short.target,monthly:f.monthly.target,anchor:{number:anchor.number,hash:anchor.hash},maxGasPrice:'1000000000000',nativeFloor:'1000000000000',gasUnits:{prove:'400000',deliver:'300000'},pollSeconds:10};
 for(const [k,c]of [['adapter',f.random],['short',f.short],['monthly',f.monthly]])job[k+'CodeHash']=ethers.keccak256(await f.provider.getCode(c.target));
 await rpc('evm_setNextBlockTimestamp',[target+10]);await rpc('evm_mine');
 // Keep both real liabilities nonzero throughout crash recovery: Short is frozen,
 // while an independently completed Monthly prize remains unclaimed.
 const monthlyRequest=await f.monthly.drawRequest(month.drawId);
 await sent(f.random.prove(monthlyRequest,'0x'+vector.signature));await sent(f.random.deliver(monthlyRequest));
 for(let i=0;i<month.data.length;i+=8)await sent(f.monthly.processMonth(month.drawId,i/8,month.data.slice(i,i+8)));
 await sent(f.monthly.finishMonth(month.drawId));assert(await f.vault.claimable(f.quote.target)>0n);assert(await f.vault.reserved(f.quote.target)>0n);
 const escrow=await f.deploy('PonsEscrowFixture'),collector=await f.deploy('LocalPonsCollector',[f.admin.address,f.token.target,f.quote.target,escrow.target]);
 const recipient=(await f.provider.getSigner(3)).address;
 await sent(collector.bindPromo([target+10000,[f.vault.target,recipient,f.admin.address],[9000,500,500]]));
 await sent(f.quote.mint(collector.target,1000));await sent(collector.sync());
 const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;try{const q=JSON.parse(body),handle=async x=>{try{return {jsonrpc:'2.0',id:x.id,result:await rpc(x.method,x.params)};}catch(e){return {jsonrpc:'2.0',id:x.id,error:{code:-32000,message:e.message}};}};res.end(JSON.stringify(Array.isArray(q)?await Promise.all(q.map(handle)):await handle(q)));}catch{res.writeHead(400);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 fs.mkdirSync('.local/logs',{recursive:true});const directory=fs.mkdtempSync(path.resolve('.local/logs/pons-crash-'));
 return {...f,collector,recipient,job,directory,instanceId:(await rpc('hardhat_metadata')).instanceId,url:'http://127.0.0.1:'+server.address().port,sender,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
async function child(file,stage){
 const p=fork(path.resolve('test/fixtures/pons-crash-child.cjs'),[file,stage],{stdio:['ignore','pipe','pipe','ipc']});let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);
 const exited=new Promise(resolve=>p.once('exit',(code,signal)=>resolve({code,signal})));
 let timer;
 const event=await new Promise((resolve,reject)=>{
  timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('Crash subprocess timeout: '+output));},30000);
  p.once('error',reject);p.once('message',resolve);p.once('exit',code=>reject(Error('Exited before result '+code+': '+output)));
 }).finally(()=>clearTimeout(timer));
 if(event.event==='window'){assert(p.kill('SIGKILL'),'Subprocess exited before forced kill');const exit=await exited;assert.notEqual(exit.code,0);}else await exited;
 return {...event,pid:p.pid};
}
async function obligations(f){return [String(await f.vault.reserved(f.quote.target)),String(await f.vault.claimable(f.quote.target))];}
test('Pons real process kill: primary and drand journals retain unknown/known sends and status0',async()=>{
 const f=await setup();try{
  const baseline=await rpc('evm_snapshot');let snapshot=baseline;
  for(const kind of ['main','drand'])for(const variant of ['unknown','known','reverted']){
   await rpc('evm_revert',[snapshot]);snapshot=await rpc('evm_snapshot');
   const stage=variant==='unknown'?'unknown':'known',state=path.join(f.directory,kind+'-'+variant+'.json'),file=state+'.config.json';
   fs.writeFileSync(file,JSON.stringify({kind,state,instanceId:f.instanceId,rpc:f.url,sender:f.sender,collector:f.collector.target,recipient:f.recipient,job:f.job,adapterAbi:compiled.DrandRandomAdapter.abi,forceRevert:variant==='reverted'}));
   const before=await obligations(f),nonce=await f.provider.getTransactionCount(f.sender);
   if(variant==='reverted')await rpc('evm_setAutomine',[false]);
   const killed=await child(file,stage);assert.equal(killed.event,'window',kind+'/'+variant+': '+JSON.stringify(killed));
   assert.equal((await rpc('hardhat_metadata')).instanceId,f.instanceId);
   const saved=JSON.parse(fs.readFileSync(state)),lock=state+'.lock';assert.equal(fs.readFileSync(lock,'utf8'),String(killed.pid));
   assert.equal(!!saved.pending.transactionHash,stage==='known');
   const stalled=await child(file,'reconcile');assert.equal(stalled.event,'error');assert.match(stalled.message,/state locked/);
   // Only this test-owned lock is removed after the owner has exited; journal bytes remain intact.
   const bytes=fs.readFileSync(state);fs.unlinkSync(lock);assert.deepEqual(fs.readFileSync(state),bytes);
   if(variant==='reverted'){
    const pending=await child(file,'reconcile');assert.equal(pending.result.reason,'pendingReceipt');
    await rpc('evm_mine');await rpc('evm_setAutomine',[true]);
   }
   const result=await child(file,'reconcile');assert.equal(result.event,'result',JSON.stringify(result));
   const receipt=await f.provider.getTransactionReceipt(killed.hash);assert.equal(receipt.status,variant==='reverted'?0:1);
   if(stage==='unknown'){assert.equal(result.result.reason,'unknownHash');assert.deepEqual(fs.readFileSync(state),bytes);}
   else{assert(['resolved','complete'].includes(result.result.status));const resolved=JSON.parse(fs.readFileSync(state));assert.equal(resolved.pending,undefined);assert.equal(resolved.lastResolved.status,receipt.status);}
   assert.equal(await f.provider.getTransactionCount(f.sender),nonce+1);assert.deepEqual(await obligations(f),before);
   if(kind==='main'){assert.equal(await f.quote.balanceOf(f.recipient),variant==='reverted'?0n:50n);assert.equal(await f.collector.credit(f.recipient),variant==='reverted'?50n:0n);}
   // Another clean reconciliation still cannot generate a second transaction.
   await child(file,'reconcile');assert.equal(await f.provider.getTransactionCount(f.sender),nonce+1);
   if(kind==='drand'&&variant==='known'){
    const resumed=await child(file,'resume');assert.equal(resumed.result.status,'complete');assert.deepEqual(resumed.result.steps.map(x=>x.action),['deliver']);
    const end=await f.provider.getTransactionCount(f.sender);const again=await child(file,'resume');assert.equal(again.result.steps.length,0);assert.equal(await f.provider.getTransactionCount(f.sender),end);assert.deepEqual(await obligations(f),before);
   }
  }
 }finally{await rpc('evm_setAutomine',[true]);await f.close();}
});
