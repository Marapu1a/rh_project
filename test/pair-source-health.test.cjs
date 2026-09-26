const {test}=require('node:test'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {fixture}=require('./fixtures/pair-source-health.cjs');
const {inspectSource,validateManifest}=require('../scripts/pair-source-health.cjs');
const {hash}=require('../scripts/direct-buy.cjs');

test('source health pins a coherent block and does not mutate its approved manifest',async()=>{
 const f=fixture(),before=JSON.stringify(f.manifest),r=await inspectSource(f);
 assert.equal(r.status,'match',JSON.stringify(r.issues));assert.deepEqual(r.issues,[]);assert(f.calls.length>25);assert(f.calls.every(c=>c[1]===2));assert.equal(JSON.stringify(f.manifest),before);
});
for(const [label,value]of [['vault.epoch',[2]],['vault.epochRecipient',[ethers.ZeroAddress,10000]],['vault.epochRecipientCount',[2]],['positionManager.ownerOf',[ethers.ZeroAddress]],['vault.positions',[false,ethers.ZeroAddress,ethers.ZeroHash]],['feeRouter.sourceEpoch',[2]],['registry.vaultOf',[ethers.ZeroAddress]]])test('source health detects '+label,async()=>{
 const f=fixture();f.state.values[label]=value;const r=await inspectSource(f);assert.equal(r.status,'changed');assert(r.issues.some(x=>x.scope==='source'&&x.kind==='changed'));
});
test('source health distinguishes future launch rotation from existing source changes',async()=>{
 const f=fixture();f.state.values['registry.currentCoordinator']=[f.addr(20)];f.state.values['registry.currentHandler']=[f.addr(21),6,false];
 const r=await inspectSource(f);assert.equal(r.status,'match');assert.equal(r.issues.length,4);assert(r.issues.every(x=>x.scope==='futureLaunch'));
});
for(const role of ['vault','token','quoteImplementation'])test('source health detects runtime/implementation drift '+role,async()=>{
 const f=fixture();f.state.code[role==='quoteImplementation'?f.addr(10):f.manifest.contracts[role].address]='0x6000';assert.equal((await inspectSource(f)).status,'changed');
});
test('source health detects unchanged proxy runtime with replaced implementation slot',async()=>{
 const f=fixture();f.state.slot=ethers.zeroPadValue(f.addr(20),32);const r=await inspectSource(f);assert.equal(r.status,'changed');assert(r.issues.some(x=>x.check==='quote.implementationSlot'));
});
test('source health reports missing reads and reorg as unavailable, not a clean bill of health',async()=>{
 const f=fixture();f.state.fail='vault.epoch';assert.equal((await inspectSource(f)).status,'unavailable');
 f.state.fail=null;f.state.reorg=true;f.state.values['vault.epoch']=[2];assert.equal((await inspectSource(f)).status,'unavailable');
});
test('source health rejects wrong network without reading contracts',async()=>{
 const f=fixture();f.state.chainId=1n;assert.equal((await inspectSource(f)).status,'changed');assert.equal(f.calls.length,0);
});
test('source health refuses self-enrollment, altered pins and unpinned native clone',()=>{
 const f=fixture();assert.throws(()=>validateManifest(f.manifest,ethers.ZeroHash),/hash mismatch/);f.manifest.sourceEpoch='2';assert.throws(()=>validateManifest(f.manifest,f.expectedHash),/hash mismatch/);
 f.manifest.contracts.token.implementation=null;assert.throws(()=>validateManifest(f.manifest,hash(f.manifest)),/clone implementation/);
});

test('source health CLI reads JSON-RPC, returns diagnostic exit codes and never sends transactions',async t=>{
 const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
 const f=fixture(),seen=[],dir=fs.mkdtempSync(path.join(os.tmpdir(),'pair-health-'));t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('pair-health-'));fs.rmSync(dir,{recursive:true,force:true});});
 const file=path.join(dir,'manifest.json');fs.writeFileSync(file,JSON.stringify(f.manifest));
 const server=http.createServer(async(req,res)=>{
  let body='';for await(const part of req)body+=part;const q=JSON.parse(body);seen.push(q.method);
  let result,error;try{
   const [a,b,c]=q.params;
   if(q.method==='eth_chainId')result='0x1237';
   else if(q.method==='eth_getBlockByNumber'){const v=await f.provider.getBlock(a==='latest'?'latest':Number(BigInt(a)));result={...v,number:ethers.toQuantity(v.number),timestamp:ethers.toQuantity(v.timestamp),parentHash:ethers.ZeroHash,nonce:'0x0000000000000000',difficulty:'0x0',gasLimit:'0x1c9c380',gasUsed:'0x0',miner:ethers.ZeroAddress,extraData:'0x',transactions:[]};}
   else if(q.method==='eth_getCode')result=await f.provider.getCode(ethers.getAddress(a),Number(BigInt(b)));
   else if(q.method==='eth_getStorageAt')result=await f.provider.getStorage(ethers.getAddress(a),b,Number(BigInt(c)));
   else if(q.method==='eth_call')result=await f.provider.call({...a,to:ethers.getAddress(a.to),blockTag:Number(BigInt(b))});
   else throw Error('Forbidden RPC '+q.method);
  }catch(e){error={code:-32000,message:e.message};}
  res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,...(error?{error}:{result})}));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.close();server.closeAllConnections();});
 const url='http://127.0.0.1:'+server.address().port;
 async function run(expected=f.expectedHash){return new Promise((resolve,reject)=>{let out='',err='';const child=spawn(process.execPath,['scripts/inspect-pair-source.cjs','--manifest',file,'--expected-hash',expected,'--rpc',url]);child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));});}
 let r=await run();assert.equal(r.code,0,r.err);assert.equal(JSON.parse(r.out).status,'match');
 f.state.values['vault.epoch']=[2];r=await run();assert.equal(r.code,1,r.err);assert.equal(JSON.parse(r.out).status,'changed');
 delete f.state.values['vault.epoch'];f.state.fail='vault.epoch';r=await run();assert.equal(r.code,2,r.err);assert.equal(JSON.parse(r.out).status,'unavailable');
 const count=seen.length;r=await run(ethers.id('unapproved'));assert.equal(r.code,2);assert.equal(seen.length,count);

 f.state.fail=null;const reports=[];
 await new Promise((resolve,reject)=>{
  let buffer='';const child=spawn(process.execPath,['scripts/inspect-pair-source.cjs','--manifest',file,'--expected-hash',f.expectedHash,'--rpc',url,'--watch','--poll-seconds','10']);
  const timer=setTimeout(()=>{child.kill();reject(Error('watch did not produce two reports'));},20000);
  child.stdout.on('data',b=>{buffer+=b;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;reports.push(JSON.parse(line));if(reports.length===1){f.state.values['vault.epoch']=[2];fs.writeFileSync(file,JSON.stringify({...f.manifest,sourceEpoch:'3'}));}if(reports.length===2)child.kill();}});
  child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',()=>{clearTimeout(timer);resolve();});
 });
 assert.equal(reports.length,2);assert.equal(reports[0].status,'match');assert.equal(reports[1].status,'changed');assert(reports.every(r=>r.manifestHash===f.expectedHash));
 assert(seen.every(m=>['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getStorageAt','eth_call'].includes(m)));
});

