// Local-fork integration harness. Constructor clock backdating and short lead are test-only.
const assert=require('node:assert/strict'),fs=require('node:fs'),{ethers}=require('ethers');
const {runInfinityWorker}=require('./infinity-worker.cjs'),{runDrandDelivery,fetchBeacon}=require('./drand-delivery-worker.cjs');
const sent=async p=>(await p).wait(),code=async(p,c)=>ethers.keccak256(await p.getCode(c.target));
const statePath=prefix=>{fs.mkdirSync('.local/logs',{recursive:true});return fs.mkdtempSync('.local/logs/'+prefix)+'/state.json';};
function compileFixture(){
 const file='contracts/ShortRulesEpochs.sol',original=fs.readFileSync(file,'utf8');
 const variant=original.replace('shortRulesStartedAt = block.timestamp;','shortRulesStartedAt = block.timestamp - 21601;').replace('lastShortTerminalAt = block.timestamp;','lastShortTerminalAt = block.timestamp - 21601;');
 assert.notEqual(original,variant);
 return require('./compile.cjs').compile({sourceOverrides:{[file]:variant},writeArtifacts:false});
}
async function deploy({compiled,provider,user,token,quote}){
 const owner=await user.getAddress();
 const create=async(name,args=[])=>{const a=compiled[name],c=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,user).deploy(...args);await c.waitForDeployment();return c;};
 const registry=await create('ParticipantRegistry'),nonce=await provider.getTransactionCount(owner);
 const random=await create('DrandRandomAdapter',[ethers.getCreateAddress({from:owner,nonce:nonce+1}),ethers.getCreateAddress({from:owner,nonce:nonce+2}),[60,30,5,20,15]]);
 const predicted=ethers.getCreateAddress({from:owner,nonce:nonce+3});
 const setup={vault:predicted,registry:registry.target,instance:ethers.id('Infinity payout short'),governor:owner,publisher:owner,provider:random.target,notice:3600,cutoffDelayBlocks:1,maxGasPrice:10n**12n,nativeFloor:10};
 // Force a payout exercise, NOT approved release odds. Seed is never searched or replaced.
 const rules={version:1,pNumerator:4294967294,pDenominator:4294967295,hNumerator:1,hDenominator:4294967295};
 const short=await create('LocalShortController',[{...setup,maxBudget:100_000000},rules,[7,5,3]]);
 const monthly=await create('LocalMonthlyController',[{...setup,instance:ethers.id('Infinity payout monthly'),interval:30*86400},rules]);
 const vault=await create('DualControllerPromoVault',[token,quote,short.target,monthly.target,100_000000]);assert.equal(vault.target,predicted);
 return {compiled,registry,random,short,monthly,vault};
}
async function fund({e,provider,user,quote,payout}){
 const {collector,source,vault}=payout,anchor=await provider.getBlock('latest'),cp=await collector.policy(1);
 assert.equal(await quote.balanceOf(vault.target),0n);
 const due=await source.claimable(collector.target,quote.target),old=await collector.credit(vault.target),total=old+due;
 assert.equal(due,6000000n);assert.equal(old,BigInt(e.result.receiverUSDG));
 const job={schema:'local-infinity-worker-v1',chainId:31337,collector:collector.target,token:e.launch.token,quote:quote.target,promo:vault.target,source:source.target,collectorCodeHash:await code(provider,collector),sourceFingerprint:await collector.sourceFingerprint(),anchor:{number:anchor.number,hash:anchor.hash},campaignId:'1',recipients:Array.from(cp.recipients),bps:Array.from(cp.bps,Number),legacy:[],maxGasPrice:'1000000000000',nativeFloor:'1000000000000',gasUnits:{pull:'600000',pay:'600000'},pollSeconds:60};
 const options={provider,collector:collector.connect(provider),executor:user,job,statePath:statePath('infinity-payout-funding-')};
 const run=await runInfinityWorker(options);assert.equal(run.status,'complete',JSON.stringify(run));assert.deepEqual(run.steps.map(s=>s.action),['pull','pay']);
 assert.equal(await quote.balanceOf(vault.target),total);assert.equal(await collector.received(1),total);assert.equal(await collector.accounted(),0n);
 const again=await runInfinityWorker(options);assert.equal(again.steps.length,0);assert.equal(again.status,'complete');
 const reserves=[await vault.freeShort(),await vault.freeCurrent(),await vault.freeNext()];assert.equal(reserves.reduce((a,b)=>a+b),total);assert(reserves[0]>=5000000n);
 e.payout={funding:{job,run,again,total,oldCredit:old,newFees:due,reserves},assumptions:['Buyer USDG injected into fork storage, not into prize vault','100% creator fees to Promo fixture; 3% source fee real','Near-certain test odds with one buyer; no seed search/reroll','ShortRulesEpochs constructor-only compiled override: both initial timestamps backdated21601s; repository Solidity unchanged; live beacon lead60s','Monthly entries retained; monthly draw not executed']};
}
async function finish({e,provider,user,quote,payout,rpc,tick,job,config,rpcUrl,lifecycle}){
 const {short,monthly,random,vault}=payout;
 // Use real wall-clock observation and live beacon, without monkeypatching production gates.
 let now=Math.floor(Date.now()/1000),head=await provider.getBlock('latest');
 assert(head.timestamp<now+10,'Local fork advanced too far ahead of wall clock');
 if(head.timestamp>=now)await new Promise(r=>setTimeout(r,(head.timestamp-now+1)*1000));
 await rpc('evm_setNextBlockTimestamp',[Math.floor(Date.now()/1000)]);await rpc('evm_mine');
 const sealed=await tick();assert.equal(sealed.results.SHORT.action,'seal',JSON.stringify(sealed));
 const id=await short.drawRequest(job.artifact.request.drawId),request=await random.requests(id);
 const target=1727521075+(Number(request.round)-1)*3;
 const waitMs=Math.max(0,(target+2)*1000-Date.now());assert(waitMs<75000,'Unexpected RNG wait');
 console.log('payout: waiting exact drand round '+request.round+' ('+Math.ceil(waitMs/1000)+'s)');
 await new Promise(r=>setTimeout(r,waitMs));
 const exact=await fetchBeacon(String(request.round));assert.equal(await random.verify(request.round,'0x'+exact.signature),true);
 await rpc('evm_setNextBlockTimestamp',[Math.max(target+2,Math.floor(Date.now()/1000))]);await rpc('evm_mine');
 const anchor=await provider.getBlock('latest'),deliveryJob={schema:'local-drand-delivery-v1',chainId:31337,adapter:random.target,short:short.target,monthly:monthly.target,adapterCodeHash:await code(provider,random),shortCodeHash:await code(provider,short),monthlyCodeHash:await code(provider,monthly),anchor:{number:anchor.number,hash:anchor.hash},maxGasPrice:'1000000000000',nativeFloor:'1000000000000',gasUnits:{prove:'400000',deliver:'400000'},pollSeconds:10};
 const options={provider,adapter:random.connect(provider),executor:user,job:deliveryJob,statePath:statePath('infinity-payout-rng-')};
 // Default worker HTTP path is exercised; exact signed response also saved as evidence.
 const delivered=await runDrandDelivery(options);assert.equal(delivered.status,'complete',JSON.stringify(delivered));assert.deepEqual(delivered.steps.map(s=>s.action),['prove','deliver']);
 const again=await runDrandDelivery(options);assert.equal(again.steps.length,0);assert.equal(again.status,'complete');
 const drawId=job.artifact.request.drawId;
 let terminal=false;
 for(let i=0;i<10;i++){const r=await tick();assert.notEqual(r.status,'error',JSON.stringify(r));if(await short.pendingDatasetDraw()===ethers.ZeroHash){terminal=true;break;}}
 assert(terminal,'Short did not finish');
 const result=await short.shortResult(drawId),winners=[...new Set(result.winners.filter(w=>w!==ethers.ZeroAddress))];assert.equal(winners.length,1);
 const claims=[];for(const winner of winners){const amount=await vault.reward(drawId,winner);assert(amount>0n);const before=await quote.balanceOf(winner),r=await sent(vault.claim(drawId,winner));assert.equal(await quote.balanceOf(winner)-before,amount);assert.equal(await vault.reward(drawId,winner),0n);await assert.rejects(vault.claim(drawId,winner));claims.push({winner,amount,transactionHash:r.hash});}
 const reserves=[await vault.freeShort(),await vault.freeCurrent(),await vault.freeNext()],paid=claims.reduce((a,c)=>a+c.amount,0n),balance=await quote.balanceOf(vault.target);
 assert.equal(await vault.reserved(quote.target),0n);assert.equal(await vault.claimable(quote.target),0n);assert.equal(reserves.reduce((a,b)=>a+b),balance);assert.equal(balance+paid,e.payout.funding.total);
 assert.equal(reserves[1],e.payout.funding.reserves[1]);assert.equal(reserves[2],e.payout.funding.reserves[2]);
 const {resolveBuyPolicy}=require('./buy-policy-runtime.cjs'),{scan}=require('./replay-direct-buy.cjs'),{replayAttempts}=require('./attempt-lifecycle.cjs');
 const resolved=await resolveBuyPolicy(config,rpc),scanned=await scan(resolved.manifest,rpcUrl,resolved.admission.checkpoint.number,lifecycle),ledger=replayAttempts(resolved.manifest,lifecycle,scanned.blocks);
 assert.equal(ledger.wallets.length,1);assert.equal(ledger.wallets[0].SHORT.consumedTotal,'2');assert.equal(ledger.wallets[0].SHORT.open,'0');assert.equal(ledger.wallets[0].MONTHLY.open,'2');
 e.payout.finalReplay={manifest:resolved.manifest,lifecycle,blocks:scanned.blocks,ledger};
 // The scheduler independently recovers/verifies result before finish.
 Object.assign(e.payout,{delivery:{job:deliveryJob,run:delivered,again,requestId:String(id),request:{consumer:request.consumer,context:request.context,round:String(request.round)},beacon:exact},drawId,result:{winners:Array.from(result.winners),resultHash:result.resultHash},claims,paid,balance,reserves,reserved:'0',claimable:'0',conserved:true});
}
module.exports={compileFixture,deploy,fund,finish};
