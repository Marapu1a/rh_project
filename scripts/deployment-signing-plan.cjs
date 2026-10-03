// Reconstruct ONLY the six pre-launch CREATE calls. Never export fork policy anchors.
const {ethers:E}=require('ethers'),{hash}=require('./direct-buy.cjs');
const assert=require('node:assert/strict');
async function build(report,settings,product,compiled,layout){
 assert.equal(report.status,'EXACT_DEPLOYMENT_FORK_PASSED');assert.equal(report.publicSends,false);
 assert.equal(report.settingsHash,hash(settings));assert.equal(report.artifactHash,hash(compiled));
 assert.equal(layout?.schema,'qianqi-timestamp-immutables-v1');assert.equal(layout.artifactHash,hash(compiled));
 const governor=settings.roles.governor,nonce=report.startNonce;
 assert(Number.isSafeInteger(nonce)&&nonce>=0);
 const address=i=>E.getCreateAddress({from:governor,nonce:nonce+i});
 const salt=E.id('QIANQI deployment candidate '+report.forkAnchor.hash+' '+nonce);assert.equal(salt,report.launchSalt);
 const instance=E.id('QIANQI Short '+salt),monthlyInstance=E.id('QIANQI Monthly '+salt);
 const quote=product.contracts.quote.address,escrow=report.config.escrow;
 const setup={vault:address(5),registry:address(0),governor,publisher:settings.roles.executor,provider:address(2),notice:settings.rulesNoticeSeconds,cutoffDelayBlocks:settings.timing.cutoffDelayBlocks,maxGasPrice:settings.maxGasPrice,nativeFloor:settings.nativeFloor};
 const specs=[['ParticipantRegistry',[]],['LocalPonsCollector',[governor,report.predictedToken,quote,escrow]],
  ['DrandRandomAdapter',[address(3),address(4),[settings.timing.leadSeconds,settings.timing.maxClockLag,settings.timing.maxClockAhead,settings.timing.maxFinalizedLag,settings.timing.maxBeaconLag]]],
  ['RobinhoodShortController',[{...setup,instance,maxBudget:E.MaxUint256},product.unresolved.shortRules,product.unresolved.shortWeights,product.unresolved.minimumUnitRaw]],
  ['RobinhoodMonthlyController',[{...setup,instance:monthlyInstance,interval:settings.timing.monthlyInterval},product.unresolved.monthlyRules]],
  ['DualControllerPromoVault',[report.predictedToken,quote,address(3),address(4),'100000000']]];
 const runtimeHashes=[report.config.manifest.codeHashes.registry,report.config.codeHashes.collector,report.config.deliveryJob.adapterCodeHash,report.config.lifecycle.sourceCodeHash,report.config.lifecycle.monthlySourceCodeHash,report.config.lifecycle.vaultCodeHash];
 const transactions=[];
 for(let i=0;i<specs.length;i++){
  const [name,args]=specs[i],artifact=compiled[name],generated=await new E.ContractFactory(artifact.abi,artifact.evm.bytecode.object).getDeployTransaction(...args),row=report.transactions[i];
  assert.equal(row.label,'deploy '+name);assert.equal(row.request.to,undefined);assert.equal(row.request.from.toLowerCase(),governor.toLowerCase());
  assert.equal(Number(row.request.nonce),nonce+i);assert.equal(Number(row.request.chainId),4663);assert.equal(BigInt(row.request.value),0n);
  assert.equal(generated.data,row.request.data);assert.equal(row.contractAddress,address(i));assert.match(runtimeHashes[i],/^0x[0-9a-f]{64}$/);
  const timestamp=i===3?report.config.lifecycle.shortRules.startedAt:i===4?report.config.lifecycle.monthlyPolicy.startedAt:null;
  const timestampLayout=timestamp?{...layout.contracts[name],rehearsalTimestamp:timestamp}:null;
  if(timestamp)assert(timestampLayout.references?.length);
  transactions.push({label:row.label,predictedAddress:address(i),expectedRuntimeHash:runtimeHashes[i],...(timestampLayout?{timestampLayout}:{}),request:{from:governor,chainId:'0x1237',nonce:E.toQuantity(nonce+i),value:'0x0',data:generated.data}});
 }
 const result={schema:'qianqi-construction-prefix-v1',chainId:4663,settingsHash:hash(settings),artifactHash:hash(compiled),governor,startNonce:nonce,maxGasPrice:settings.maxGasPrice,token:report.predictedToken,curve:report.predictedCurve,salt,economics:report.economics,launchFeeWei:report.launchFeeWei,transactions,authorizationToSend:false,
  next:'STOP after vault: prepare Pons launch and derive policy genesis from actual canonical receipts; never replay fork policy calldata'};
 return {...result,planHash:hash(result)};
}
function validate(plan){
 const {planHash,...body}=plan;assert.equal(planHash,hash(body));assert.equal(plan.schema,'qianqi-construction-prefix-v1');assert.equal(plan.authorizationToSend,false);assert.equal(plan.transactions.length,6);
 assert.equal(plan.chainId,4663);assert(E.isAddress(plan.governor));assert(Number.isSafeInteger(plan.startNonce)&&plan.startNonce>=0);assert(/^\d+$/.test(plan.maxGasPrice)&&BigInt(plan.maxGasPrice)>0n);
 for(const [i,step]of plan.transactions.entries()){
  const r=step.request;assert.deepEqual(Object.keys(r).sort(),['chainId','data','from','nonce','value']);
  assert.equal(r.from.toLowerCase(),plan.governor.toLowerCase());assert.equal(r.chainId,'0x1237');assert.equal(r.value,'0x0');assert.equal(BigInt(r.nonce),BigInt(plan.startNonce+i));
  assert(/^0x(?:[0-9a-f]{2})+$/i.test(r.data));assert.equal(step.predictedAddress,E.getCreateAddress({from:plan.governor,nonce:plan.startNonce+i}));assert.match(step.expectedRuntimeHash,/^0x[0-9a-f]{64}$/);
 }
}
module.exports={build,validate};
if(require.main===module)(async()=>{
 const fs=require('node:fs'),[reportFile,artifactFile,layoutFile,output]=process.argv.slice(2);
 if(!reportFile||!artifactFile||!layoutFile||!output||fs.existsSync(output))throw Error('New output required');
 const plan=await build(JSON.parse(fs.readFileSync(reportFile)),require('../config/pons-deployment-candidate.json'),require('../config/robinhood-launch-plan.json'),JSON.parse(fs.readFileSync(artifactFile)),JSON.parse(fs.readFileSync(layoutFile)));
 fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({planHash:plan.planHash,steps:plan.transactions.length,authorizationToSend:false}));
})().catch(()=>{console.error('Signing plan refused; check rehearsal/settings/artifacts');process.exitCode=1;});
