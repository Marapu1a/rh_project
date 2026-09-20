// Local synthetic calibration. No public RPC, real token prices or production gas guarantee.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {compile}=require('./compile.cjs');
const {fixture,sent,advance,rpc}=require('../test/fixtures/local-controllers.cjs');
const {participants,normalRules,nearCertainRules}=require('../test/fixtures/short-outcome.cjs');
const {monthlyRoot}=require('../test/fixtures/dual-controller.cjs');
const {rootFor}=require('./short-dataset.cjs'),{drawIdFor}=require('./draw-id.cjs');
const {evaluateBudget,checkExecutionBudget}=require('./local-execution-budget.cjs');
const {opsProfile}=require('../test/fixtures/execution-budget.cjs');
const serialize=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
const max=(a,b)=>a>b?a:b;
async function main(){
 const root=path.resolve(process.env.CALIBRATION_OUTPUT||'.local/logs/execution-calibration');fs.mkdirSync(root,{recursive:true});
 const out=fs.mkdtempSync(path.join(root,'run-'));
 const compiled=compile(),cases=[],raw=[];
 const sizes=process.env.CALIBRATION_SIZES?process.env.CALIBRATION_SIZES.split(',').map(Number):[100,1000,10000];
 assert(sizes.length>0&&new Set(sizes).size===sizes.length&&sizes.every(n=>[100,1000,10000].includes(n)));
 const plans=sizes.flatMap(n=>['normal10','admitted64'].map(profile=>({n,profile,mode:'BOTH'})));
 if(sizes.includes(1000))plans.push(...['SHORT','MONTHLY'].map(mode=>({n:1000,profile:'admitted64',mode})));
 const selected=process.env.CALIBRATION_CASE?plans.filter(p=>`${p.profile}-${p.n}-${p.mode}`===process.env.CALIBRATION_CASE):plans;assert(selected.length>0,'Unknown calibration case');
 for(const plan of selected){
  const {n,profile,mode}=plan,label=`${profile}-${n}-${mode}`,stress=profile==='admitted64';
  const rules=stress?nearCertainRules:normalRules,weights=stress?Array(64).fill(1):[7,5,4,3,2,2,1,1,1,1];
  const f=await fixture(compiled,{rules,weights});await f.fundExecution();await advance(30*86400+1);
  const ps=participants(n,stress?1000000:undefined),chunks=[];
  for(let i=0;i<n;i+=64)chunks.push(ps.slice(i,i+64));
  const attempts=ps.reduce((a,p)=>a+p.lastAttempt-p.firstAttempt+1n,0n),jobs=[],rows=[];
  const addresses={publisher:await f.admin.getAddress(),executor:await f.executor.getAddress(),short:f.short.target,monthly:f.monthly.target};
  async function measure(source,action,args,phase){
   const method=source.getFunction(action),payer=await source.runner.getAddress();
   const overrides={type:2,maxFeePerGas:2000000000n,maxPriorityFeePerGas:0n};
   const request=await method.populateTransaction(...args,overrides),estimate=await method.estimateGas(...args,overrides);
   const before=await f.provider.getBalance(payer),sb=await f.provider.getBalance(f.short.target),mb=await f.provider.getBalance(f.monthly.target);
   const receipt=await sent(method(...args,{...overrides,gasLimit:estimate}));
   const block=await f.provider.getBlock(receipt.blockNumber),after=await f.provider.getBalance(payer);
   const row={label,phase,action,payer,estimate,gasUsed:receipt.gasUsed,calldataBytes:(request.data.length-2)/2,
    gasPrice:receipt.gasPrice,blockGasLimit:block.gasLimit,nativeSpent:before-after,
    shortNativeSpent:sb-await f.provider.getBalance(f.short.target),monthlyNativeSpent:mb-await f.provider.getBalance(f.monthly.target)};
   assert.equal(row.nativeSpent,receipt.gasUsed*receipt.gasPrice);assert(estimate>=receipt.gasUsed);
   rows.push(row);return receipt;
  }
  for(const kind of (mode==='BOTH'?['SHORT','MONTHLY']:[mode])){
   const short=kind==='SHORT',source=short?f.short:f.monthly,b=await f.provider.getBlock('latest');
   const id=drawIdFor(kind,ethers.id(label+kind)),proposal=ethers.id(label+kind+' proposal');
   const input=short?{drawId:id,campaignId:1,rulesEpoch:1,cutoffBlockNumber:b.number,cutoffBlockHash:b.hash,
    snapshotHash:ethers.id(label+' snapshot'),expectedRoot:rootFor(ps),expectedCount:n,expectedAttempts:attempts,budget:1000}:
    {drawId:id,campaign:1,rulesEpoch:1,cutoff:b.number,cutoffHash:b.hash,snapshotHash:ethers.id(label+' snapshot'),root:monthlyRoot(ps),count:n,attempts};
   await measure(source,short?'begin':'beginMonth',short?[proposal,input]:[input],'prepare');
   for(const [i,chunk] of chunks.entries()){
    await measure(source,short?'publish':'publishMonth',[short?proposal:id,chunk],'prepare');
    if(i%40===0)console.log(`${label} ${kind} publish ${i+1}/${chunks.length}`);
   }
   jobs.push({kind,id,proposal});
  }
  // Alternate seal order; both frozen before either seed in joint cases.
  const order=stress?[...jobs].reverse():jobs;
  for(const j of order)await measure((j.kind==='SHORT'?f.short:f.monthly).connect(f.executor),j.kind==='SHORT'?'seal':'sealMonth',[j.kind==='SHORT'?j.proposal:j.id],'freeze');
  let frozen=await rpc('evm_snapshot'),prepareRows=rows.length,results=[];
  for(let seedIndex=0;seedIndex<2;seedIndex++){
   if(seedIndex){await rpc('evm_revert',[frozen]);frozen=await rpc('evm_snapshot');}
   const seed=seedIndex?ethers.id('calibration alternate seed'):ethers.ZeroHash;
   const start=rows.length;
   for(const j of (seedIndex?order:[...order].reverse())){
    const c=j.kind==='SHORT'?f.short:f.monthly;
    await measure(f.random,'deliver',[await c.drawRequest(j.id),seed],'seed'+seedIndex);
   }
   for(let index=0;index<chunks.length;index++)for(const j of order){
    const short=j.kind==='SHORT',source=new ethers.Contract(short?f.short.target:f.monthly.target,short?f.short.interface:f.monthly.interface,f.executor);
    const state=await source[short?'settlements':'month'](j.id);
    assert.equal(state.nextChunk,BigInt(index)); // Re-read persisted chain progress on each invocation.
    await measure(source,short?'processShort':'processMonth',[j.id,Number(state.nextChunk),chunks[index]],'seed'+seedIndex);
    if(index%40===0)console.log(`${label} seed${seedIndex} ${j.kind} process ${index+1}/${chunks.length}`);
   }
   const outcomes=[];
   for(const j of order){
    const short=j.kind==='SHORT',source=(short?f.short:f.monthly).connect(f.executor);
    await measure(source,short?'finishShort':'finishMonth',[j.id],'seed'+seedIndex);
    const state=await source[short?'settlements':'month'](j.id);
    if(stress)assert.equal(state.admitted,BigInt(n));
    outcomes.push({kind:j.kind,admitted:state.admitted,winners:short?(await source.shortResult(j.id)).winners.length:((await source.month(j.id)).winner===ethers.ZeroAddress?0:1)});
   }
   assert.equal(await f.vault.reserved(f.quote.target),0n);
   assert.equal(await f.quote.balanceOf(f.vault.target),await f.vault.freeShort()+await f.vault.freeCurrent()+await f.vault.freeNext()+await f.vault.claimable(f.quote.target)+await f.vault.unrecognizedUSDG());
   results.push({seed,gas:rows.slice(start).reduce((a,r)=>a+r.gasUsed,0n),outcomes});
  }
  const actions={};for(const r of rows){const a=actions[r.action]??={count:0,maxEstimate:0n,maxGasUsed:0n,maxCalldataBytes:0,gasTotal:0n,nativeTotal:0n};
   a.count++;a.maxEstimate=max(a.maxEstimate,r.estimate);a.maxGasUsed=max(a.maxGasUsed,r.gasUsed);a.maxCalldataBytes=Math.max(a.maxCalldataBytes,r.calldataBytes);a.gasTotal+=r.gasUsed;a.nativeTotal+=r.nativeSpent;}
  let boundary;
  if(n===1000&&stress&&mode==='BOTH'){await rpc('evm_revert',[frozen]);boundary=await checkBoundary(f,jobs,chunks,actions,out);}
  const report={boundary,...plan,chunkSize:64,chunks:chunks.length,weights,rules,addresses,actions,prepareAndFreezeGas:rows.slice(0,prepareRows).reduce((a,r)=>a+r.gasUsed,0n),results};
  cases.push(report);raw.push(...rows);fs.writeFileSync(path.join(out,'transactions.json'),serialize(raw));fs.writeFileSync(path.join(out,'summary.json'),serialize({schema:'local-execution-calibration-v1',cases}));
  console.log('COMPLETE '+label);f.provider.destroy();
 }
 require('./render-execution-calibration.cjs').render(out);
 console.log('REPORT '+out);
}

