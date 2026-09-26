// Fork harness artifact only. Captured pins are a candidate, never automatic operator approval.
const {ethers}=require('ethers'),{hash}=require('./direct-buy.cjs');
const {inspectSource,SLOT,validateManifest}=require('./pair-source-health.cjs');
async function run({e,provider,router,pins,addresses}){
 const block=await provider.getBlock('latest'),at=block.number;
 const quoteSlot=await provider.getStorage(e.preflight.quote,SLOT,at);
 const quoteImplementation=ethers.getAddress('0x'+quoteSlot.slice(-40));
 if(quoteImplementation===ethers.ZeroAddress)throw Error('This harness requires the verified USDG EIP-1967 profile; do not infer direct code');
 const deployments={token:e.bootstrap.token,quote:e.preflight.quote,feeRouter:router.target,vault:e.binding.vault,
  positionManager:e.binding.positionManager,hook:e.binding.poolKey[4],poolManager:e.binding.manager,registry:addresses.modeRegistry};
 const contracts={};
 for(const [role,address]of Object.entries(deployments)){
  let implementation=null;
  if(role==='token')implementation={kind:'eip1167',address:pins.tokenImplementation.address,codeHash:pins.tokenImplementation.hash};
  if(role==='quote')implementation={kind:'eip1967',address:quoteImplementation,codeHash:ethers.keccak256(await provider.getCode(quoteImplementation,at))};
  contracts[role]={address,codeHash:ethers.keccak256(await provider.getCode(address,at)),implementation};
 }
 const manifest={schema:'pair-source-health-v1',chainId:'31337',anchor:{number:at,hash:block.hash},contracts,
  positionId:String(e.binding.position),sourceEpoch:'1',poolKey:e.binding.poolKey.map((x,i)=>i===2||i===3?Number(x):x),
  futureLaunch:{coordinator:addresses.coordinator,handler:addresses.feeSharingMode,version:'5'}};
 const expectedHash=hash(manifest);validateManifest(manifest,expectedHash);
 const report=await inspectSource({provider,manifest,expectedHash});
 e.health={status:'candidate-only-local-fork',manifest,expectedHash,report};
 if(report.status!=='match'||report.issues.length)throw Error('New deployment health mismatch: '+JSON.stringify(report.issues));
}
module.exports={run};
