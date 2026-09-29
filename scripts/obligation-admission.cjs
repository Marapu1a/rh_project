// Admission for already frozen obligations. Never consults the revenue source or BUY policy.
const {ethers}=require('ethers'),{validateDeploymentProfile}=require('./deployment-admission.cjs');
const {domainFor}=require('./attempt-lifecycle.cjs'),{verifyDualBindings}=require('./dual-bindings.cjs');
async function inspectObligations(provider,profile,config){
 validateDeploymentProfile(profile,config);
 const reasons=[],out=()=>({status:reasons.length?'blocked':'matched',reasons,publicLaunchReady:false});
 try{
  if(profile.scope!=='public-launch'||profile.chainId!=='4663'||String((await provider.getNetwork()).chainId)!=='4663')throw Error('Obligation chain mismatch');
  const head=await provider.getBlock('latest');if(!head)throw Error('Missing head');
  for(const key of ['token','quote','registry','vault','short','monthly','adapter']){
   const [address,digest]=profile.pins[key],code=await provider.getCode(address,head.number);
   if(code==='0x'||ethers.keccak256(code).toLowerCase()!==digest.toLowerCase())throw Error('Obligation runtime mismatch: '+key);
  }
  await verifyDualBindings(provider,domainFor(config.schedulerConfig.manifest,config.schedulerConfig.lifecycle));
  const at={blockTag:head.number},read=async(key,method,type='address')=>new ethers.Contract(profile.pins[key][0],[`function ${method}() view returns(${type})`],provider)[method](at);
  const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
  for(const kind of ['short','monthly']){
   if(!same(await read(kind,'randomProvider'),profile.pins.adapter[0])||!same(await read('adapter',kind+'Consumer'),profile.pins[kind][0]))throw Error('Obligation RNG binding mismatch');
   if(await read(kind,'CONTROLLER_PROFILE','bytes32')!==ethers.id('promo-robinhood-'+kind+'-drand-'+(kind==='monthly'?'v2':'v1')))throw Error('Obligation controller generation mismatch');
  }
  if(await read('adapter','PROFILE','bytes32')!==require('./drand-preflight.cjs').PROFILE||await read('adapter','CHAIN_HASH','bytes32')!=='0x04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3')throw Error('Obligation RNG profile mismatch');
  for(const anchor of [config.deliveryJob.anchor,config.schedulerConfig.manifest.anchor])if((await provider.getBlock(anchor.number))?.hash!==anchor.hash)throw Error('Obligation anchor mismatch');
  if((await provider.getBlock(head.number))?.hash!==head.hash)throw Error('Obligation observation changed');
  return {...out(),observedAtBlock:{number:head.number,hash:head.hash}};
 }catch(e){reasons.push('obligationObservationRejected');return {...out(),detail:'Critical deployment observation rejected',retryableRpcRead:require('./local-rpc-watch.cjs').retryableRead(e)};}
}
const OBLIGATION_ACTIONS=new Set(['prove','deliver','processShort','finishShort','processMonth','finishMonth','claim']);
module.exports={inspectObligations,OBLIGATION_ACTIONS};