async function checkBoundary(f,jobs,chunks,actions,out){
 const ops=opsProfile(),address=(await f.executor.getAddress()).toLowerCase();
 for(const [action,data] of Object.entries(actions))if(ops.network.gasUnits[action])ops.network.gasUnits[action]=String((data.maxEstimate*110n+99n)/100n);
 for(const j of jobs){const c=j.kind==='SHORT'?f.short:f.monthly;await sent(f.random.deliver(await c.drawRequest(j.id),ethers.id('boundary seed')));}
 const obligations=jobs.map(j=>({id:j.id,publisher:address,executor:address,counts:j.kind==='SHORT'?{processShort:chunks.length,finishShort:1}:{processMonth:chunks.length,finishMonth:1}}));
 const requirement=list=>BigInt(evaluateBudget(ops,{balances:{[address]:'0'},obligations:list}).accounts[0].required);
 const one=obligations.map(o=>requirement([o])).reduce(max),both=requirement(obligations);
 assert(one<both);
 const first=jobs.find(j=>j.kind==='SHORT'),request=await f.short.connect(f.executor).processShort.populateTransaction(first.id,0,chunks[0],{type:2,maxFeePerGas:2000000000n,maxPriorityFeePerGas:0n,gasLimit:ops.network.gasUnits.processShort});
 const gate=async(profile,req=request,action='processShort')=>checkExecutionBudget({ops:profile,provider:f.provider,short:f.short,monthly:f.monthly,publisher:f.admin,executor:f.executor,prizeExecutor:f.admin,chunkSize:64,request:req,action,worker:'draw'});
 await rpc('hardhat_setBalance',[address,ethers.toBeHex(one)]);
 assert.equal((await gate(ops)).reason,'nativeFunding');
 await sent(f.admin.sendTransaction({to:address,value:both-one}));assert.equal((await gate(ops)).ready,true);
 const low=structuredClone(ops);for(const action of Object.keys(low.network.gasUnits))low.network.gasUnits[action]='1';
 const lowNeed=BigInt(evaluateBudget(low,{balances:{[address]:'0'},obligations}).accounts[0].required);
 await rpc('hardhat_setBalance',[address,ethers.toBeHex(lowNeed)]);
 assert.equal((await gate(low,{...request,gasLimit:1n})).ready,true);
 low.network.gasUnits.processShort=String(actions.processShort.maxEstimate);
 assert.equal((await gate(low,{...request,gasLimit:actions.processShort.maxEstimate})).reason,'nativeFunding');
 await sent(f.admin.sendTransaction({to:address,value:both-lowNeed}));
 const statePath=path.join(out,'boundary-state.json');assert(!fs.existsSync(statePath),'Use a fresh output directory for calibration');
 let invocations=0,gasTotal=0n;const children=[];
 const server=require('node:http').createServer(async(req,res)=>{
  try{let body='';for await(const part of req)body+=part;const data=JSON.parse(body);
   const handle=async q=>{try{return {jsonrpc:'2.0',id:q.id,result:await rpc(q.method,q.params)};}catch(e){return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:e.message}};}};
   res.setHeader('content-type','application/json');res.end(JSON.stringify(Array.isArray(data)?await Promise.all(data.map(handle)):await handle(data)));
  }catch(e){res.statusCode=500;res.end(e.message);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const configFile=path.join(out,'boundary-client.json');
 const execFile=require('node:util').promisify(require('node:child_process').execFile);
 try{
 fs.writeFileSync(configFile,serialize({rpcUrl:'http://127.0.0.1:'+server.address().port,statePath,short:f.short.target,monthly:f.monthly.target,jobs,chunks,ops}));

  for(let step=0;step<=chunks.length;step++)for(const j of jobs){
   await rpc('hardhat_setNextBlockBaseFeePerGas',[ethers.toBeHex(2000000000n)]);
   const result=await execFile(process.execPath,['scripts/calibration-chunk-client.cjs',configFile,j.kind],{timeout:60000});
   const row=JSON.parse(result.stdout);assert.equal(row.index,step);assert(!fs.existsSync(statePath+'.lock'));
   children.push(row);gasTotal+=BigInt(row.gasUsed);invocations++;
  }
 }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
 assert.equal(new Set(children.map(c=>c.transactionHash)).size,invocations);
 fs.writeFileSync(path.join(out,'boundary-children.json'),serialize(children));
 assert.equal(await f.short.pendingDatasetDraw(),ethers.ZeroHash);assert.equal(await f.monthly.pendingMonth(),ethers.ZeroHash);
 assert.equal(await f.vault.reserved(f.quote.target),0n);
 assert.equal(both-await f.provider.getBalance(address),gasTotal*2000000000n);
 return {executionGas:gasTotal,fixedGasPrice:2000000000n,nativeSpent:gasTotal*2000000000n,singleDrawNative:one,bothDrawsNative:both,lowForecastNative:lowNeed,oneCannotFundBoth:true,lowEstimateWaitAndTopup:true,
  invocations,remainingNative:await f.provider.getBalance(address),restartScope:'fresh CLI child for every process/finish; persisted estimates, chain-read progress; clean exits only',childPids:children.map(c=>c.pid)};
}

if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
