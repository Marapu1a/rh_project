// Test harness only. The child release signs solely against this process's local fork.
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{ethers}=require('ethers');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function child(command,args,{cwd,env,log,allowFailure=false}={}){
 return new Promise((resolve,reject)=>{const fd=fs.openSync(log,'a'),p=spawn(command,args,{cwd,env,windowsHide:true,stdio:['ignore',fd,fd]});fs.closeSync(fd);
  p.once('error',reject);p.once('exit',(code,signal)=>code===0||allowFailure?resolve({code,signal}):reject(Error('Release child failed; inspect '+log)));
 });
}
async function finish({out,save,provider,quote,cycle,rpc,buy,directory,report,invariant,config,setFinalized}){
 const build=JSON.parse(fs.readFileSync('.local/logs/public-release-build.json','utf8')),release=path.resolve(build.release),base=path.resolve(build.base);
 assert(!release.toLowerCase().startsWith(path.resolve('.').toLowerCase()+path.sep),'Release must be outside checkout');
 const {short,monthly,vault,random}=cycle,work=fs.mkdtempSync(path.join(base,'work-'));
 const clean=require('./test-artifact.cjs').clearContract(process.env);for(const k of ['NODE_PATH','NODE_OPTIONS','RH_FORK_RPC_URL','RH_RPC_URL','QIANQI_KEYSTORE_PASSWORD'])delete clean[k];
 const wallet=ethers.Wallet.fromPhrase('test test test test test test test test test test test junk');assert.equal(wallet.address.toLowerCase(),config.executor.toLowerCase());
 const password=require('node:crypto').randomBytes(24).toString('hex');fs.writeFileSync(path.join(work,'executor.json'),await wallet.encrypt(password),{mode:0o600});
 const openssl=process.env.QIANQI_TEST_OPENSSL||'C:/Program Files/Git/usr/bin/openssl.exe',cert=path.join(work,'localhost.crt'),key=path.join(work,'localhost.key');
 await child(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','2','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-addext','basicConstraints=critical,CA:TRUE'],{env:clean,log:path.join(work,'tls.log')});
 config=structuredClone(config);config.schema='pons-public-automation-v1';delete config.instanceId;config.indexer.statePath=path.join(work,'index.json');config.indexer.maxAgeSeconds=300;
 const op={schema:'promo-operational-profile-v1',roles:{governor:config.executor,operations:config.recipients[1],project:config.recipients[2],buyPolicyPublisher:config.buyPolicy.publisher},controllers:{},buyPolicy:{source:config.buyPolicy.source,codeHash:config.buyPolicy.sourceCodeHash,noticeBlocks:String(config.buyPolicy.noticeBlocks)},genesis:require('./operational-profile.cjs').genesis()};
 for(const [kind,c]of [['short',short],['monthly',monthly]])op.controllers[kind]={noticeSeconds:String(await c[kind==='short'?'shortRulesNotice':'monthlyRulesNotice']()),maxGasPrice:String(await c.maxGasPrice()),nativeFloor:String(await c.nativeFloor())};
 const publicProfile={schema:'pons-public-profile-v1',configHash:require('./direct-buy.cjs').hash(config),operational:op,timing:{leadSeconds:'60',maxClockLag:'30',maxClockAhead:'5',maxFinalizedLag:'20',maxBeaconLag:'15',shortInterval:'21600',monthlyInterval:'2592000',cutoffDelayBlocks:'1'}};
 const cfg=path.join(work,'config.json'),prof=path.join(work,'profile.json'),state=path.join(work,'operator.json');
 fs.writeFileSync(cfg,JSON.stringify(config,null,2));fs.writeFileSync(prof,JSON.stringify(publicProfile,null,2));
 const evidence=report.publicRelease={schema:'pons-public-release-rehearsal-v1',release,work,status:'RUNNING',publicNetworkSends:false,passes:[],signed:[],assumptions:['Real Pons state on a local fork; upstream read-only','Known disposable Hardhat mnemonic, synthetic ETH/USDG','Backdated constructor clocks and 60-second drand lead from existing test harness; no RNG replacement','Local HTTPS CA trusted only by child environment; TLS verification remains enabled','Local finality pinned initially, follows latest after proposals begin (existing cycle harness convention); not Nitro finality proof']};save();
 const allowed=new Set([config.collector,config.vault,config.lifecycle.source,config.lifecycle.monthlySource,config.deliveryJob.adapter].map(a=>a.toLowerCase()));
 let finalizedTag;const pinFinalized=value=>{finalizedTag=value;setFinalized(value);};
 const server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},async(req,res)=>{
  try{let body='';for await(const b of req){body+=b;if(body.length>2_000_000)throw Error('Request too large');}
   async function handle(q){try{
    assert(q.method.startsWith('eth_')||q.method==='net_version','Test gateway forbids node administration');
    if(q.method==='eth_sendRawTransaction'){
     const tx=ethers.Transaction.from(q.params[0]);assert.equal(tx.chainId,4663n);assert.equal(tx.from.toLowerCase(),config.executor.toLowerCase());assert(allowed.has(tx.to.toLowerCase()));assert.equal(tx.value,0n);
     const hash=await rpc(q.method,q.params);evidence.signed.push({hash,nonce:tx.nonce,target:tx.to,selector:tx.data.slice(0,10)});save();return {jsonrpc:'2.0',id:q.id,result:hash};
    }
    assert(!q.method.startsWith('eth_send')&&!q.method.startsWith('eth_sign'),'Raw signed transactions only');
    const params=q.method==='eth_getBlockByNumber'&&q.params?.[0]==='finalized'?[finalizedTag||'latest',...q.params.slice(1)]:q.params||[];
    return {jsonrpc:'2.0',id:q.id,result:await rpc(q.method,params)};
   }catch(e){return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:e.shortMessage||e.message,data:e.data}};}}
   const q=JSON.parse(body);res.setHeader('content-type','application/json');res.end(JSON.stringify(Array.isArray(q)?await Promise.all(q.map(handle)):await handle(q)));
  }catch{res.writeHead(400);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='https://127.0.0.1:'+server.address().port;
 const env={...clean,RH_RPC_URL:url,QIANQI_KEYSTORE_PASSWORD:password,NODE_EXTRA_CA_CERTS:cert,NODE_TLS_REJECT_UNAUTHORIZED:'1'};
 const args=['scripts/run-pons-public.cjs','--config',cfg,'--profile',prof,'--state',state,'--keystore',path.join(work,'executor.json')];
 const indexConfig=require('./shared-index-config.cjs').buildIndexConfigs(require('./pons-automation.cjs').schedulerConfigFor(config)).indexConfig;
 let tickNumber=0,liveFinality=false;
 async function tick({drain=false,index=true}={}){
  const n=++tickNumber,log=path.join(work,'pass-'+n+'.log');
  liveFinality=liveFinality||await short.activeProposal()!==ethers.ZeroHash||await monthly.activeMonth()!==ethers.ZeroHash;
  pinFinalized(liveFinality?'latest':await rpc('eth_blockNumber'));
  if(index)await require('./persistent-buy-indexer.cjs').indexOnce({config:indexConfig,statePath:config.indexer.statePath,rpc:(m,p)=>provider.send(m,p)});
  const before=evidence.signed.length;await child(process.execPath,[...args,...(drain?['--drain']:[])],{cwd:release,env,log});
  const status=JSON.parse(fs.readFileSync(state+'.status.json')),row={n,drain,sends:evidence.signed.length-before,status,log};evidence.passes.push(row);save();assert.notEqual(status.state,'attention',JSON.stringify(row));console.log('PUBLIC RELEASE PASS '+n+' sends='+row.sends);return row;
 }
 try{
  await child(process.platform==='win32'?'cmd.exe':'npm',process.platform==='win32'?['/d','/c','npm ci --omit=dev --ignore-scripts --no-audit --no-fund']:['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:release,env:clean,log:path.join(work,'install.log')});
  await child(process.execPath,['-e',"require('./scripts/verify-runtime-release.cjs').verify(process.cwd());try{require.resolve('solc');throw Error('compiler present')}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}require('./scripts/compile.cjs').compile();console.log('Isolated runtime verified')"],{cwd:release,env:clean,log:path.join(work,'integrity.log')});
  const latest=await provider.getBlock('latest');await rpc('evm_setNextBlockTimestamp',[Math.max(latest.timestamp,Math.floor(Date.now()/1000))]);await rpc('evm_mine');await rpc('evm_setIntervalMining',[1000]);
  await buy(1_000000n);
  const hook=new ethers.Contract(out.graph.hook,['function sweepPoolFees(bytes32,uint256,uint256)'],new ethers.JsonRpcSigner(provider,out.operator));await(await hook.sweepPoolFees(out.poolId,1,0,{gasLimit:6000000})).wait();
  pinFinalized(await rpc('eth_blockNumber'));
  await child(process.execPath,['scripts/inspect-pons-public.cjs',cfg,prof],{cwd:release,env,log:path.join(work,'admission.log')});evidence.admission='matched';save();
  const untrusted=await child(process.execPath,['scripts/inspect-pons-public.cjs',cfg,prof],{cwd:release,env:{...env,NODE_EXTRA_CA_CERTS:''},log:path.join(work,'untrusted-tls.log'),allowFailure:true});assert.notEqual(untrusted.code,0);assert.equal(evidence.signed.length,0);evidence.untrustedTLSRejected=true;
  const wrong=await child(process.execPath,args,{cwd:release,env:{...env,QIANQI_KEYSTORE_PASSWORD:'deliberately-wrong'},log:path.join(work,'wrong-password.log'),allowFailure:true});assert.notEqual(wrong.code,0);assert.equal(evidence.signed.length,0);evidence.wrongPasswordNoSend=true;
  let sid,mid;
  for(let i=0;i<20;i++){await tick();sid=await short.pendingDatasetDraw();mid=await monthly.pendingMonth();if(sid!==ethers.ZeroHash&&mid!==ethers.ZeroHash)break;}
  assert.notEqual(sid,ethers.ZeroHash,'Short did not freeze');assert.notEqual(mid,ethers.ZeroHash,'Monthly did not freeze');evidence.draws={short:sid,monthly:mid};evidence.atFreeze=await invariant();
  const collectorABI=new ethers.Interface(require('./pons-collector-manual.cjs').ABI);
  for(const name of ['pull','pay'])assert(evidence.signed.some(s=>s.selector===collectorABI.getFunction(name).selector),'No signed '+name);
  await buy(60_000000n);await buy(40_000000n);evidence.lateBuys=true;
  const requests=await Promise.all([await short.drawRequest(sid),await monthly.drawRequest(mid)].map(id=>random.requests(id)));const due=Math.max(...requests.map(r=>1727521075+(Number(r.round)-1)*3));
  assert(due-Date.now()/1000<90);while(Date.now()/1000<due+2){console.log('PUBLIC RELEASE waiting original drand rounds');await pause(Math.min(10000,Math.max(1,(due+2)*1000-Date.now())));}
  for(let i=0;i<24;i++){await tick({drain:true});if((await short.settlements(sid)).phase===3n&&(await monthly.month(mid)).phase===5n&&await vault.claimable(quote.target)===0n)break;}
  assert.equal((await short.settlements(sid)).phase,3n);assert.equal((await monthly.month(mid)).phase,5n);assert.equal(await vault.reserved(quote.target),0n);assert.equal(await vault.claimable(quote.target),0n);
  evidence.after=await invariant();const paidEvents=await vault.queryFilter(vault.filters.RewardPaid(),config.manifest.anchor.number);evidence.payments=paidEvents.map(e=>({hash:e.transactionHash,args:Array.from(e.args,String)}));
  evidence.paidRaw=paidEvents.reduce((sum,e)=>sum+e.args.amount,0n);assert.equal(evidence.atFreeze.balance-evidence.after.balance,evidence.paidRaw);assert.equal(new Set(paidEvents.map(e=>e.args.drawId+e.args.winner)).size,paidEvents.length,'Duplicate payout');
  const before=await provider.getTransactionCount(config.executor),idle=await tick({drain:true});assert.equal(idle.sends,0);assert.equal(await provider.getTransactionCount(config.executor),before);
  const snapshot=JSON.parse(fs.readFileSync(config.indexer.statePath)),ledger=require('./attempt-lifecycle.cjs').replayAttempts(snapshot.index.manifest,config.lifecycle,snapshot.index.blocks),walletLedger=ledger.wallets.find(w=>w.wallet===config.executor.toLowerCase());
  for(const kind of ['SHORT','MONTHLY']){assert.equal(walletLedger[kind].consumedTotal,'86');assert.equal(walletLedger[kind].open,'1');}
  evidence.wallet=walletLedger;evidence.idleNonce=before;evidence.signedTransactions=evidence.signed.length;
  await child(process.execPath,['-e',"require('./scripts/verify-runtime-release.cjs').verify(process.cwd());console.log('Integrity PASS')"],{cwd:release,env:clean,log:path.join(work,'integrity-after.log')});
  evidence.status='PASSED';report.status='PONS_PUBLIC_RELEASE_REHEARSAL_PASSED';save();
 }finally{await rpc('evm_setIntervalMining',[0]);server.closeAllConnections();await new Promise(r=>server.close(r));}
}
module.exports={finish};
