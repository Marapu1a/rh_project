// Fresh Infinity fork proof of the continuous Short executor. No harness claim/prove/deliver.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {runShortAutomation,ACTIONS}=require('./short-automation.cjs'),{runWatch}=require('./local-rpc-watch.cjs');
const {resolveBuyPolicy}=require('./buy-policy-runtime.cjs'),{scan}=require('./replay-direct-buy.cjs'),{buildFromHistory}=require('./short-dataset.cjs'),{hash}=require('./direct-buy.cjs'),{replayAttempts}=require('./attempt-lifecycle.cjs');
async function run({e,provider,user,quote,payout,rpc,config,rpcUrl}){
 const {collector,source,random,short,monthly,vault}=payout,anchor=await provider.getBlock('latest'),cp=await collector.policy(1),code=async c=>ethers.keccak256(await provider.getCode(c.target));
 const total=await collector.credit(vault.target)+await source.claimable(collector.target,quote.target);assert.equal(await quote.balanceOf(vault.target),0n);
 const fundingJob={schema:'local-infinity-worker-v1',chainId:31337,collector:collector.target,token:e.launch.token,quote:quote.target,promo:vault.target,source:source.target,collectorCodeHash:await code(collector),sourceFingerprint:await collector.sourceFingerprint(),anchor:{number:anchor.number,hash:anchor.hash},campaignId:'1',recipients:Array.from(cp.recipients),bps:Array.from(cp.bps,Number),legacy:[],maxGasPrice:'1000000000000',nativeFloor:'1000000000000',gasUnits:{pull:'600000',pay:'600000'},pollSeconds:60};
 const deliveryJob={schema:'local-drand-delivery-v1',chainId:31337,adapter:random.target,short:short.target,monthly:monthly.target,adapterCodeHash:await code(random),shortCodeHash:await code(short),monthlyCodeHash:await code(monthly),anchor:fundingJob.anchor,maxGasPrice:fundingJob.maxGasPrice,nativeFloor:fundingJob.nativeFloor,gasUnits:{prove:'500000',deliver:'500000'},pollSeconds:10};
 const ops={schema:'local-short-automation-v1',maxGasPrice:fundingJob.maxGasPrice,reserveGasPrice:fundingJob.maxGasPrice,nativeFloor:fundingJob.nativeFloor,extraFeePerTx:'0',safetyBps:12000,maxTransactions:32,maxClaims:64,scanBlocks:2000,pollSeconds:3,gasUnits:Object.fromEntries(ACTIONS.map(a=>[a,'3000000']))};
 fs.mkdirSync('.local/logs',{recursive:true});const dir=fs.mkdtempSync('.local/logs/infinity-automation-'),statePath=dir+'/state.json';
 const savedConfig={fundingJob,deliveryJob,schedulerConfig:config,ops};fs.writeFileSync(dir+'/config.json',JSON.stringify(savedConfig,null,2));
 const stop=new AbortController(),options={...savedConfig,provider,executor:user,collector:collector.connect(provider),adapter:random.connect(provider),short:short.connect(provider),monthly:monthly.connect(provider),vault:vault.connect(provider),rpcUrl,statePath,signal:stop.signal};
 const x=e.automation={config:savedConfig,runs:[],events:[],total:String(total),assumptions:['Same constructor clock override/test odds as --payout; no manual claim or RNG delivery','Sandbox funds buyer only; live Infinity source and live drand HTTP','Programmatic continuous runWatch; separate CLI argument tests, no public sends']};
 const winner=await user.getAddress(),before=await quote.balanceOf(winner);let mining=false,minerError;
 // Keep the LOCAL chain clock moving while real drand publishes its future round.
 const mine=async()=>{if(mining)return;mining=true;try{await rpc('evm_mine');}catch(err){minerError=err;stop.abort();}finally{mining=false;}};
 await mine();const timer=setInterval(mine,1000),deadline=setTimeout(()=>stop.abort(),240000);let exit;
 try{exit=await runWatch({watch:true,pollMs:3000,signal:stop.signal,pass:async()=>{
   const r=await runShortAutomation(options,{onStep:s=>x.events.push(s)});x.runs.push(r);console.log('automation pass '+x.runs.length+': '+r.status+' '+(r.reason||''));
   if(r.steps.some(s=>s.action==='claim'&&s.status===1))stop.abort();return r;
 }});}finally{clearInterval(timer);clearTimeout(deadline);while(mining)await new Promise(r=>setTimeout(r,10));}
 if(minerError)throw minerError;assert.equal(exit,0,JSON.stringify(x.runs.at(-1)));
 const paid=await quote.balanceOf(winner)-before;assert(paid>0n,'No automatic payout before deadline');
 const state=JSON.parse(fs.readFileSync(statePath)),schedulerState=JSON.parse(fs.readFileSync(statePath+'.scheduler')),job=schedulerState.jobs.SHORT[0].job,drawId=job.artifact.request.drawId;
 assert.equal(await vault.reward(drawId,winner),0n);assert.equal(await vault.reserved(quote.target),0n);assert.equal(await vault.claimable(quote.target),0n);assert.equal(state.payouts.length,0);assert(!state.pending);
 const balance=await quote.balanceOf(vault.target);assert.equal(balance+paid,total);
 const nonce=await provider.getTransactionCount(winner),again=await runShortAutomation({...options,signal:undefined});assert.equal(again.steps.length,0);assert.equal(await provider.getTransactionCount(winner),nonce);
 const resolved=await resolveBuyPolicy(config,rpc),blocks=(await scan(resolved.manifest,rpcUrl,resolved.admission.checkpoint.number,config.lifecycle)).blocks,ledger=replayAttempts(resolved.manifest,config.lifecycle,blocks);
 assert.equal(ledger.wallets[0].SHORT.consumedTotal,'2');assert.equal(ledger.wallets[0].MONTHLY.open,'2');
 const historical=await resolveBuyPolicy(config,rpc,Number(job.artifact.request.cutoffBlockNumber)),history=(await scan(historical.manifest,rpcUrl,job.artifact.request.cutoffBlockNumber,config.lifecycle)).blocks;
 const input={manifest:historical.manifest,lifecycle:config.lifecycle,blocks:history,request:job.artifact.request,rules:job.artifact.rules,weights:job.artifact.weights,minimumUnit:job.artifact.minimumUnit};assert.equal(hash(buildFromHistory(input)),hash(job.artifact));
 e.entries.replayInput=input;e.entries.artifact=job.artifact;
 const requestId=await short.drawRequest(drawId),request=await random.requests(requestId);assert(request.proven&&request.delivered);
 Object.assign(x,{paid:String(paid),balance:String(balance),drawId,winner,requestId:String(requestId),round:String(request.round),state,again,finalReplay:{manifest:resolved.manifest,lifecycle:config.lifecycle,blocks,ledger},reserves:[String(await vault.freeShort()),String(await vault.freeCurrent()),String(await vault.freeNext())]});
}
module.exports={run};