test('saved native launch health candidate binds the real fork source and delegated code pins',()=>{
 const e=require('../research/native-launch/health-success-2026-09-26.json'),m=require('../research/native-launch/health-manifest.local.json');
 assert.equal(e.success,true);assert.equal(e.health.status,'candidate-only-local-fork');validateManifest(m,e.health.expectedHash);
 assert.deepEqual(m,e.health.manifest);assert.equal(m.chainId,'31337');assert.equal(e.health.report.status,'match');assert.deepEqual(e.health.report.issues,[]);
 assert.equal(m.contracts.feeRouter.address,e.launch.router);assert.equal(m.contracts.vault.address,e.binding.vault);assert.equal(m.positionId,e.binding.position);
 for(const role of Object.keys(m.contracts)){const pin=m.contracts[role],row=e.health.report.observations.find(x=>x.check===role+'.code');assert.equal(row.value.hash,pin.codeHash);if(pin.implementation)assert.equal(e.health.report.observations.find(x=>x.check===role+'.implementationCode').value.hash,pin.implementation.codeHash);}
});

for(const kind of ['missingAnchor','wrongAnchor','finalReadFailure'])test('source health fails closed on '+kind,async()=>{
 const f=fixture(),original=f.provider.getBlock;
 f.provider.getBlock=async n=>{if(kind==='missingAnchor'&&n===1)return null;if(kind==='wrongAnchor'&&n===1)return {number:1,hash:ethers.id('other deployment')};if(kind==='finalReadFailure'&&n===2)throw Error('recheck unavailable');return original(n);};
 const r=await inspectSource(f);assert.equal(r.status,kind==='wrongAnchor'?'changed':'unavailable');assert(r.issues.length>0);if(kind!=='finalReadFailure')assert.equal(f.calls.length,0);
});
