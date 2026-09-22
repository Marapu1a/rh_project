// Pure identity builder shared by runtime and inspection manifest tooling. No RPC/state access.
const path=require('node:path'),{ethers}=require('ethers');
const {validateOps}=require('./local-execution-budget.cjs');
const {refillDomainHash}=require('./local-native-refill.cjs');
const {validatePrizeFlowJob}=require('./local-prize-flow.cjs');
const {validateConfig}=require('./local-promo-scheduler.cjs');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
function buildCoordinatorIdentity({prizeJob,schedulerConfig,schedulerState,roles,ops,nativeRefill}){
 validatePrizeFlowJob(prizeJob);validateConfig(schedulerConfig,'http://127.0.0.1');
 check(same(prizeJob.active.vault,schedulerConfig.lifecycle.vault)&&same(prizeJob.token,schedulerConfig.manifest.token)&&same(prizeJob.quote,schedulerConfig.manifest.quote),'Prize and draw deployment mismatch');
 check(roles&&ethers.isAddress(roles.prizeExecutor)&&ethers.isAddress(roles.executor)&&(!roles.publisher||ethers.isAddress(roles.publisher)),'Invalid execution roles');
 if(ops)validateOps(ops);
 const addresses=[...new Set([roles.prizeExecutor,roles.executor,roles.publisher].filter(Boolean).map(a=>a.toLowerCase()))].sort();
 const legacyConfig={schema:'local-coordinator-v1',prize:prizeJob,scheduler:schedulerConfig,schedulerState:path.resolve(schedulerState),addresses};
 let config=legacyConfig;
 if(ops){const {pollSeconds,maxGasPrice,...identity}=prizeJob;config={...legacyConfig,schema:'local-coordinator-budget-v1',prize:identity,network:ops.network,
  roles:{prizeExecutor:roles.prizeExecutor,executor:roles.executor,publisher:roles.publisher||null}};}
 const budgetConfig=config;let refillInput;
 if(nativeRefill){
  check(ops&&ops.network.feeModel==='LOCAL_EIP1559','Refill requires plain local ops profile');
  const {source,policy,protectedAddresses=[]}=nativeRefill;
  check(source?.kind==='BOOTSTRAP_NATIVE','Only bootstrap refill supported');
  const controllers=[schedulerConfig.lifecycle.source,schedulerConfig.lifecycle.monthlySource];
  check(![...addresses,...controllers].some(a=>same(a,source.address)),'Dedicated refill source required');
  refillInput=JSON.parse(JSON.stringify({ops,source,policy,protectedAddresses:[...new Set([...protectedAddresses,
   prizeJob.active.vault,prizeJob.router,prizeJob.active.address].filter(Boolean).map(a=>a.toLowerCase()))].sort()}));
  config={...config,nativeRefill:{domainHash:refillDomainHash(refillInput),source:source.address.toLowerCase()}};
  check([...addresses,...controllers].every(a=>refillInput.policy.targets.some(t=>same(t.address,a))),'Funding targets must cover all execution signers and controllers');
 }
 return {config,legacyConfig,budgetConfig,refillInput,addresses};
}
module.exports={buildCoordinatorIdentity};
