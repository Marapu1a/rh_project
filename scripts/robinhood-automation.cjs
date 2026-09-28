// Robinhood entrypoint. Production broadcasts remain disabled; rehearsal is local Hardhat only.
const {withRobinhoodNetwork,executionAdmission}=require('./runtime-network.cjs');
const {prepareRuntime,runPromoAutomation}=require('./promo-automation.cjs');
const {inspectDeployment}=require('./deployment-admission.cjs');
const {retryableRead}=require('./local-rpc-watch.cjs');
async function runRobinhoodAutomation(options,hooks={}){
 const {mode='robinhood-inspect'}=options;
 if(options.deploymentProfile?.scope!=='public-launch'||options.deploymentProfile.chainId!=='4663')throw Error('Pinned public Robinhood deployment profile required');
 try{return await withRobinhoodNetwork({...options,mode},async()=>{
  if(mode==='robinhood-rehearsal'){
   const result=await runPromoAutomation(options,hooks);
   return {...result,executionScope:'local-robinhood-rehearsal',publicLaunchReady:false};
  }
  await prepareRuntime(options);
  const admission=executionAdmission(await inspectDeployment(options.provider,options.deploymentProfile,options));
  if(admission.retryableRpcRead)return {status:'waiting',reason:'rpcUnavailable',retryableRpcRead:true,publicLaunchReady:false};
  if(admission.detail)admission.detail='Deployment observation unavailable; verify endpoint and pins';
  return {status:'blocked',reason:'publicExecutionDisabled',admission,publicLaunchReady:false};
 });}catch(e){if(retryableRead(e))return {status:'waiting',reason:'rpcUnavailable',retryableRpcRead:true,publicLaunchReady:false};throw e;}
}
module.exports={runRobinhoodAutomation};
